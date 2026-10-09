"""Lot 2 — paiement EN LIGNE d'une course : Mobile Money (pawaPay, page hébergée) et carte bancaire (Stripe Checkout).

Principes (repris de beAuthentik / SAWALI, éprouvés en production) :
  - le paiement est ENREGISTRÉ en base (collection paiements) AVANT d'appeler l'opérateur : jamais d'identifiant perdu ;
  - le client est redirigé vers la page de paiement de l'opérateur (aucun code PIN ni numéro de carte ne passe chez nous) ;
  - le statut FAISANT FOI est toujours redemandé à l'opérateur avant de marquer la course payée (une notification
    reçue n'est jamais crue sur parole) ; un passage atomique garantit qu'un paiement n'est appliqué qu'une seule fois ;
  - si la notification de l'opérateur tarde, la page de retour (rafraichir=true) et une boucle de rapprochement
    (toutes les 60 s) finalisent le paiement.
Une course se paie EN LIGNE quand son prix est définitif : course terminée, ou location (heure / jour) au prix fixe.
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import logging
import secrets
import time
from datetime import timedelta
from typing import Any, Dict, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from config import get_settings
from db import db
from metier import iso, maintenant
from outils import nouvel_id
from routes.courses import charger
from securite import EQUIPE, utilisateur_courant

router = APIRouter(prefix="/paiements", tags=["Paiements en ligne"])
logger = logging.getLogger("paiements")

PAWAPAY_HOTES = {"sandbox": "https://api.sandbox.pawapay.io", "production": "https://api.pawapay.io"}
# Pays couverts par pawaPay (code ISO-2 de la plateforme → code ISO-3 attendu par pawaPay)
PAWAPAY_PAYS = {"BF": "BFA", "CI": "CIV", "SN": "SEN", "ML": "MLI", "TG": "TGO", "BJ": "BEN", "NE": "NER",
                "CM": "CMR", "GA": "GAB", "GH": "GHA", "NG": "NGA", "KE": "KEN"}
# Devises sans centimes chez Stripe (montant envoyé tel quel, pas × 100)
STRIPE_SANS_DECIMALES = {"XOF", "XAF", "JPY", "KRW", "GNF", "RWF", "UGX", "VND", "CLP", "PYG", "KMF", "BIF", "DJF", "MGA", "VUV", "XPF"}


class DemandePaiement(BaseModel):
    telephone: Optional[str] = None     # Mobile Money : numéro prérempli sur la page pawaPay (facultatif)


# ----------------------------------------------------------------------------------------------------- outils
def jeton_pawapay() -> Optional[str]:
    s = get_settings()
    return s.pawapay_api_token_production if s.pawapay_environment == "production" else s.pawapay_api_token_sandbox


def montant_stripe(montant: float, devise: str) -> int:
    """Montant en « plus petite unité » de la devise, comme l'attend Stripe (XOF : tel quel ; EUR : centimes)."""
    return int(round(montant)) if devise.upper() in STRIPE_SANS_DECIMALES else int(round(montant * 100))


def signature_stripe_valide(corps: bytes, entete: str, secret: str, tolerance: int = 300) -> bool:
    """Vérifie l'en-tête Stripe-Signature (« t=…,v1=… ») : HMAC-SHA256 de « t.corps » avec le secret du webhook."""
    try:
        morceaux = dict(p.split("=", 1) for p in entete.split(","))
        horodatage = int(morceaux["t"])
    except (ValueError, KeyError):
        return False
    if abs(time.time() - horodatage) > tolerance:
        return False
    attendu = hmac.new(secret.encode(), f"{horodatage}.".encode() + corps, hashlib.sha256).hexdigest()
    signatures = [v for k, v in (p.split("=", 1) for p in entete.split(",")) if k == "v1"]
    return any(hmac.compare_digest(attendu, s) for s in signatures)


async def course_payable(course_id: str, u: Dict[str, Any]) -> Dict[str, Any]:
    """Contrôles communs : propriétaire, prix définitif, pas déjà payée."""
    c = await charger(course_id)
    if (c.get("client") or {}).get("id") != u["id"] and u["role"] not in EQUIPE:
        raise HTTPException(status_code=404, detail="Course introuvable")
    if (c.get("paiement") or {}).get("statut") == "paye":
        raise HTTPException(status_code=409, detail="Cette course est déjà payée")
    if c["statut"] == "annulee":
        raise HTTPException(status_code=409, detail="Course annulée")
    if c["mode"] == "course" and c["statut"] != "terminee":
        raise HTTPException(status_code=409, detail="Le paiement en ligne d'une course se fait à l'arrivée (prix définitif)")
    return c


def montant_du(c: Dict[str, Any]) -> float:
    return float(c["prix_final"] if c.get("prix_final") is not None else c.get("prix_estime") or 0)


async def appliquer(paiement: Dict[str, Any], statut: str, montant_recu: Optional[float], message: Optional[str] = None) -> bool:
    """Applique le statut VÉRIFIÉ une seule fois. statut : paye | echec | en_cours. Renvoie True si appliqué."""
    maj: Dict[str, Any] = {"maj_le": iso()}
    if message:
        maj["message"] = message[:300]
    if statut == "paye" and montant_recu is not None and abs(montant_recu - float(paiement["montant"])) > 0.01:
        maj.update(statut="montant_incoherent", message=f"Montant reçu {montant_recu} ≠ attendu {paiement['montant']}")
        await db.paiements.update_one({"id": paiement["id"]}, {"$set": maj})
        return False
    if statut not in ("paye", "echec"):
        await db.paiements.update_one({"id": paiement["id"]}, {"$set": maj})
        return False
    maj["statut"] = statut
    res = await db.paiements.update_one({"id": paiement["id"], "statut": {"$nin": ["paye", "echec"]}}, {"$set": maj})
    if not res.modified_count:
        return False   # déjà traité (idempotence)
    if statut == "paye":
        await db.courses.update_one({"id": paiement["course_id"]}, {"$set": {"paiement": {
            "moyen": paiement["moyen"], "statut": "paye", "reference": paiement["reference"],
            "operateur": paiement["operateur"], "le": iso()}}})
    return True


# ----------------------------------------------------------------------------------------------------- moyens disponibles
@router.get("/moyens")
async def moyens():
    """Moyens de paiement en ligne réellement configurés (le site n'affiche que ceux-là)."""
    s = get_settings()
    return {"mobile_money": bool(jeton_pawapay()), "carte": bool(s.stripe_secret_key), "especes": True}


# ----------------------------------------------------------------------------------------------------- Mobile Money
@router.post("/courses/{course_id}/mobile-money")
async def payer_mobile_money(course_id: str, corps: DemandePaiement, u: dict = Depends(utilisateur_courant)):
    """Crée la page de paiement pawaPay (Orange Money, Moov, Wave… selon le pays) et renvoie son adresse."""
    s = get_settings()
    jeton = jeton_pawapay()
    if not jeton:
        raise HTTPException(status_code=503, detail="Paiement Mobile Money non configuré")
    c = await course_payable(course_id, u)
    from outils import parametres
    p = await parametres()
    pays = PAWAPAY_PAYS.get(p.get("pays"), s.pawapay_default_country)
    montant = montant_du(c)
    reference = nouvel_id()
    retour = f"{s.public_site_url}/courses/{course_id}?paiement={reference}"
    paiement = {"id": nouvel_id(), "reference": reference, "course_id": course_id, "client_id": u["id"],
                "moyen": "mobile_money", "operateur": "pawapay", "montant": montant, "devise": c["devise"],
                "pays": pays, "statut": "initie", "cree_le": iso(), "environnement": s.pawapay_environment}
    await db.paiements.insert_one(dict(paiement))   # enregistré AVANT l'appel
    corps_api: Dict[str, Any] = {
        "depositId": reference, "returnUrl": retour, "country": pays,
        "reason": f"Course {c['numero']}"[:50], "customerMessage": "bfmobility", "language": "FR",
        "amountDetails": {"amount": str(int(montant) if float(montant).is_integer() else montant), "currency": c["devise"]},
    }
    chiffres = "".join(ch for ch in (corps.telephone or c["client"].get("telephone") or "") if ch.isdigit())
    if chiffres:
        corps_api["phoneNumber"] = chiffres
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.post(f"{PAWAPAY_HOTES.get(s.pawapay_environment, PAWAPAY_HOTES['sandbox'])}/v2/paymentpage",
                                  headers={"Authorization": f"Bearer {jeton}"}, json=corps_api)
            reponse = r.json() if r.content else {}
    except httpx.HTTPError as exc:
        await db.paiements.update_one({"id": paiement["id"]}, {"$set": {"statut": "echec", "message": str(exc)[:200]}})
        raise HTTPException(status_code=502, detail="pawaPay injoignable, réessayez")
    adresse = (reponse or {}).get("redirectUrl")
    if not adresse:
        await db.paiements.update_one({"id": paiement["id"]}, {"$set": {"statut": "echec", "message": str(reponse)[:300]}})
        raise HTTPException(status_code=502, detail="pawaPay n'a pas fourni de page de paiement")
    await db.paiements.update_one({"id": paiement["id"]}, {"$set": {"statut": "en_attente", "adresse": adresse}})
    await db.courses.update_one({"id": course_id}, {"$set": {"paiement.moyen": "mobile_money", "paiement.statut": "en_attente",
                                                             "paiement.reference": reference}})
    return {"reference": reference, "adresse": adresse}


async def depot_pawapay(reference: str) -> Optional[Dict[str, Any]]:
    """Statut faisant foi d'un dépôt, demandé à pawaPay (None si injoignable)."""
    jeton = jeton_pawapay()
    if not jeton:
        return None
    s = get_settings()
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(f"{PAWAPAY_HOTES.get(s.pawapay_environment, PAWAPAY_HOTES['sandbox'])}/v2/deposits/{reference}",
                                 headers={"Authorization": f"Bearer {jeton}"})
        if r.status_code >= 400:
            return None
        corps = r.json()
        donnees = corps.get("data") if isinstance(corps, dict) else corps
        if isinstance(donnees, list):
            donnees = donnees[0] if donnees else None
        return donnees if isinstance(donnees, dict) else (corps if isinstance(corps, dict) and corps.get("depositId") else None)
    except (httpx.HTTPError, ValueError):
        return None


async def verifier_pawapay(paiement: Dict[str, Any]) -> None:
    depot = await depot_pawapay(paiement["reference"])
    if not depot:
        return
    etat = (depot.get("status") or "").upper()
    statut = {"COMPLETED": "paye", "FAILED": "echec", "REJECTED": "echec"}.get(etat, "en_cours")
    montant = depot.get("amount") or (depot.get("amountDetails") or {}).get("amount")
    raison = depot.get("failureReason") or {}
    await appliquer(paiement, statut, float(montant) if montant not in (None, "") else None,
                    raison.get("failureMessage") if isinstance(raison, dict) else str(raison or "") or None)


@router.post("/pawapay/notification/{secret}", include_in_schema=False)
async def notification_pawapay(secret: str, request: Request):
    """Notification de pawaPay (adresse protégée par un secret) ; le statut est REDEMANDÉ à pawaPay avant d'agir."""
    attendu = (get_settings().pawapay_callback_secret or "").strip()
    if not attendu or not secrets.compare_digest(secret, attendu):
        raise HTTPException(status_code=403, detail="secret invalide")
    corps = await request.json()
    paiement = await db.paiements.find_one({"reference": corps.get("depositId")}, {"_id": 0})
    if paiement:
        await verifier_pawapay(paiement)
    return {"ok": True}


# ----------------------------------------------------------------------------------------------------- carte (Stripe)
@router.post("/courses/{course_id}/carte")
async def payer_carte(course_id: str, u: dict = Depends(utilisateur_courant)):
    """Crée une session Stripe Checkout (page de paiement sécurisée de Stripe) et renvoie son adresse."""
    s = get_settings()
    if not s.stripe_secret_key:
        raise HTTPException(status_code=503, detail="Paiement par carte non configuré")
    c = await course_payable(course_id, u)
    montant = montant_du(c)
    reference = nouvel_id()
    paiement = {"id": nouvel_id(), "reference": reference, "course_id": course_id, "client_id": u["id"],
                "moyen": "carte", "operateur": "stripe", "montant": montant, "devise": c["devise"],
                "statut": "initie", "cree_le": iso()}
    await db.paiements.insert_one(dict(paiement))
    formulaire = {
        "mode": "payment",
        "success_url": f"{s.public_site_url}/courses/{course_id}?paiement={reference}",
        "cancel_url": f"{s.public_site_url}/courses/{course_id}?paiement=annule",
        "client_reference_id": reference,
        "metadata[reference]": reference, "metadata[course_id]": course_id,
        "line_items[0][quantity]": "1",
        "line_items[0][price_data][currency]": c["devise"].lower(),
        "line_items[0][price_data][unit_amount]": str(montant_stripe(montant, c["devise"])),
        "line_items[0][price_data][product_data][name]": f"Course {c['numero']}",
    }
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.post("https://api.stripe.com/v1/checkout/sessions", data=formulaire,
                                  auth=(s.stripe_secret_key, ""))
            reponse = r.json()
    except httpx.HTTPError:
        await db.paiements.update_one({"id": paiement["id"]}, {"$set": {"statut": "echec"}})
        raise HTTPException(status_code=502, detail="Stripe injoignable, réessayez")
    if r.status_code >= 400 or not reponse.get("url"):
        message = ((reponse or {}).get("error") or {}).get("message") or "Stripe a refusé la demande"
        await db.paiements.update_one({"id": paiement["id"]}, {"$set": {"statut": "echec", "message": message[:300]}})
        raise HTTPException(status_code=502, detail=message)
    await db.paiements.update_one({"id": paiement["id"]}, {"$set": {"statut": "en_attente", "session_stripe": reponse["id"],
                                                                     "adresse": reponse["url"]}})
    await db.courses.update_one({"id": course_id}, {"$set": {"paiement.moyen": "carte", "paiement.statut": "en_attente",
                                                             "paiement.reference": reference}})
    return {"reference": reference, "adresse": reponse["url"]}


async def verifier_stripe(paiement: Dict[str, Any]) -> None:
    """Statut faisant foi de la session Stripe (payment_status = paid)."""
    cle = get_settings().stripe_secret_key
    if not cle or not paiement.get("session_stripe"):
        return
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(f"https://api.stripe.com/v1/checkout/sessions/{paiement['session_stripe']}", auth=(cle, ""))
        session = r.json()
    except (httpx.HTTPError, ValueError):
        return
    if r.status_code >= 400:
        return
    if session.get("payment_status") == "paid":
        total = session.get("amount_total")
        recu = None if total is None else (float(total) if paiement["devise"].upper() in STRIPE_SANS_DECIMALES else float(total) / 100)
        await appliquer(paiement, "paye", recu)
    elif session.get("status") == "expired":
        await appliquer(paiement, "echec", None, "Session de paiement expirée")


@router.post("/stripe/notification", include_in_schema=False)
async def notification_stripe(request: Request):
    """Webhook Stripe signé (Stripe-Signature) ; le statut est REDEMANDÉ à Stripe avant d'agir."""
    secret = get_settings().stripe_webhook_secret
    corps = await request.body()
    if not secret or not signature_stripe_valide(corps, request.headers.get("Stripe-Signature", ""), secret):
        raise HTTPException(status_code=400, detail="signature invalide")
    evenement = await request.json()
    objet = ((evenement.get("data") or {}).get("object")) or {}
    reference = objet.get("client_reference_id") or (objet.get("metadata") or {}).get("reference")
    paiement = await db.paiements.find_one({"reference": reference}, {"_id": 0})
    if paiement:
        await verifier_stripe(paiement)
    return {"ok": True}


# ----------------------------------------------------------------------------------------------------- suivi
@router.get("/{reference}")
async def etat_paiement(reference: str, rafraichir: bool = False, u: dict = Depends(utilisateur_courant)):
    """État d'un paiement ; rafraichir=true (page de retour) interroge l'opérateur et applique le résultat."""
    p = await db.paiements.find_one({"reference": reference}, {"_id": 0})
    if not p or (p["client_id"] != u["id"] and u["role"] not in EQUIPE):
        raise HTTPException(status_code=404, detail="Paiement introuvable")
    if rafraichir and p["statut"] not in ("paye", "echec"):
        await (verifier_pawapay(p) if p["operateur"] == "pawapay" else verifier_stripe(p))
        p = await db.paiements.find_one({"reference": reference}, {"_id": 0})
    return {k: v for k, v in p.items() if k not in ("adresse",)}


async def rapprocher() -> int:
    """Une passe : paiements en attente de moins de 48 h, vérifiés auprès de l'opérateur."""
    depuis = iso(maintenant() - timedelta(hours=48))
    n = 0
    async for p in db.paiements.find({"statut": {"$in": ["en_attente", "en_cours"]}, "cree_le": {"$gte": depuis}}, {"_id": 0}).limit(200):
        avant = p["statut"]
        await (verifier_pawapay(p) if p["operateur"] == "pawapay" else verifier_stripe(p))
        apres = (await db.paiements.find_one({"id": p["id"]}, {"statut": 1}) or {}).get("statut")
        n += int(apres != avant)
    return n


async def boucle_rapprochement() -> None:
    """Tâche de fond : rapprochement toutes les 60 s (seulement si un opérateur est configuré)."""
    while True:
        try:
            if jeton_pawapay() or get_settings().stripe_secret_key:
                await rapprocher()
        except Exception:  # noqa: BLE001
            logger.exception("Rapprochement des paiements")
        await asyncio.sleep(60)
