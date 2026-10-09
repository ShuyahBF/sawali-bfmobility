"""Lot 9 — photos des véhicules : 4 vues (face, cabine avant, cabine arrière, coffre), envoi / remplacement /
suppression par la direction, galerie publique par catégorie (sans immatriculation), image servie en cache."""
import base64

import pytest
from fastapi.testclient import TestClient

import server

# Plus petites images valides (en-têtes suffisants pour la détection du format)
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64 + b"\xff\xd9"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


def data_url(octets: bytes, mime: str = "image/jpeg") -> str:
    return f"data:{mime};base64," + base64.b64encode(octets).decode()


@pytest.fixture(scope="module")
def c():
    with TestClient(server.app) as client:
        yield client


def connexion(c, identifiant, mdp):
    r = c.post("/api/auth/connexion", json={"identifiant": identifiant, "mot_de_passe": mdp})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['jeton']}"}


def test_photos_back_office_et_galerie_publique(c):
    admin = connexion(c, "admin@test.bf", "admin-test-123")
    vehicules = c.get("/api/admin/vehicules", headers=admin).json()
    v = vehicules[0] if isinstance(vehicules, list) else vehicules["lignes"][0]
    vid, cat = v["id"], v["categorie"]

    # Les 4 emplacements, vides au départ
    vues = c.get(f"/api/admin/vehicules/{vid}/photos", headers=admin).json()["vues"]
    assert [x["vue"] for x in vues] == ["face", "cabine_avant", "cabine_arriere", "coffre"]
    assert all(x["url"] is None for x in vues)

    # Un client ne peut pas envoyer de photo ; vue inconnue et faux fichier refusés
    client_hdr = connexion(c, "70112233", "client123")
    assert c.put(f"/api/admin/vehicules/{vid}/photos/face", headers=client_hdr, json={"image": data_url(JPEG)}).status_code == 403
    assert c.put(f"/api/admin/vehicules/{vid}/photos/toit", headers=admin, json={"image": data_url(JPEG)}).status_code == 422
    assert c.put(f"/api/admin/vehicules/{vid}/photos/face", headers=admin, json={"image": data_url(b"pas une image", "text/plain")}).status_code == 415

    # Envoi de la vue de face puis du coffre (PNG) ; l'image est servie avec son type et un cache long
    r = c.put(f"/api/admin/vehicules/{vid}/photos/face", headers=admin, json={"image": data_url(JPEG)})
    assert r.status_code == 200, r.text
    url_face = r.json()["url"]
    img = c.get(url_face)
    assert img.status_code == 200 and img.headers["content-type"] == "image/jpeg" and img.content == JPEG
    assert "max-age" in img.headers["cache-control"]
    c.put(f"/api/admin/vehicules/{vid}/photos/coffre", headers=admin, json={"image": data_url(PNG, "image/png")})

    # Galerie publique de la catégorie : vues dans l'ordre, jamais d'immatriculation ni de chauffeur
    galerie = c.get(f"/api/public/categories/{cat}/vehicules").json()
    fiche = next(x for x in galerie if x["id"] == vid)
    assert [p["vue"] for p in fiche["photos"]] == ["face", "coffre"]
    assert "immatriculation" not in fiche and "chauffeur_id" not in fiche

    # Remplacement : nouvelle adresse, l'ancienne image n'existe plus
    nouvelle = c.put(f"/api/admin/vehicules/{vid}/photos/face", headers=admin, json={"image": data_url(PNG, "image/png")}).json()["url"]
    assert nouvelle != url_face and c.get(url_face).status_code == 404

    # Suppression d'une vue, puis du véhicule : ses photos disparaissent
    assert c.delete(f"/api/admin/vehicules/{vid}/photos/coffre", headers=admin).json() == {"ok": True}
    assert [p["vue"] for p in next(x for x in c.get(f"/api/public/categories/{cat}/vehicules").json() if x["id"] == vid)["photos"]] == ["face"]
    assert c.delete(f"/api/admin/vehicules/{vid}", headers=admin).status_code == 200
    assert c.get(nouvelle).status_code == 404
    assert all(x["id"] != vid for x in c.get(f"/api/public/categories/{cat}/vehicules").json())


def test_photo_trop_lourde_refusee(c):
    admin = connexion(c, "admin@test.bf", "admin-test-123")
    vehicules = c.get("/api/admin/vehicules", headers=admin).json()
    v = vehicules[0] if isinstance(vehicules, list) else vehicules["lignes"][0]
    lourde = b"\xff\xd8\xff" + b"\x00" * (2 * 1024 * 1024 + 10)
    assert c.put(f"/api/admin/vehicules/{v['id']}/photos/face", headers=admin, json={"image": data_url(lourde)}).status_code == 413
