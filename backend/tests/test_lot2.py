"""Lot 2 : connexion par code WhatsApp, paiement en ligne, relance / refus / libération, candidatures,
notifications, itinéraire routier (repli sans réseau)."""
import asyncio
import hashlib
import hmac
import time

import pytest
from fastapi.testclient import TestClient

import itineraire
import notifications
import server
from db import db
from routes import auth as route_auth, paiements

DEPART = {"lat": 12.3714, "lng": -1.5197, "adresse": "Centre"}
ARRIVEE = {"lat": 12.3260, "lng": -1.4870, "adresse": "Ouaga 2000"}


@pytest.fixture(scope="module")
def c():
    with TestClient(server.app) as client:
        yield client


def entete(c, ident, mdp):
    r = c.post("/api/auth/connexion", json={"identifiant": ident, "mot_de_passe": mdp})
    return {"Authorization": f"Bearer {r.json()['jeton']}"}


def test_fonctions_pures():
    assert paiements.montant_stripe(3500, "XOF") == 3500 and paiements.montant_stripe(12.5, "EUR") == 1250
    corps, secret, t = b'{"a":1}', "whsec_test", int(time.time())
    sig = hmac.new(secret.encode(), f"{t}.".encode() + corps, hashlib.sha256).hexdigest()
    assert paiements.signature_stripe_valide(corps, f"t={t},v1={sig}", secret)
    assert not paiements.signature_stripe_valide(corps, f"t={t},v1=faux", secret)
    assert not paiements.signature_stripe_valide(corps, f"t={t - 1000},v1={sig}", secret)   # trop ancien
    pts = [[i, i] for i in range(1000)]
    s = itineraire.simplifier(pts, 100)
    assert len(s) == 100 and s[0] == [0, 0] and s[-1] == [999, 999]
    course = {"id": "x", "numero": "CRS-2026-000001", "chauffeur": {"nom": "Awa"}, "prix_final": 3500, "devise": "XOF",
              "vehicule": {"marque": "BYD", "modele": "Atto 3", "immatriculation": "11 EV 0001"}}
    assert "Awa" in notifications.texte_notification("acceptee", course, {"nom": "bfmobility"})
    assert "3500 XOF" in notifications.texte_notification("terminee", course, {}, "en")
    assert notifications.texte_notification("inconnu", course, {}) is None


def test_estimation_sans_reseau_et_config(c):
    est = c.post("/api/public/estimation", json={"depart": DEPART, "arrivee": ARRIVEE, "categorie": "eco"}).json()
    assert est["source_distance"] == "estimation" and est["trace"] is None
    conf = c.get("/api/public/config").json()
    assert conf["paiements_en_ligne"] == {"mobile_money": False, "carte": False, "especes": True}
    assert conf["connexion_par_code"] is False


def test_connexion_par_code(c, monkeypatch):
    envoyes = {}

    async def faux_envoi(tel, code):
        envoyes[tel] = code
        return True, "whatsapp"
    monkeypatch.setattr(route_auth, "envoyer_code", faux_envoi)
    r = c.post("/api/auth/otp/demande", json={"telephone": "75 00 00 01"}).json()
    assert r["envoye"] and not r["compte_existant"]
    assert c.post("/api/auth/otp/demande", json={"telephone": "75000001"}).status_code == 429   # 1 par minute
    assert c.post("/api/auth/otp/verification", json={"telephone": "75000001", "code": "000000", "nom": "X"}).status_code in (401,)
    code = envoyes["22675000001"]
    assert c.post("/api/auth/otp/verification", json={"telephone": "75000001", "code": code}).status_code == 422   # nom requis
    ok = c.post("/api/auth/otp/verification", json={"telephone": "75000001", "code": code, "nom": "Salif"}).json()
    assert ok["utilisateur"]["role"] == "client" and ok["utilisateur"]["telephone_verifie"]
    # Code déjà utilisé : refusé
    assert c.post("/api/auth/otp/verification", json={"telephone": "75000001", "code": code}).status_code == 401


def test_relance_refus_liberation(c):
    client = c.post("/api/auth/inscription", json={"nom": "Lot2", "telephone": "76100000", "mot_de_passe": "client123"}).json()
    hc = {"Authorization": f"Bearer {client['jeton']}"}
    ch1, ch2 = entete(c, "70000001", "demo-test-123"), entete(c, "70000002", "demo-test-123")   # 2 chauffeurs « Éco »
    for h in (ch1, ch2):
        c.post("/api/chauffeur/disponibilite", headers=h, json={"en_ligne": True, "lat": 12.371, "lng": -1.52})
    course = c.post("/api/courses", headers=hc, json={"categorie": "eco", "depart": DEPART, "arrivee": ARRIVEE}).json()
    assert course["id"] in [x["id"] for x in c.get("/api/chauffeur/courses", headers=ch1).json()["proposees"]]
    # Refus : la course disparaît pour ce chauffeur, reste pour l'autre ; relance par le client
    assert c.post(f"/api/courses/{course['id']}/refuser", headers=ch1).json() == {"ok": True}
    assert course["id"] not in [x["id"] for x in c.get("/api/chauffeur/courses", headers=ch1).json()["proposees"]]
    assert c.post(f"/api/courses/{course['id']}/relancer", headers=hc).status_code == 200
    assert course["id"] not in [x["id"] for x in c.get("/api/chauffeur/courses", headers=ch1).json()["proposees"]]
    # Le 2e chauffeur accepte puis se libère : la course repart en recherche, véhicule disponible
    assert c.post(f"/api/courses/{course['id']}/accepter", headers=ch2).json()["statut"] == "acceptee"
    assert c.post(f"/api/courses/{course['id']}/relancer", headers=hc).status_code == 409
    lib = c.post(f"/api/courses/{course['id']}/liberer", headers=ch2, json={"motif": "Crevaison"}).json()
    assert lib["statut"] == "recherche" and lib["chauffeur"] is None
    assert course["id"] not in [x["id"] for x in c.get("/api/chauffeur/courses", headers=ch2).json()["proposees"]]
    c.post(f"/api/courses/{course['id']}/annuler", headers=hc, json={})


def test_paiement_en_ligne(c):
    hc = entete(c, "76100000", "client123")
    course = c.post("/api/courses", headers=hc, json={"categorie": "eco", "mode": "heure", "duree_heures": 2,
                                                     "depart": DEPART}).json()
    # Opérateurs non configurés : 503 clair
    assert c.post(f"/api/paiements/courses/{course['id']}/mobile-money", headers=hc, json={}).status_code == 503
    assert c.post(f"/api/paiements/courses/{course['id']}/carte", headers=hc).status_code == 503
    # Paiement inconnu : 404 ; la course louée (prix fixe) est payable en ligne dès la commande
    assert c.get("/api/paiements/ref-inconnue", headers=hc).status_code == 404
    c.post(f"/api/courses/{course['id']}/annuler", headers=hc, json={})


def test_application_unique_du_paiement():
    """Un paiement vérifié n'est appliqué qu'UNE fois ; un montant incohérent n'est jamais appliqué."""
    async def scenario():
        await db.courses.insert_one({"id": "cp", "numero": "CRS-T", "paiement": {"statut": "en_attente"}})
        p = {"id": "p1", "reference": "ref-1", "course_id": "cp", "client_id": "x", "moyen": "mobile_money",
             "operateur": "pawapay", "montant": 5000.0, "devise": "XOF", "statut": "en_attente", "cree_le": "2026-10-09"}
        await db.paiements.insert_one(dict(p))
        incoherent = await paiements.appliquer(p, "paye", 10.0)
        await db.paiements.update_one({"id": "p1"}, {"$set": {"statut": "en_attente"}})
        premier = await paiements.appliquer(p, "paye", 5000.0)
        second = await paiements.appliquer(p, "paye", 5000.0)
        course = await db.courses.find_one({"id": "cp"})
        return incoherent, premier, second, course["paiement"]
    incoherent, premier, second, paiement = asyncio.run(scenario())
    assert (incoherent, premier, second) == (False, True, False)
    assert paiement["statut"] == "paye" and paiement["reference"] == "ref-1" and paiement["operateur"] == "pawapay"


def test_candidatures(c):
    assert c.post("/api/public/candidatures", json={"nom": "Ali Chauffeur", "telephone": "77000000", "ville": "Ouagadougou"}).json() == {"ok": True}
    assert c.post("/api/public/candidatures", json={"nom": "Ali Chauffeur", "telephone": "77000000"}).status_code == 409
    admin = entete(c, "admin@test.bf", "admin-test-123")
    liste = c.get("/api/admin/candidatures", headers=admin).json()
    assert liste[0]["statut"] == "nouvelle"
    assert c.patch(f"/api/admin/candidatures/{liste[0]['id']}", headers=admin, json={"statut": "contactee"}).json()["statut"] == "contactee"
