"""Lot 26 — Connexions et visites signalées à SAWALI (alerte WhatsApp du propriétaire).

Demande du propriétaire (11/10/2026) : recevoir un WhatsApp, envoyé par SAWALI, à chaque connexion sur bfmobility.

En résumé (pour un développeur WinDev) :
  - à chaque CONNEXION réussie (mot de passe, code WhatsApp, création de compte) et à chaque VISITE d'un
    visiteur non connecté, ce serveur envoie à SAWALI une requête SIGNÉE :
        POST <SAWALI>/api/webhook/plateforme-connexion
        en-têtes X-Emetteur, X-Timestamp, X-Signature = HMAC-SHA256(clé, "<horodatage>.<corps brut>")
    avec la MÊME clé, le MÊME code émetteur et la MÊME adresse SAWALI que le support SAWALI (support_sawali.py :
    variables Render LILUVINE_WA_HMAC, LILUVINE_WA_EMETTEUR, SAWALI_API_URL / LILUVINE_WA_URL) ;
  - corps JSON : type (« connexion » | « visite »), le (date ISO UTC), ip, utilisateur, telephone, role, visiteur,
    url_site (adresse publique du site = première adresse de FRONTEND_ORIGIN), page, agent (navigateur) ;
    JAMAIS de mot de passe, de jeton ni de clé ;
  - l'envoi part EN ARRIÈRE-PLAN (asyncio.create_task) : la connexion de l'utilisateur n'attend jamais SAWALI,
    délai réseau de 5 s, aucune exception ne remonte, rien n'est fait si la clé n'est pas saisie ;
  - SAWALI décide d'alerter ou non (anti-répétition, robots, plafond) et répond {ok, alerte, raison}.

Route publique ajoutée (visites) :
    POST /api/presence/visite   {visiteur, page}   → toujours {"ok": true}
  appelée par le site au chargement, au plus une fois toutes les 30 min par navigateur, seulement si personne
  n'est connecté ; le serveur ignore les robots évidents et limite lui aussi à une fois / 30 min par visiteur
  ou par adresse IP (petit cache en mémoire).
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Set

import httpx
from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

import support_sawali
from config import get_settings

logger = logging.getLogger("signal_connexion")

# Chemin de la route SAWALI (ajouté à l'adresse de SAWALI, ex. https://api.sawalismartsystems.com)
CHEMIN_SAWALI = "/api/webhook/plateforme-connexion"
# Délai réseau maximal d'un envoi (secondes) : court, l'envoi est en arrière-plan
DELAI_SECONDES = 5.0
# Une visite au plus toutes les 30 minutes par visiteur ou par adresse IP (côté serveur)
INTERVALLE_VISITE_S = 30 * 60
# Taille maximale du cache mémoire des visites (au-delà : on retire les entrées périmées)
CACHE_MAX = 5000

# Transport HTTP de remplacement (tests) : None en production
_transport: Optional[httpx.AsyncBaseTransport] = None

# Tâches d'envoi en cours : gardées ici pour qu'elles ne soient pas supprimées avant la fin (asyncio)
_taches: Set[asyncio.Task] = set()

# Cache des visites déjà signalées : clé (« v:<visiteur> » ou « ip:<adresse> ») → heure du dernier envoi
_visites: Dict[str, float] = {}

# Robots évidents (moteurs de recherche, aperçus de liens, outils en ligne de commande, sondes)
_ROBOTS = re.compile(
    r"bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegram|preview|curl|wget|python|httpx|requests|"
    r"go-http|java/|okhttp|axios|node-fetch|headless|phantom|lighthouse|pingdom|uptime|monitor|render",
    re.IGNORECASE)


# ---------------------------------------------------------------------------
# Outils
# ---------------------------------------------------------------------------
def configure() -> bool:
    """Vrai si la clé HMAC de la plateforme est saisie (sinon aucun signal n'est envoyé)."""
    return support_sawali.configure()


def ip_reelle(request: Optional[Request]) -> str:
    """Adresse IP du visiteur : premier élément de X-Forwarded-For (derrière Render), sinon l'adresse directe."""
    if request is None:
        return ""
    transmis = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    if transmis:
        return transmis[:64]
    return (request.client.host if request.client else "")[:64]


def est_robot(agent: str) -> bool:
    """Vrai pour un navigateur absent ou un robot évident (aucun signal dans ce cas)."""
    return not agent or bool(_ROBOTS.search(agent))


def url_site() -> str:
    """Adresse publique du site (première adresse de FRONTEND_ORIGIN)."""
    return get_settings().public_site_url


def corps_signal(type_signal: str, request: Optional[Request], utilisateur: Optional[Dict[str, Any]] = None,
                 visiteur: Optional[str] = None, page: Optional[str] = None) -> Dict[str, Any]:
    """Construit le corps JSON envoyé à SAWALI (aucun secret : ni mot de passe, ni jeton, ni clé)."""
    u = utilisateur or {}
    return {
        "type": type_signal,
        "le": datetime.now(timezone.utc).isoformat(),
        "ip": ip_reelle(request),
        "utilisateur": (u.get("nom") or None) if u else None,
        "telephone": (u.get("telephone") or None) if u else None,
        "role": (u.get("role") or None) if u else None,
        "visiteur": (visiteur or None),
        "url_site": url_site(),
        "page": (page or None),
        "agent": ((request.headers.get("user-agent") or "") if request is not None else "")[:300],
    }


# ---------------------------------------------------------------------------
# Envoi signé (jamais d'exception)
# ---------------------------------------------------------------------------
async def envoyer(corps: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """POST signé vers SAWALI ; renvoie la réponse JSON, ou None en cas d'échec (erreur seulement journalisée)."""
    try:
        if not configure():
            return None
        brut = json.dumps(corps, ensure_ascii=False)
        ts = str(int(time.time()))
        entetes = {"Content-Type": "application/json", "X-Emetteur": support_sawali.emetteur(), "X-Timestamp": ts,
                   "X-Signature": support_sawali.signer(support_sawali.cle(), ts, brut)}
        async with httpx.AsyncClient(timeout=DELAI_SECONDES, transport=_transport) as client:
            r = await client.post(f"{support_sawali.url_sawali()}{CHEMIN_SAWALI}", content=brut.encode("utf-8"),
                                  headers=entetes)
        if r.status_code >= 400:
            logger.info("Signal %s refusé par SAWALI (HTTP %s)", corps.get("type"), r.status_code)
            return None
        return r.json()
    except Exception as exc:   # SAWALI injoignable, réponse illisible… : jamais bloquant
        logger.info("Signal %s non transmis à SAWALI : %s", corps.get("type"), type(exc).__name__)
        return None


def signaler(type_signal: str, request: Optional[Request], utilisateur: Optional[Dict[str, Any]] = None,
             visiteur: Optional[str] = None, page: Optional[str] = None) -> None:
    """Lance l'envoi EN ARRIÈRE-PLAN et rend la main tout de suite (ne lève jamais d'exception)."""
    try:
        if not configure():
            return
        corps = corps_signal(type_signal, request, utilisateur, visiteur, page)
        tache = asyncio.get_running_loop().create_task(envoyer(corps))
        _taches.add(tache)
        tache.add_done_callback(_taches.discard)
    except Exception as exc:   # pas de boucle asyncio, etc.
        logger.info("Signal %s non lancé : %s", type_signal, type(exc).__name__)


def signaler_connexion(request: Optional[Request], utilisateur: Dict[str, Any]) -> None:
    """Connexion réussie : nom, téléphone et rôle du compte transmis à SAWALI."""
    signaler("connexion", request, utilisateur=utilisateur)


async def attendre_envois() -> None:
    """Attend la fin des envois en cours (utilisé par les tests)."""
    if _taches:
        await asyncio.gather(*list(_taches), return_exceptions=True)


# ---------------------------------------------------------------------------
# Visites : limitation à une fois / 30 min par visiteur ou par IP
# ---------------------------------------------------------------------------
def visite_autorisee(visiteur: str, ip: str, maintenant: Optional[float] = None) -> bool:
    """Vrai si ni ce visiteur ni cette IP n'ont été signalés depuis 30 min ; note alors l'envoi dans le cache."""
    t = time.time() if maintenant is None else maintenant
    # Ménage : retire les entrées périmées quand le cache devient trop gros
    if len(_visites) > CACHE_MAX:
        for k in [k for k, v in _visites.items() if t - v >= INTERVALLE_VISITE_S]:
            _visites.pop(k, None)
        if len(_visites) > CACHE_MAX:
            _visites.clear()
    cles = [c for c in (f"v:{visiteur}" if visiteur else "", f"ip:{ip}" if ip else "") if c]
    if any(t - _visites.get(c, 0.0) < INTERVALLE_VISITE_S for c in cles):
        return False
    for c in cles:
        _visites[c] = t
    return True


class VisiteEntree(BaseModel):
    visiteur: str = Field("", max_length=64)
    page: str = Field("", max_length=300)


router = APIRouter(prefix="/presence", tags=["Public"])


@router.post("/visite")
async def visite(entree: VisiteEntree, request: Request):
    """Visiteur non connecté arrivé sur le site : signal « visite » à SAWALI (robots ignorés, 1 fois / 30 min)."""
    agent = request.headers.get("user-agent") or ""
    if configure() and not est_robot(agent):
        visiteur = re.sub(r"[^A-Za-z0-9_-]", "", entree.visiteur)[:64]
        if visite_autorisee(visiteur, ip_reelle(request)):
            signaler("visite", request, visiteur=visiteur or None, page=(entree.page or "/")[:300])
    # Réponse identique dans tous les cas : le site n'a rien à en faire
    return {"ok": True}
