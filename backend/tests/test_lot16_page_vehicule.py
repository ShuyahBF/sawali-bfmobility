"""Lot 16 — photos des véhicules à côté des tarifs (aperçu par catégorie) et page publique d'un véhicule
(photos, description, classe et tarifs), sans immatriculation ni document."""
import base64

import pytest
from fastapi.testclient import TestClient

import server

# Plus petite image JPEG valide (en-têtes suffisants pour la détection du format)
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64 + b"\xff\xd9"


@pytest.fixture(scope="module")
def c():
    with TestClient(server.app) as client:
        yield client


def connexion(c, identifiant, mdp):
    r = c.post("/api/auth/connexion", json={"identifiant": identifiant, "mot_de_passe": mdp})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['jeton']}"}


def test_apercu_des_tarifs_et_page_du_vehicule(c):
    admin = connexion(c, "admin@test.bf", "admin-test-123")
    vehicules = c.get("/api/admin/vehicules", headers=admin).json()
    v = vehicules[0] if isinstance(vehicules, list) else vehicules["lignes"][0]
    vid, cat = v["id"], v["categorie"]

    # La direction saisit la description et envoie la photo de face
    r = c.patch(f"/api/admin/vehicules/{vid}", headers=admin, json={"description": "Berline climatisée, idéale pour l'aéroport."})
    assert r.status_code == 200, r.text
    image = "data:image/jpeg;base64," + base64.b64encode(JPEG).decode()
    assert c.put(f"/api/admin/vehicules/{vid}/photos/face", headers=admin, json={"image": image}).status_code == 200

    # Tableau des tarifs : la catégorie porte l'aperçu (au plus 3 vignettes) avec le lien vers la page du véhicule
    categories = c.get("/api/public/categories").json()
    apercu = next(x for x in categories if x["code"] == cat)["apercu_vehicules"]
    assert 1 <= len(apercu) <= 3
    vignette = next(x for x in apercu if x["id"] == vid)
    assert vignette["photo_url"] and vignette["nom"]

    # Page du véhicule : description, photos et classe avec ses tarifs ; aucune donnée administrative
    page = c.get(f"/api/public/vehicules/{vid}").json()
    assert page["description"].startswith("Berline")
    assert [p["vue"] for p in page["photos"]][0] == "face"
    assert page["classe"]["code"] == cat and "prix_km" in page["classe"]
    texte = str(page)
    assert v["immatriculation"] not in texte
    assert "carte_grise" not in page and "documents" not in page and "chauffeur" not in texte

    # Véhicule inconnu : 404
    assert c.get("/api/public/vehicules/inconnu").status_code == 404


def test_vitrine_nos_vehicules(c):
    """Lot 19 — galerie de l'accueil : véhicules avec photo, nom, classe ; jamais d'immatriculation."""
    vitrine = c.get("/api/public/vehicules").json()
    assert vitrine, "le test précédent a mis une photo sur un véhicule"
    carte = vitrine[0]
    assert {"id", "nom", "classe", "categorie", "photo_url", "disponible"} <= set(carte)
    assert "immatriculation" not in str(vitrine)


def test_fiche_technique_publique(c):
    """Lot 20 — la fiche technique saisie dans le back-office apparaît sur la page publique du véhicule."""
    admin = connexion(c, "admin@test.bf", "admin-test-123")
    vehicules = c.get("/api/admin/vehicules", headers=admin).json()
    v = vehicules[0] if isinstance(vehicules, list) else vehicules["lignes"][0]
    r = c.patch(f"/api/admin/vehicules/{v['id']}", headers=admin, json={
        "interieur": ["Volant chauffant", "Toit panoramique"], "sieges": ["Sièges avant chauffants"],
        "ecran_pouces": 10.1, "ecran": "Écran tactile avant", "audio_hp": 6, "climatisation": ["Climatisation automatique"],
        "securite": ["6 airbags", "ABS"], "boite": "automatique", "puissance_ch": 120})
    assert r.status_code == 200, r.text
    tech = c.get(f"/api/public/vehicules/{v['id']}").json()["technique"]
    assert tech["interieur"] == ["Volant chauffant", "Toit panoramique"] and tech["ecran_pouces"] == 10.1
    assert tech["audio_hp"] == 6 and tech["boite"] == "automatique" and "immatriculation" not in tech
    # Valeur hors liste refusée
    assert c.patch(f"/api/admin/vehicules/{v['id']}", headers=admin, json={"boite": "robot"}).status_code == 422
