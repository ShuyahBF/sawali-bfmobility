"""Lot 26 — connexions et visites signalées à SAWALI : requête signée, visites limitées, rien si non configuré,
aucune erreur si SAWALI est injoignable.
Lancer : cd backend && python -m pytest tests/test_lot26_signal_connexion.py -q
"""
import json

import httpx
import pytest
from fastapi.testclient import TestClient

import signal_connexion
import support_sawali
from server import app

CLE = "cle-signal-bfmobility"


@pytest.fixture(scope="module")
def c():
    with TestClient(app) as client:
        yield client


@pytest.fixture
def recus(monkeypatch):
    """Clé saisie + faux SAWALI (MockTransport) qui note chaque requête reçue."""
    monkeypatch.setenv("LILUVINE_WA_HMAC", CLE)
    monkeypatch.setenv("SAWALI_API_URL", "https://sawali.test")
    liste = []

    def repondre(requete: httpx.Request) -> httpx.Response:
        liste.append(requete)
        return httpx.Response(200, json={"ok": True, "alerte": True, "raison": None})

    monkeypatch.setattr(signal_connexion, "_transport", httpx.MockTransport(repondre))
    signal_connexion._visites.clear()
    yield liste
    signal_connexion._visites.clear()


def attendre(c):
    """Les envois partent en arrière-plan : on attend qu'ils soient terminés."""
    c.portal.call(signal_connexion.attendre_envois)


def test_connexion_signal_signe(c, recus):
    r = c.post("/api/auth/connexion", json={"identifiant": "admin@test.bf", "mot_de_passe": "admin-test-123"},
               headers={"X-Forwarded-For": "41.203.1.2, 10.0.0.1", "User-Agent": "Mozilla/5.0 Test"})
    assert r.status_code == 200
    attendre(c)
    assert len(recus) == 1
    req = recus[0]
    assert str(req.url) == "https://sawali.test/api/webhook/plateforme-connexion"
    brut = req.content.decode("utf-8")
    # Signature identique à celle de SAWALI : HMAC-SHA256(clé, "<horodatage>.<corps brut>")
    assert req.headers["X-Signature"] == support_sawali.signer(CLE, req.headers["X-Timestamp"], brut)
    assert req.headers["X-Emetteur"] == "bfmobility"
    corps = json.loads(brut)
    assert corps["type"] == "connexion" and corps["ip"] == "41.203.1.2" and corps["role"] == "admin"
    assert corps["agent"] == "Mozilla/5.0 Test" and corps["url_site"]
    # Aucun secret dans le corps
    assert "mot_de_passe" not in brut and "admin-test-123" not in brut and CLE not in brut


def test_echec_de_connexion_sans_signal(c, recus):
    r = c.post("/api/auth/connexion", json={"identifiant": "admin@test.bf", "mot_de_passe": "faux"})
    assert r.status_code == 401
    attendre(c)
    assert recus == []


def test_visite_limitee(c, recus):
    entetes = {"User-Agent": "Mozilla/5.0 Test", "X-Forwarded-For": "41.203.9.9"}
    for _ in range(3):
        assert c.post("/api/presence/visite", json={"visiteur": "abc123", "page": "/"}, headers=entetes).json() == {"ok": True}
    # Autre identifiant, même IP : toujours limité
    c.post("/api/presence/visite", json={"visiteur": "autre", "page": "/"}, headers=entetes)
    attendre(c)
    assert len(recus) == 1
    corps = json.loads(recus[0].content)
    assert corps["type"] == "visite" and corps["visiteur"] == "abc123" and corps["utilisateur"] is None
    # Robot évident : ignoré
    c.post("/api/presence/visite", json={"visiteur": "robot", "page": "/"},
           headers={"User-Agent": "Googlebot/2.1", "X-Forwarded-For": "66.249.0.1"})
    attendre(c)
    assert len(recus) == 1


def test_rien_si_non_configure(c, recus, monkeypatch):
    monkeypatch.delenv("LILUVINE_WA_HMAC", raising=False)
    c.post("/api/auth/connexion", json={"identifiant": "admin@test.bf", "mot_de_passe": "admin-test-123"})
    c.post("/api/presence/visite", json={"visiteur": "x1", "page": "/"}, headers={"User-Agent": "Mozilla/5.0"})
    attendre(c)
    assert recus == []


def test_sawali_injoignable_sans_erreur(c, recus, monkeypatch):
    def panne(requete):
        raise httpx.ConnectError("injoignable")

    monkeypatch.setattr(signal_connexion, "_transport", httpx.MockTransport(panne))
    r = c.post("/api/auth/connexion", json={"identifiant": "admin@test.bf", "mot_de_passe": "admin-test-123"})
    assert r.status_code == 200 and r.json()["jeton"]
    attendre(c)
    # Appel direct : renvoie None, ne lève rien
    assert c.portal.call(signal_connexion.envoyer, {"type": "connexion"}) is None
