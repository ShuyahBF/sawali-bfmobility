"""Photos des véhicules (lot 9).

Demande du propriétaire (09/10/2026) : « Pour les véhicules permettre de charger 4 photos : vue de face, intérieur
cabine avant, intérieur cabine arrière, coffre. Sur le portail public un utilisateur peut visionner les photos,
zoomer et revenir faire sa sélection. »

Pour un développeur WinDev :
  - une photo = un enregistrement de la collection « photos_vehicules » (comme un fichier HFSQL avec une rubrique
    binaire) : identifiant, véhicule, vue (face / cabine_avant / cabine_arriere / coffre), type d'image et contenu ;
  - la fiche du véhicule garde un petit résumé « photos » : {vue: {id, maj_le}} (affichage rapide des listes) ;
  - chaque nouvel envoi crée un NOUVEL identifiant : l'adresse de l'image change, le navigateur ne montre donc
    jamais une ancienne photo gardée en cache ;
  - le navigateur réduit l'image avant l'envoi (≈ 1 600 px, JPEG) : le serveur refuse au-delà de 2 Mo ;
  - le portail public ne voit JAMAIS l'immatriculation ni le chauffeur : marque, modèle, couleur, énergie, places,
    confort et photos seulement.

Routes :
  GET    /api/admin/vehicules/{id}/photos            photos d'un véhicule (personnel du parc)
  PUT    /api/admin/vehicules/{id}/photos/{vue}       envoi / remplacement d'une photo (direction, exploitation)
  DELETE /api/admin/vehicules/{id}/photos/{vue}       suppression d'une photo
  GET    /api/public/categories/{code}/vehicules      véhicules d'une catégorie avec leurs photos (portail public)
  GET    /api/public/photos-vehicules/{id}            l'image elle-même
"""
from __future__ import annotations

import base64
import binascii
from typing import Any, Dict, List

from fastapi import APIRouter, Body, Depends, HTTPException, Response

from db import db
from metier import iso
from outils import nouvel_id
from securite import ATELIER, EQUIPE, exiger

router = APIRouter(tags=["Photos des véhicules"])

# Les 4 vues demandées, dans l'ordre d'affichage
VUES: Dict[str, str] = {
    "face": "Vue de face",
    "cabine_avant": "Intérieur cabine avant",
    "cabine_arriere": "Intérieur cabine arrière",
    "coffre": "Coffre",
}
TAILLE_MAX = 2 * 1024 * 1024   # 2 Mo par photo (après réduction par le navigateur)

# Signatures des formats acceptés (premiers octets du fichier)
SIGNATURES = (
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"\x89PNG\r\n\x1a\n", "image/png"),
)


def type_image(donnees: bytes) -> str:
    """Type MIME d'après les premiers octets (JPEG, PNG, WebP) ; vide si ce n'est pas une image acceptée."""
    for signature, mime in SIGNATURES:
        if donnees.startswith(signature):
            return mime
    if len(donnees) > 12 and donnees[:4] == b"RIFF" and donnees[8:12] == b"WEBP":
        return "image/webp"
    return ""


def decoder(image: str) -> bytes:
    """Image reçue en base64 (avec ou sans en-tête « data:image/…;base64, ») → octets ; 422 si illisible."""
    texte = (image or "").strip()
    if texte.startswith("data:"):
        texte = texte.split(",", 1)[-1]
    try:
        return base64.b64decode(texte, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=422, detail="Image illisible")


def vues_publiques(photos: Dict[str, Any]) -> List[Dict[str, str]]:
    """Résumé « photos » d'un véhicule → liste ordonnée {vue, libelle, url} (seulement les vues présentes)."""
    return [{"vue": v, "libelle": libelle, "url": f"/api/public/photos-vehicules/{photos[v]['id']}"}
            for v, libelle in VUES.items() if isinstance(photos.get(v), dict) and photos[v].get("id")]


async def vehicule_ou_404(vid: str) -> Dict[str, Any]:
    v = await db.vehicules.find_one({"id": vid}, {"_id": 0})
    if not v:
        raise HTTPException(status_code=404, detail="Véhicule introuvable")
    return v


def vue_ou_422(vue: str) -> str:
    if vue not in VUES:
        raise HTTPException(status_code=422, detail="Vue inconnue (face, cabine_avant, cabine_arriere ou coffre)")
    return vue


# ------------------------------------------------------------------------------------------------------------
# Back-office
# ------------------------------------------------------------------------------------------------------------
@router.get("/admin/vehicules/{vid}/photos")
async def lire_photos(vid: str, u: dict = Depends(exiger(*ATELIER))):
    """Les 4 emplacements du véhicule, remplis ou non."""
    v = await vehicule_ou_404(vid)
    photos = v.get("photos") or {}
    return {"vues": [{"vue": vue, "libelle": libelle,
                      "url": f"/api/public/photos-vehicules/{photos[vue]['id']}" if isinstance(photos.get(vue), dict) else None,
                      "maj_le": (photos.get(vue) or {}).get("maj_le") if isinstance(photos.get(vue), dict) else None}
                     for vue, libelle in VUES.items()]}


@router.put("/admin/vehicules/{vid}/photos/{vue}")
async def envoyer_photo(vid: str, vue: str, corps: Dict[str, Any] = Body(...), u: dict = Depends(exiger(*EQUIPE))):
    """Envoi ou remplacement d'une photo : {image: "data:image/jpeg;base64,…"}."""
    vue = vue_ou_422(vue)
    v = await vehicule_ou_404(vid)
    donnees = decoder(str(corps.get("image") or ""))
    if not donnees:
        raise HTTPException(status_code=422, detail="Image vide")
    if len(donnees) > TAILLE_MAX:
        raise HTTPException(status_code=413, detail="Photo trop lourde (2 Mo au plus)")
    mime = type_image(donnees)
    if not mime:
        raise HTTPException(status_code=415, detail="Format accepté : JPEG, PNG ou WebP")
    ancienne = ((v.get("photos") or {}).get(vue) or {}).get("id")
    pid = nouvel_id()
    await db.photos_vehicules.insert_one({"id": pid, "vehicule_id": vid, "vue": vue, "type": mime,
                                          "taille": len(donnees), "donnees": donnees, "cree_le": iso(), "par": u.get("id")})
    await db.vehicules.update_one({"id": vid}, {"$set": {f"photos.{vue}": {"id": pid, "maj_le": iso()}}})
    if ancienne:
        await db.photos_vehicules.delete_one({"id": ancienne})   # l'ancienne photo de cette vue est remplacée
    return {"vue": vue, "libelle": VUES[vue], "url": f"/api/public/photos-vehicules/{pid}"}


@router.delete("/admin/vehicules/{vid}/photos/{vue}")
async def supprimer_photo(vid: str, vue: str, u: dict = Depends(exiger(*EQUIPE))):
    vue = vue_ou_422(vue)
    v = await vehicule_ou_404(vid)
    ancienne = ((v.get("photos") or {}).get(vue) or {}).get("id")
    await db.vehicules.update_one({"id": vid}, {"$unset": {f"photos.{vue}": ""}})
    if ancienne:
        await db.photos_vehicules.delete_one({"id": ancienne})
    return {"ok": True}


async def supprimer_photos_du_vehicule(vid: str) -> None:
    """Appelée à la suppression d'un véhicule : ses photos sont supprimées aussi."""
    await db.photos_vehicules.delete_many({"vehicule_id": vid})


# ------------------------------------------------------------------------------------------------------------
# Portail public
# ------------------------------------------------------------------------------------------------------------
@router.get("/public/categories/{code}/vehicules")
async def vehicules_de_la_categorie(code: str):
    """Véhicules en service de la catégorie qui ont au moins une photo (jamais d'immatriculation ni de chauffeur)."""
    sortie = []
    async for v in db.vehicules.find({"categorie": code, "statut": {"$ne": "hors_service"}}, {"_id": 0}).sort("marque", 1):
        if not vues_publiques(v.get("photos") or {}):
            continue
        sortie.append(fiche_publique(v))   # lot 16 : même fiche que la page du véhicule (description comprise)
    return sortie


# Lot 16 — « les photos des véhicules à côté des tarifs ; un lien ou pictogramme ouvre la page du véhicule (photos,
# description, classe…) ». Jamais d'immatriculation, de chauffeur ni de document administratif côté public.
APERCU_MAX = 3
# Lot 20 — champs publics de la fiche technique (jamais l'immatriculation, la carte grise ni les documents)
CHAMPS_TECHNIQUES = ("interieur", "sieges", "ecran_pouces", "ecran", "audio_hp", "climatisation", "securite", "boite",
                     "puissance_ch", "capacite_batterie_kwh", "reservoir_l")      # vignettes au plus par catégorie dans le tableau des tarifs


def fiche_publique(v: Dict[str, Any]) -> Dict[str, Any]:
    """Ce que le public voit d'un véhicule."""
    return {
        "id": v["id"], "marque": v.get("marque") or "", "modele": v.get("modele") or "", "annee": v.get("annee"),
        "couleur": v.get("couleur") or "", "energie": v.get("energie") or "", "places": v.get("places"),
        "confort": v.get("confort") or [], "autonomie_km": v.get("autonomie_km"), "description": v.get("description") or "",
        "categorie": v.get("categorie") or "", "disponible": v.get("statut") == "disponible",
        "photos": vues_publiques(v.get("photos") or {}),
        # Lot 20 — fiche technique (sections Intérieur, Sièges, Écran, Audio, Climatisation, Énergie, Sécurité)
        "technique": {k: v.get(k) for k in CHAMPS_TECHNIQUES},
    }


async def apercu_categorie(code: str) -> List[Dict[str, Any]]:
    """Jusqu'à 3 véhicules en service de la catégorie, avec leur première photo (disponibles d'abord)."""
    sortie: List[Dict[str, Any]] = []
    async for v in db.vehicules.find({"categorie": code, "statut": {"$ne": "hors_service"}, "photos": {"$ne": {}}},
                                     {"_id": 0, "id": 1, "marque": 1, "modele": 1, "statut": 1, "photos": 1}).sort("marque", 1):
        photos = vues_publiques(v.get("photos") or {})
        if photos:
            sortie.append({"id": v["id"], "nom": f"{v.get('marque') or ''} {v.get('modele') or ''}".strip(),
                           "photo_url": photos[0]["url"], "disponible": v.get("statut") == "disponible"})
    sortie.sort(key=lambda x: not x["disponible"])
    return sortie[:APERCU_MAX]


@router.get("/public/vehicules")
async def vitrine_vehicules():
    """Lot 19 — galerie « Nos véhicules » de l'accueil (style vitrine) : un véhicule en service avec photo par carte,
    sa première photo, son nom et sa classe ; les disponibles d'abord. Jamais d'immatriculation."""
    from routes.public import categories_actives
    noms = {c["code"]: c["nom"] for c in await categories_actives()}
    sortie: List[Dict[str, Any]] = []
    async for v in db.vehicules.find({"statut": {"$ne": "hors_service"}, "photos": {"$ne": {}}},
                                     {"_id": 0, "id": 1, "marque": 1, "modele": 1, "annee": 1, "categorie": 1,
                                      "statut": 1, "photos": 1}).sort([("marque", 1), ("modele", 1)]):
        photos = vues_publiques(v.get("photos") or {})
        if not photos or v.get("categorie") not in noms:   # sans photo ou classe désactivée : pas de carte
            continue
        sortie.append({"id": v["id"], "nom": f"{v.get('marque') or ''} {v.get('modele') or ''}".strip(),
                       "annee": v.get("annee"), "categorie": v.get("categorie"), "classe": noms[v["categorie"]],
                       "photo_url": photos[0]["url"], "disponible": v.get("statut") == "disponible"})
    sortie.sort(key=lambda x: not x["disponible"])
    return sortie


@router.get("/public/vehicules/{vid}")
async def page_vehicule(vid: str):
    """Page publique d'un véhicule : fiche, photos et tarifs de sa classe (catégorie)."""
    v = await db.vehicules.find_one({"id": vid, "statut": {"$ne": "hors_service"}}, {"_id": 0})
    if not v:
        raise HTTPException(status_code=404, detail="Véhicule introuvable")
    from routes.public import categories_actives
    classe = next((c for c in await categories_actives() if c["code"] == v.get("categorie")), None)
    return {**fiche_publique(v), "classe": classe}


@router.get("/public/photos-vehicules/{pid}")
async def image(pid: str):
    """L'image elle-même (gardée en cache par le navigateur : son adresse change à chaque remplacement)."""
    p = await db.photos_vehicules.find_one({"id": pid}, {"_id": 0, "type": 1, "donnees": 1})
    if not p:
        raise HTTPException(status_code=404, detail="Photo introuvable")
    return Response(content=bytes(p["donnees"]), media_type=p.get("type") or "image/jpeg",
                    headers={"Cache-Control": "public, max-age=604800, immutable"})
