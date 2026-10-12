"""Page Facebook de bfmobility animée par Liluvine (SAWALI) : candidats (véhicules DISPONIBLES d'une classe active, avec
photo à adresse absolue, tarifs de la classe, lien vers la page du véhicule ; jamais d'immatriculation, de chauffeur
ni de donnée personnelle), publication notée (facebook_publie) et véhicule non reproposé avant 30 jours ;
signature exigée comme pour les autres retours.
Lancer : cd backend && python -m pytest tests/test_partage_facebook.py -q
"""
import base64
import json
import time

import pytest
from fastapi.testclient import TestClient

import partage_facebook
import transmission_wa
from config import get_settings
from db import db
from server import app

CLE = "cle-facebook-bfmobility"
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64 + b"\xff\xd9"     # plus petite image JPEG valide


@pytest.fixture(scope="module")
def c():
    with TestClient(app) as client:
        yield client


@pytest.fixture(autouse=True)
def cle(monkeypatch):
    monkeypatch.setenv("LILUVINE_WA_HMAC", CLE)


def appel(c, corps, cle=CLE, **entetes):
    """Requête signée comme le fait SAWALI."""
    brut = json.dumps(corps, ensure_ascii=False)
    ts = str(int(time.time()))
    return c.post("/api/webhooks/liluvine-retour", content=brut, headers={
        "X-Emetteur": "sawali", "X-Timestamp": ts, "X-Signature": transmission_wa.signer(cle, ts, brut),
        "Content-Type": "application/json", **entetes})


def connexion(c):
    r = c.post("/api/auth/connexion", json={"identifiant": "admin@test.bf", "mot_de_passe": "admin-test-123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['jeton']}"}


def _photo(c, admin, vid):
    image = "data:image/jpeg;base64," + base64.b64encode(JPEG).decode()
    assert c.put(f"/api/admin/vehicules/{vid}/photos/face", headers=admin, json={"image": image}).status_code == 200


def test_candidats_filtres_et_sans_donnee_personnelle(c):
    admin = connexion(c)
    liste = c.get("/api/admin/vehicules", headers=admin).json()
    vehicules = liste if isinstance(liste, list) else liste["lignes"]
    dispo, hors = vehicules[0], vehicules[1]
    c.patch(f"/api/admin/vehicules/{dispo['id']}", headers=admin, json={"description": "Berline   climatisée, idéale pour l'aéroport."})
    _photo(c, admin, dispo["id"])
    _photo(c, admin, hors["id"])
    c.portal.call(db.vehicules.update_one, {"id": dispo["id"]}, {"$set": {"statut": "disponible"}})
    c.portal.call(db.vehicules.update_one, {"id": hors["id"]}, {"$set": {"statut": "hors_service"}})

    r = appel(c, {"type": "facebook_candidats", "nombre": 15}, **{"X-Forwarded-Proto": "https"})
    assert r.status_code == 200
    cands = r.json()["candidats"]
    ids = [x["element_id"] for x in cands]
    assert dispo["id"] in ids and hors["id"] not in ids
    # Véhicule sans photo : jamais proposé
    sans_photo = [v["id"] for v in vehicules if not c.portal.call(db.vehicules.find_one, {"id": v["id"]}).get("photos")]
    assert not set(sans_photo) & set(ids)

    x = next(v for v in cands if v["element_id"] == dispo["id"])
    assert x["type"] == "vehicule" and x["nom"].startswith(dispo["marque"]) and x["classe"]
    assert x["description"] == "Berline climatisée, idéale pour l'aéroport."
    assert "F CFA / km" in x["tarif_txt"]
    assert x["photo_url"].startswith("https://") and "/api/public/photos-vehicules/" in x["photo_url"]
    assert x["lien"] == f"{get_settings().public_site_url}/vehicule/{dispo['id']}"
    # Jamais l'immatriculation, le chauffeur ni les documents
    texte = json.dumps(cands)
    assert dispo["immatriculation"] not in texte and "chauffeur" not in texte and "carte_grise" not in texte
    assert set(x) == {"element_id", "type", "nom", "classe", "description", "tarif_txt", "prix_fcfa", "photo_url", "lien"}
    # Rien n'est gardé au journal des retours pour ces demandes
    assert c.portal.call(db.retours_sawali.count_documents, {"type": "facebook_candidats"}) == 0


def test_adresse_publique_reglee(c, monkeypatch):
    monkeypatch.setattr(get_settings(), "public_api_url", "https://bfmobility-backend.onrender.com/api")
    cands = appel(c, {"type": "facebook_candidats", "nombre": 15}).json()["candidats"]
    assert cands and all(x["photo_url"].startswith("https://bfmobility-backend.onrender.com/api/public/") for x in cands)


def test_facebook_publie_et_delai(c):
    cands = appel(c, {"type": "facebook_candidats", "nombre": 15}).json()["candidats"]
    vid = cands[0]["element_id"]
    assert appel(c, {"type": "facebook_publie", "element_id": vid, "post_id": "123_456"}).json() == {"ok": True}
    v = c.portal.call(db.vehicules.find_one, {"id": vid})
    assert v["facebook_post_id"] == "123_456" and v["facebook_publie_le"]
    assert vid not in [x["element_id"] for x in appel(c, {"type": "facebook_candidats", "nombre": 15}).json()["candidats"]]
    assert appel(c, {"type": "facebook_publie", "element_id": "inconnu"}).json() == {"ok": False}


def test_tarif_texte():
    assert partage_facebook.tarif_texte({"prix_km": 250, "prix_heure": 5000, "prix_jour": 35000}) == \
        "250 F CFA / km · 5 000 F CFA / heure · 35 000 F CFA / jour"
    assert partage_facebook.tarif_texte({"prix_km": 0}) == "Tarif sur demande"


def test_signature_exigee(c):
    assert appel(c, {"type": "facebook_candidats"}, cle="mauvaise").status_code == 401
    assert c.post("/api/webhooks/liluvine-retour", json={"type": "facebook_candidats"}).status_code == 401
