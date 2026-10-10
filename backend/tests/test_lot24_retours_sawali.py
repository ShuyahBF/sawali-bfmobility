"""Lot 24 — retours signés de SAWALI : signature exigée, statistiques du jour, désinscription (STOP) notée.
Lancer : cd backend && python -m pytest tests/test_lot24_retours_sawali.py -q
"""
import json
import time

import pytest
from fastapi.testclient import TestClient

import transmission_wa
from db import db
from metier import iso
from server import app

CLE = "cle-retours-bfmobility"


@pytest.fixture(scope="module")
def c():
    with TestClient(app) as client:
        yield client


@pytest.fixture(autouse=True)
def cle(monkeypatch):
    monkeypatch.setenv("LILUVINE_WA_HMAC", CLE)


def signe(corps, cle=CLE):
    """Corps brut + en-têtes signés comme le fait SAWALI."""
    brut = json.dumps(corps, ensure_ascii=False)
    ts = str(int(time.time()))
    return brut, {"X-Emetteur": "sawali", "X-Timestamp": ts, "X-Signature": transmission_wa.signer(cle, ts, brut),
                  "Content-Type": "application/json"}


def test_signature_obligatoire(c):
    brut, entetes = signe({"type": "statut"}, cle="mauvaise")
    assert c.post("/api/webhooks/liluvine-retour", content=brut, headers=entetes).status_code == 401


def test_statistiques_du_jour(c):
    c.portal.call(db.courses.insert_one, {"id": "crs-ret", "statut": "terminee", "cree_le": iso()})
    brut, entetes = signe({"type": "stats_du_jour", "debut": iso()[:10] + "T00:00:00+00:00", "fin": "2999-01-01T00:00:00+00:00"})
    r = c.post("/api/webhooks/liluvine-retour", content=brut, headers=entetes).json()
    vals = {i["cle"]: i["valeur"] for i in r["indicateurs"]}
    assert vals["terminees"] >= 1 and vals["courses"] >= 1 and "version" in r


def test_desinscription_et_journal(c):
    c.portal.call(db.utilisateurs.insert_one, {"id": "u-ret", "telephone": "22670777777", "role": "client"})
    brut, entetes = signe({"type": "desinscription", "de": "+22670777777"})
    assert c.post("/api/webhooks/liluvine-retour", content=brut, headers=entetes).json() == {"ok": True}
    assert c.portal.call(db.utilisateurs.find_one, {"id": "u-ret"})["whatsapp_desinscrit"] is True
    brut, entetes = signe({"type": "reponse", "de": "+22670777777", "texte": "Merci"})
    c.post("/api/webhooks/liluvine-retour", content=brut, headers=entetes)
    assert c.portal.call(db.retours_sawali.count_documents, {"type": {"$in": ["reponse", "desinscription"]}}) >= 2
