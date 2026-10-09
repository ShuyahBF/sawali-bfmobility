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


# ------------------------------------------------------------------------------------------------------------------
# Lot 2 — connexion par CODE reçu sur WhatsApp (sans mot de passe) ; crée le compte client s'il n'existe pas
# ------------------------------------------------------------------------------------------------------------------
import hashlib  # noqa: E402
import secrets as _secrets  # noqa: E402
from datetime import timedelta  # noqa: E402

from metier import lire_date, maintenant  # noqa: E402

DUREE_CODE_MIN = 5          # validité d'un code
MAX_ESSAIS = 5              # essais par code
DELAI_RENVOI_S = 60         # délai minimal entre deux envois au même numéro
MAX_CODES_HEURE = 5         # codes par numéro et par heure


class DemandeCode(BaseModel):
    telephone: str = Field(min_length=6, max_length=20)


class VerificationCode(BaseModel):
    telephone: str = Field(min_length=6, max_length=20)
    code: str = Field(min_length=4, max_length=8)
    nom: Optional[str] = Field(default=None, max_length=80)   # obligatoire seulement pour un nouveau compte


def empreinte_code(telephone: str, code: str) -> str:
    """Le code n'est jamais stocké en clair : empreinte SHA-256 salée par le numéro."""
    return hashlib.sha256(f"{telephone}:{code}".encode()).hexdigest()


async def envoyer_code(telephone: str, code: str) -> tuple:
    """WhatsApp (modèle Meta d'authentification, puis Transmission SAWALI), puis SMS en secours."""
    import otp_senders
    import transmission_wa
    if otp_senders.whatsapp_configured():
        ok, erreur = await otp_senders.send_whatsapp_code(telephone, code)
        if ok:
            return True, "whatsapp"
    if transmission_wa.liluvine_configure():
        ok, erreur = await transmission_wa.envoyer_code_liluvine(telephone, f"Votre code de connexion bfmobility : {code} (valable {DUREE_CODE_MIN} min). Ne le partagez avec personne.")
        if ok:
            return True, "whatsapp"
    if otp_senders.sms_configured():
        ok, erreur = await otp_senders.send_sms_code(telephone, code)
        if ok:
            return True, "sms"
    return False, None


@router.post("/otp/demande")
async def demander_code(corps: DemandeCode):
    """Envoie un code à 6 chiffres sur WhatsApp (ou SMS). Limité : 1 envoi / minute, 5 / heure par numéro."""
    telephone = normaliser_telephone(corps.telephone, await indicatif_pays())
    dernier = await db.otp.find_one({"telephone": telephone}, sort=[("cree_le", -1)])
    if dernier and (maintenant() - lire_date(dernier["cree_le"])).total_seconds() < DELAI_RENVOI_S:
        raise HTTPException(status_code=429, detail="Patientez une minute avant de redemander un code")
    if await db.otp.count_documents({"telephone": telephone, "cree_le": {"$gte": iso(maintenant() - timedelta(hours=1))}}) >= MAX_CODES_HEURE:
        raise HTTPException(status_code=429, detail="Trop de codes demandés : réessayez dans une heure")
    code = f"{_secrets.randbelow(1_000_000):06d}"
    ok, canal = await envoyer_code(telephone, code)
    if not ok:
        raise HTTPException(status_code=503, detail="Envoi du code impossible pour le moment : utilisez le mot de passe")
    await db.otp.insert_one({"telephone": telephone, "empreinte": empreinte_code(telephone, code), "essais": 0,
                             "utilise": False, "cree_le": iso(), "expire_le": iso(maintenant() + timedelta(minutes=DUREE_CODE_MIN))})
    existe = bool(await db.utilisateurs.find_one({"telephone": telephone}, {"_id": 1}))
    return {"envoye": True, "canal": canal, "compte_existant": existe, "duree_min": DUREE_CODE_MIN}


@router.post("/otp/verification")
async def verifier_code(corps: VerificationCode):
    """Vérifie le code ; connecte l'utilisateur (ou crée son compte client avec le nom donné)."""
    telephone = normaliser_telephone(corps.telephone, await indicatif_pays())
    otp = await db.otp.find_one({"telephone": telephone, "utilise": False}, sort=[("cree_le", -1)])
    if not otp or lire_date(otp["expire_le"]) < maintenant():
        raise HTTPException(status_code=401, detail="Code expiré : demandez-en un nouveau")
    if otp["essais"] >= MAX_ESSAIS:
        raise HTTPException(status_code=429, detail="Trop d'essais : demandez un nouveau code")
    if not _secrets.compare_digest(otp["empreinte"], empreinte_code(telephone, corps.code.strip())):
        await db.otp.update_one({"_id": otp["_id"]}, {"$inc": {"essais": 1}})
        raise HTTPException(status_code=401, detail="Code incorrect")
    u = await db.utilisateurs.find_one({"telephone": telephone}, {"_id": 0})
    if u and not u.get("actif", True):
        raise HTTPException(status_code=403, detail="Compte désactivé : contactez la société")
    # Nouveau compte : le nom est demandé AVANT de consommer le code (le client garde son code s'il l'a oublié)
    if not u and (not corps.nom or len(corps.nom.strip()) < 2):
        raise HTTPException(status_code=422, detail="Indiquez votre nom pour créer votre compte")
    await db.otp.update_one({"_id": otp["_id"]}, {"$set": {"utilise": True}})
    if not u:
        u = {"id": nouvel_id(), "nom": corps.nom.strip(), "telephone": telephone, "role": "client",
             "langue": (await parametres()).get("langue", "fr"), "actif": True, "telephone_verifie": True, "cree_le": iso()}
        await db.utilisateurs.insert_one(dict(u))
    else:
        await db.utilisateurs.update_one({"id": u["id"]}, {"$set": {"telephone_verifie": True, "derniere_connexion": iso()}})
    return {"jeton": creer_jeton(u["id"]), "utilisateur": public(u)}
