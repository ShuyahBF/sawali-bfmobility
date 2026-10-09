"""Mots de passe (bcrypt), jetons de connexion (JWT) et contrôle des rôles."""
from __future__ import annotations

import re
from datetime import timedelta
from typing import Any, Dict, Optional

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from passlib.context import CryptContext

from config import get_settings
from db import db
from metier import maintenant

_mdp = CryptContext(schemes=["bcrypt"], deprecated="auto")
_porteur = HTTPBearer(auto_error=False)

ROLES = ("admin", "gestionnaire", "chauffeur", "mecanicien", "client")
EQUIPE = ("admin", "gestionnaire")                 # direction et exploitation
ATELIER = ("admin", "gestionnaire", "mecanicien")  # parc, pièces, maintenance


def hacher(mot_de_passe: str) -> str:
    return _mdp.hash(mot_de_passe)


def verifier(mot_de_passe: str, empreinte: Optional[str]) -> bool:
    try:
        return bool(empreinte) and _mdp.verify(mot_de_passe, empreinte)
    except Exception:  # noqa: BLE001 — empreinte illisible : refus
        return False


def creer_jeton(utilisateur_id: str) -> str:
    """Jeton signé contenant l'identifiant et l'expiration."""
    reglages = get_settings()
    charge = {"sub": utilisateur_id, "exp": maintenant() + timedelta(minutes=reglages.jwt_expires_minutes)}
    return jwt.encode(charge, reglages.jwt_secret, algorithm=reglages.jwt_algorithm)


def normaliser_telephone(telephone: str, indicatif: str = "226") -> str:
    """Numéro au format international sans « + » : « 70 00 00 00 » → « 22670000000 »."""
    chiffres = re.sub(r"\D", "", str(telephone or ""))
    if chiffres.startswith("00"):
        chiffres = chiffres[2:]
    if chiffres and len(chiffres) <= 9 and not chiffres.startswith(indicatif):
        chiffres = indicatif + chiffres.lstrip("0")
    return chiffres


def public(utilisateur: Dict[str, Any]) -> Dict[str, Any]:
    """Fiche renvoyée au site : jamais l'empreinte du mot de passe ni l'_id Mongo."""
    u = {k: v for k, v in utilisateur.items() if k not in ("_id", "mot_de_passe")}
    return u


async def utilisateur_courant(identite: Optional[HTTPAuthorizationCredentials] = Depends(_porteur)) -> Dict[str, Any]:
    """Utilisateur connecté (jeton valide et compte actif), sinon 401."""
    if identite is None:
        raise HTTPException(status_code=401, detail="Connexion requise")
    reglages = get_settings()
    try:
        charge = jwt.decode(identite.credentials, reglages.jwt_secret, algorithms=[reglages.jwt_algorithm])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Session expirée : reconnectez-vous")
    u = await db.utilisateurs.find_one({"id": charge.get("sub")}, {"_id": 0})
    if not u or not u.get("actif", True):
        raise HTTPException(status_code=401, detail="Compte introuvable ou désactivé")
    return u


def exiger(*roles: str):
    """Dépendance FastAPI : l'utilisateur doit avoir l'un des rôles donnés (sinon 403)."""
    async def _verif(u: Dict[str, Any] = Depends(utilisateur_courant)) -> Dict[str, Any]:
        if u.get("role") not in roles:
            raise HTTPException(status_code=403, detail="Accès non autorisé pour votre rôle")
        return u
    return _verif
