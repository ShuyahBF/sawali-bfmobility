"""SAWALI lot 90 — relais du support SAWALI : requête signée (HMAC), identité de l'utilisateur, erreurs lisibles.
Aucun appel réseau réel (transport simulé)."""
import asyncio
import hashlib
import hmac
import json

import httpx
import pytest
from fastapi import HTTPException

import support_sawali as ss


def test_relais_signe(monkeypatch):
    """Le corps part signé avec la clé d'émetteur, vers l'adresse déduite de LILUVINE_WA_URL."""
    monkeypatch.setenv("LILUVINE_WA_HMAC", "cle-test")
    monkeypatch.setenv("LILUVINE_WA_EMETTEUR", "bfmobility")
    monkeypatch.setenv("LILUVINE_WA_URL", "https://api.exemple.test/api/webhook/liluvine-send")
    monkeypatch.delenv("SAWALI_API_URL", raising=False)
    vus = {}

    def repondre(requete: httpx.Request):
        vus["url"] = str(requete.url)
        vus["entetes"] = requete.headers
        vus["corps"] = requete.content.decode()
        return httpx.Response(200, json={"ok": True})

    monkeypatch.setattr(ss, "_transport", httpx.MockTransport(repondre))
    r = asyncio.new_event_loop().run_until_complete(
        ss.appeler_sawali("/support-plateforme/messages", {"utilisateur": {"id": "u1"}, "texte": "Bonjour"}))
    assert r == {"ok": True}
    assert vus["url"] == "https://api.exemple.test/api/support-plateforme/messages"
    h = vus["entetes"]
    attendu = hmac.new(b"cle-test", f"{h['X-Timestamp']}.{vus['corps']}".encode(), hashlib.sha256).hexdigest()
    assert h["X-Emetteur"] == "bfmobility" and h["X-Signature"] == attendu
    assert json.loads(vus["corps"])["texte"] == "Bonjour"


def test_erreurs_lisibles(monkeypatch):
    """Sans clé : 503 ; support non activé chez SAWALI (403) : message clair ; jamais la clé dans l'erreur."""
    monkeypatch.delenv("LILUVINE_WA_HMAC", raising=False)
    with pytest.raises(HTTPException) as e:
        asyncio.new_event_loop().run_until_complete(ss.appeler_sawali("/x", {}))
    assert e.value.status_code == 503
    monkeypatch.setenv("LILUVINE_WA_HMAC", "cle-test")
    monkeypatch.setattr(ss, "_transport", httpx.MockTransport(lambda r: httpx.Response(403, json={})))
    with pytest.raises(HTTPException) as e:
        asyncio.new_event_loop().run_until_complete(ss.appeler_sawali("/x", {}))
    assert "pas encore activé" in e.value.detail and "cle-test" not in e.value.detail
