"""Page Facebook de bfmobility animée par Liluvine (SAWALI) — véhicules proposés à la publication.

Demande du propriétaire (12/10/2026) : « Publication Facebook pour ZandGo, adLyn et bfmobility comme nous l'avons
fait pour beAuthentik. » Choix : « Produits + annonces de lancement ».

Pour un développeur WinDev : ce fichier est la « procédure globale » du partage Facebook. SAWALI interroge
bfmobility par le canal signé existant (route /api/webhooks/liluvine-retour, clé LILUVINE_WA_HMAC), fait relire les
textes par l'IA, puis publie sur la Page Facebook de bfmobility connectée dans SAWALI.
  {"type": "facebook_candidats", "nombre": 3}                     → {"candidats": [...]}
  {"type": "facebook_publie", "element_id": "…", "post_id": "…"}  → {"ok": true}

Règles :
  - seuls les véhicules DISPONIBLES, d'une classe (catégorie) active, avec au moins une photo, sont proposés ;
  - on ne transmet que ce que montre déjà la page publique du véhicule (lot 16) : marque, modèle, année, classe,
    description, tarifs de la classe, photo et lien vers la page du véhicule — JAMAIS l'immatriculation, le
    chauffeur, les documents ni aucune donnée personnelle ;
  - l'adresse de la photo est ABSOLUE (Facebook la télécharge lui-même) : PUBLIC_API_URL si elle est réglée, sinon
    l'adresse par laquelle SAWALI a appelé le serveur (https derrière Render) ;
  - un même véhicule n'est pas reproposé avant DELAI_REPUBLICATION_JOURS jours (date notée par facebook_publie).
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import Request

from config import get_settings
from db import db

TYPE_CANDIDATS = "facebook_candidats"
TYPE_PUBLIE = "facebook_publie"
TYPES = (TYPE_CANDIDATS, TYPE_PUBLIE)
DELAI_REPUBLICATION_JOURS = 30     # un même véhicule n'est pas republié avant 30 jours
NOMBRE_MAX = 15                    # au plus 15 candidats par demande


def _maintenant() -> datetime:
    return datetime.now(timezone.utc)


def _montant(valeur: Any) -> Optional[str]:
    """35000 → « 35 000 F CFA » (None si le tarif est absent ou nul)."""
    try:
        n = int(round(float(valeur or 0)))
    except (TypeError, ValueError):
        return None
    return f"{n:,}".replace(",", " ") + " F CFA" if n > 0 else None


def tarif_texte(classe: Dict[str, Any]) -> str:
    """Tarifs de la classe du véhicule, tels qu'affichés sur le site : au km, à l'heure, à la journée."""
    morceaux = []
    for cle, unite in (("prix_km", "km"), ("prix_heure", "heure"), ("prix_jour", "jour")):
        m = _montant(classe.get(cle))
        if m:
            morceaux.append(f"{m} / {unite}")
    return " · ".join(morceaux) or "Tarif sur demande"


def url_api(request: Request) -> str:
    """Adresse publique du serveur, sans « / » final : PUBLIC_API_URL, sinon celle de la requête reçue
    (schéma https repris de l'en-tête X-Forwarded-Proto posé par Render)."""
    reglee = (getattr(get_settings(), "public_api_url", None) or "").strip().rstrip("/")
    if reglee:
        return reglee.removesuffix("/api")
    base = str(request.base_url).rstrip("/")
    proto = (request.headers.get("x-forwarded-proto") or "").split(",")[0].strip()
    if proto in ("http", "https") and "://" in base:
        base = f"{proto}://{base.split('://', 1)[1]}"
    return base


def _resume(texte: Optional[str], longueur: int = 300) -> str:
    """Description courte sur une ligne, coupée proprement."""
    texte = re.sub(r"\s+", " ", texte or "").strip()
    return texte if len(texte) <= longueur else texte[: longueur - 1].rsplit(" ", 1)[0].rstrip(" ,;:") + "…"


async def candidats(nombre: int, request: Request) -> List[Dict[str, Any]]:
    """Véhicules disponibles avec photo, d'une classe active, pas publiés depuis 30 jours.
    Les jamais publiés d'abord."""
    from routes.photos_vehicules import vues_publiques
    nombre = max(1, min(int(nombre or 3), NOMBRE_MAX))
    classes = {c["code"]: c async for c in db.categories.find({"actif": {"$ne": False}}, {"_id": 0})}
    limite = (_maintenant() - timedelta(days=DELAI_REPUBLICATION_JOURS)).isoformat()
    filtre = {
        "statut": "disponible", "categorie": {"$in": list(classes)}, "photos": {"$nin": [None, {}]},
        "$or": [{"facebook_publie_le": {"$exists": False}}, {"facebook_publie_le": None},
                {"facebook_publie_le": {"$lt": limite}}],
    }
    # Seuls les champs publics sont lus (jamais l'immatriculation ni le chauffeur)
    champs = {"_id": 0, "id": 1, "marque": 1, "modele": 1, "annee": 1, "categorie": 1, "description": 1, "photos": 1,
              "facebook_publie_le": 1}
    serveur, site = url_api(request), get_settings().public_site_url
    sortie: List[Dict[str, Any]] = []
    async for v in db.vehicules.find(filtre, champs).sort([("facebook_publie_le", 1), ("marque", 1)]):
        photos = vues_publiques(v.get("photos") or {})
        if not photos:
            continue
        classe = classes[v["categorie"]]
        nom = " ".join(str(x) for x in (v.get("marque"), v.get("modele"), v.get("annee")) if x).strip()
        sortie.append({
            "element_id": v["id"], "type": "vehicule", "nom": nom[:150] or "Véhicule",
            "classe": classe.get("nom") or "", "description": _resume(v.get("description")),
            "tarif_txt": tarif_texte(classe),
            "prix_fcfa": int(float(classe.get("prix_jour") or 0)) or None,      # tarif à la journée (indicatif)
            "photo_url": f"{serveur}{photos[0]['url']}", "lien": f"{site}/vehicule/{v['id']}",
        })
        if len(sortie) >= nombre:
            break
    return sortie


async def marquer_publie(element_id: Any, post_id: Any) -> bool:
    """Note la publication (date et identifiant du post Facebook) sur la fiche du véhicule."""
    r = await db.vehicules.update_one({"id": str(element_id or "")}, {"$set": {
        "facebook_publie_le": _maintenant().isoformat(), "facebook_post_id": (str(post_id) if post_id else None)}})
    return r.matched_count == 1


async def traiter(donnees: Dict[str, Any], request: Request) -> Dict[str, Any]:
    """Réponse aux demandes signées de SAWALI (types facebook_candidats / facebook_publie)."""
    if donnees.get("type") == TYPE_CANDIDATS:
        return {"candidats": await candidats(donnees.get("nombre") or 3, request)}
    return {"ok": await marquer_publie(donnees.get("element_id"), donnees.get("post_id"))}
