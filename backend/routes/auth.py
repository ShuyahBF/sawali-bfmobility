"""Inscription (clients), connexion (tous les rôles) et profil de l'utilisateur connecté."""
from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from db import db
from metier import PAYS, iso
from outils import nouvel_id, parametres
from securite import creer_jeton, hacher, normaliser_telephone, public, utilisateur_courant, verifier

router = APIRouter(prefix="/auth", tags=["Authentification"])


class Inscription(BaseModel):
    nom: str = Field(min_length=2, max_length=80)
    telephone: str = Field(min_length=6, max_length=20)
    email: Optional[str] = Field(default=None, max_length=120)
    mot_de_passe: str = Field(min_length=6, max_length=100)
    langue: Optional[str] = None


class Connexion(BaseModel):
    identifiant: str
    mot_de_passe: str


class MajProfil(BaseModel):
    nom: Optional[str] = Field(default=None, min_length=2, max_length=80)
    email: Optional[str] = Field(default=None, max_length=120)
    langue: Optional[str] = None
    mot_de_passe: Optional[str] = Field(default=None, min_length=6, max_length=100)


async def indicatif_pays() -> str:
    """Indicatif téléphonique du pays de la plateforme (numéros saisis sans indicatif)."""
    p = await parametres()
    return next((x["indicatif"] for x in PAYS if x["code"] == p.get("pays")), "226")


@router.post("/inscription")
async def inscription(corps: Inscription):
    """Création d'un compte CLIENT (les autres rôles sont créés par la société dans le back-office)."""
    telephone = normaliser_telephone(corps.telephone, await indicatif_pays())
    email = (corps.email or "").strip().lower() or None
    if await db.utilisateurs.find_one({"telephone": telephone}):
        raise HTTPException(status_code=409, detail="Ce numéro de téléphone a déjà un compte : connectez-vous")
    if email and await db.utilisateurs.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="Cette adresse e-mail a déjà un compte : connectez-vous")
    u = {"id": nouvel_id(), "nom": corps.nom.strip(), "telephone": telephone, "role": "client",
         "langue": corps.langue or (await parametres()).get("langue", "fr"), "actif": True,
         "mot_de_passe": hacher(corps.mot_de_passe), "cree_le": iso()}
    if email:
        u["email"] = email
    await db.utilisateurs.insert_one(dict(u))
    return {"jeton": creer_jeton(u["id"]), "utilisateur": public(u)}


@router.post("/connexion")
async def connexion(corps: Connexion):
    """Connexion par e-mail OU numéro de téléphone + mot de passe."""
    ident = corps.identifiant.strip()
    filtre: Dict[str, Any] = {"email": ident.lower()} if "@" in ident else {"telephone": normaliser_telephone(ident, await indicatif_pays())}
    u = await db.utilisateurs.find_one(filtre, {"_id": 0})
    if not u or not verifier(corps.mot_de_passe, u.get("mot_de_passe")):
        raise HTTPException(status_code=401, detail="Identifiant ou mot de passe incorrect")
    if not u.get("actif", True):
        raise HTTPException(status_code=403, detail="Compte désactivé : contactez la société")
    await db.utilisateurs.update_one({"id": u["id"]}, {"$set": {"derniere_connexion": iso()}})
    return {"jeton": creer_jeton(u["id"]), "utilisateur": public(u)}


@router.get("/moi")
async def moi(u: dict = Depends(utilisateur_courant)):
    return public(u)


@router.patch("/moi")
async def maj_moi(corps: MajProfil, u: dict = Depends(utilisateur_courant)):
    """Mise à jour de son propre profil (nom, e-mail, langue, mot de passe)."""
    maj: Dict[str, Any] = {}
    if corps.nom:
        maj["nom"] = corps.nom.strip()
    if corps.email is not None:
        email = corps.email.strip().lower()
        if email and await db.utilisateurs.find_one({"email": email, "id": {"$ne": u["id"]}}):
            raise HTTPException(status_code=409, detail="Adresse e-mail déjà utilisée")
        maj["email"] = email or None
    if corps.langue:
        maj["langue"] = corps.langue
    if corps.mot_de_passe:
        maj["mot_de_passe"] = hacher(corps.mot_de_passe)
    if maj:
        await db.utilisateurs.update_one({"id": u["id"]}, {"$set": maj})
    return public(await db.utilisateurs.find_one({"id": u["id"]}, {"_id": 0}))
