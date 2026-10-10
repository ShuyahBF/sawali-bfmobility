"""Lot 24 — RETOURS de SAWALI vers bfmobility (« URL de retour » de l'émetteur bfmobility dans SAWALI).

Règle du propriétaire (10/10/2026) : toute plateforme, existante ou à venir, expose cette adresse.
Adresse à saisir dans SAWALI (Paramètres → Transmission universelle → émetteur bfmobility → URL de retour) :
    https://bfmobility-backend.onrender.com/api/webhooks/liluvine-retour

Sécurité : requête SIGNÉE par SAWALI avec la clé LILUVINE_WA_HMAC de bfmobility (en-têtes X-Timestamp et
X-Signature = HMAC-SHA256(clé, "<horodatage>.<corps brut>")), valable 5 minutes ; sinon refus 401.

Pour un développeur WinDev : SAWALI « appelle » bfmobility pour lui dire ce qui est arrivé à ses messages :
  - « statut »         : message WhatsApp envoyé / remis / lu / en échec → journal des retours ;
  - « reponse »        : le client a répondu à un message de bfmobility  → journal des retours ;
  - « desinscription » : le client a répondu STOP                         → fiche utilisateur marquée ;
  - « stats_du_jour »  : SAWALI demande les chiffres du jour (synthèse quotidienne de Liluvine).
"""
from __future__ import annotations

import hmac
import json
import time
from typing import Any, Dict

from fastapi import APIRouter, HTTPException, Request

import transmission_wa
from db import db
from metier import iso

router = APIRouter(prefix="/webhooks", tags=["SAWALI"])

STATUTS_TERMINEES = ("terminee",)


async def _corps_signe(request: Request) -> Dict[str, Any]:
    """Vérifie la signature de SAWALI (clé partagée) et renvoie le corps JSON."""
    cle = transmission_wa.cle_hmac()
    if not cle:
        raise HTTPException(status_code=503, detail="LILUVINE_WA_HMAC non configurée")
    brut = await request.body()
    ts = request.headers.get("x-timestamp") or ""
    if not ts.isdigit() or abs(time.time() - int(ts)) > 300:
        raise HTTPException(status_code=401, detail="Horodatage invalide")
    if not hmac.compare_digest(transmission_wa.signer(cle, ts, brut), request.headers.get("x-signature") or ""):
        raise HTTPException(status_code=401, detail="Signature invalide")
    try:
        corps = json.loads(brut.decode("utf-8") or "{}")
    except ValueError:
        raise HTTPException(status_code=422, detail="Corps JSON invalide")
    if not isinstance(corps, dict):
        raise HTTPException(status_code=422, detail="Corps JSON attendu")
    return corps


def _chiffres(numero: Any) -> str:
    return "".join(ch for ch in str(numero or "") if ch.isdigit())


async def _statistiques(debut: str, fin: str) -> Dict[str, Any]:
    """Indicateurs du jour : courses demandées / terminées / annulées, encaissé, nouveaux clients."""
    periode = {"$gte": debut, "$lt": fin}
    demandees = await db.courses.count_documents({"cree_le": periode})
    terminees = await db.courses.count_documents({"cree_le": periode, "statut": {"$in": list(STATUTS_TERMINEES)}})
    annulees = await db.courses.count_documents({"cree_le": periode, "statut": "annulee"})
    payes = await db.paiements.find({"statut": "paye", "maj_le": periode}, {"_id": 0, "montant": 1}).to_list(5000)
    encaisse = int(sum(float(p.get("montant") or 0) for p in payes))
    clients = await db.utilisateurs.count_documents({"role": "client", "cree_le": periode})
    import version_plateforme
    v = version_plateforme.infos_version()
    return {
        "indicateurs": [
            {"cle": "courses", "libelle": "Courses demandées", "valeur": demandees},
            {"cle": "terminees", "libelle": "Courses terminées", "valeur": terminees},
            {"cle": "annulees", "libelle": "Courses annulées", "valeur": annulees},
            {"cle": "encaisse", "libelle": "Encaissé en ligne (F CFA)", "valeur": encaisse},
            {"cle": "clients", "libelle": "Nouveaux clients", "valeur": clients},
        ],
        "version": str(v.get("version") or ""), "deploye_le": v.get("demarrage"),
    }


@router.post("/liluvine-retour")
async def retour(request: Request):
    """Point d'entrée unique des retours signés de SAWALI."""
    corps = await _corps_signe(request)
    genre = str(corps.get("type") or "")
    if genre == "stats_du_jour":
        debut = str(corps.get("debut") or iso()[:10] + "T00:00:00+00:00")
        return await _statistiques(debut, str(corps.get("fin") or iso()))
    # Statut, réponse, désinscription… : gardés au journal des retours (trace)
    await db.retours_sawali.insert_one({**{k: v for k, v in corps.items() if k != "_id"}, "recu_le": iso()})
    if genre == "desinscription":
        await db.utilisateurs.update_many({"telephone": _chiffres(corps.get("de"))},
                                          {"$set": {"whatsapp_desinscrit": True, "whatsapp_desinscrit_le": iso()}})
    return {"ok": True}
