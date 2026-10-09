"""Lot 11 — documents des véhicules : TVM (référence, montant, mode de paiement, échéance), alerte TVM, et scans
de l'assurance, de la visite technique et de la TVM (PDF ou image, réservés au personnel, jamais publics)."""
import base64
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

import server
from metier import alertes_document

PDF = b"%PDF-1.4\n" + b"0" * 64 + b"\n%%EOF"
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64 + b"\xff\xd9"


def data_url(octets: bytes, mime: str) -> str:
    return f"data:{mime};base64," + base64.b64encode(octets).decode()


@pytest.fixture(scope="module")
def c():
    with TestClient(server.app) as client:
        yield client


def connexion(c, identifiant, mdp):
    r = c.post("/api/auth/connexion", json={"identifiant": identifiant, "mot_de_passe": mdp})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['jeton']}"}


def test_tvm_sur_la_fiche_et_alerte():
    # Alerte : TVM expirée = urgent ; libellé « Visite technique » (et non plus « Contrôle technique »)
    hier = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    a = alertes_document({"id": "v1", "immatriculation": "11 AB", "tvm_expire": hier, "controle_technique_expire": hier})
    messages = [x["message"] for x in a]
    assert any(m.startswith("TVM expiré") for m in messages)
    assert any(m.startswith("Visite technique") for m in messages)


def test_champs_tvm_et_scans(c):
    admin = connexion(c, "admin@test.bf", "admin-test-123")
    v = c.get("/api/admin/vehicules", headers=admin).json()[0]
    vid = v["id"]

    # Champs TVM enregistrés sur la fiche ; mode de paiement inconnu refusé
    r = c.patch(f"/api/admin/vehicules/{vid}", headers=admin, json={
        "tvm_reference": "DGI-2026-00451", "tvm_montant": 30000, "tvm_mode_paiement": "mobile_money",
        "tvm_paye_le": "2026-01-15", "tvm_expire": "2026-12-31", "assurance_compagnie": "SONAR"})
    assert r.status_code == 200, r.text
    lu = next(x for x in c.get("/api/admin/vehicules", headers=admin).json() if x["id"] == vid)
    assert lu["tvm_reference"] == "DGI-2026-00451" and lu["tvm_montant"] == 30000 and lu["tvm_mode_paiement"] == "mobile_money"
    assert c.patch(f"/api/admin/vehicules/{vid}", headers=admin, json={"tvm_mode_paiement": "troc"}).status_code == 422

    # Les 3 emplacements de scan, vides au départ
    docs = c.get(f"/api/admin/vehicules/{vid}/documents", headers=admin).json()["documents"]
    assert [d["document"] for d in docs] == ["carte_grise", "assurance", "visite_technique", "tvm"] and not any(d["present"] for d in docs)

    # Un client ne peut ni envoyer ni lire ; document inconnu et format refusé
    c.post("/api/auth/inscription", json={"nom": "Client TVM", "telephone": "76300000", "mot_de_passe": "client123"})
    client_hdr = connexion(c, "76300000", "client123")
    assert c.put(f"/api/admin/vehicules/{vid}/documents/tvm", headers=client_hdr, json={"fichier": data_url(PDF, "application/pdf")}).status_code == 403
    assert c.put(f"/api/admin/vehicules/{vid}/documents/permis", headers=admin, json={"fichier": data_url(PDF, "application/pdf")}).status_code == 422
    assert c.put(f"/api/admin/vehicules/{vid}/documents/tvm", headers=admin, json={"fichier": data_url(b"texte", "text/plain")}).status_code == 415

    # Scan PDF de la TVM : servi au personnel seulement, sans cache public
    r = c.put(f"/api/admin/vehicules/{vid}/documents/tvm", headers=admin, json={"fichier": data_url(PDF, "application/pdf"), "nom": "tvm-2026.pdf"})
    assert r.status_code == 200, r.text
    f = c.get(f"/api/admin/vehicules/{vid}/documents/tvm/fichier", headers=admin)
    assert f.status_code == 200 and f.headers["content-type"] == "application/pdf" and f.content == PDF
    assert "no-store" in f.headers["cache-control"]
    assert c.get(f"/api/admin/vehicules/{vid}/documents/tvm/fichier").status_code in (401, 403)
    assert c.get(f"/api/admin/vehicules/{vid}/documents/tvm/fichier", headers=client_hdr).status_code == 403

    # Remplacement par une photo (JPEG) : l'ancien scan disparaît, un seul reste
    c.put(f"/api/admin/vehicules/{vid}/documents/tvm", headers=admin, json={"fichier": data_url(JPEG, "image/jpeg")})
    docs = {d["document"]: d for d in c.get(f"/api/admin/vehicules/{vid}/documents", headers=admin).json()["documents"]}
    assert docs["tvm"]["present"] and docs["tvm"]["type"] == "image/jpeg"
    assert c.get(f"/api/admin/vehicules/{vid}/documents/tvm/fichier", headers=admin).content == JPEG

    # Suppression du scan
    assert c.delete(f"/api/admin/vehicules/{vid}/documents/tvm", headers=admin).status_code == 200
    assert c.get(f"/api/admin/vehicules/{vid}/documents/tvm/fichier", headers=admin).status_code == 404


def test_carte_grise(c):
    """Lot 12 — carte grise : informations sur la fiche et scan stocké."""
    admin = connexion(c, "admin@test.bf", "admin-test-123")
    vid = c.get("/api/admin/vehicules", headers=admin).json()[0]["id"]
    r = c.patch(f"/api/admin/vehicules/{vid}", headers=admin, json={
        "cg_numero": "BF-CG-778899", "cg_titulaire": "bfmobility SARL", "cg_date_delivrance": "2024-03-01",
        "cg_premiere_circulation": "2023-11-20", "cg_chassis": "JTDBR32E720123456", "cg_puissance_fiscale": 7,
        "cg_genre": "VP", "cg_carrosserie": "Berline"})
    assert r.status_code == 200, r.text
    lu = next(x for x in c.get("/api/admin/vehicules", headers=admin).json() if x["id"] == vid)
    assert lu["cg_numero"] == "BF-CG-778899" and lu["cg_puissance_fiscale"] == 7 and lu["cg_chassis"] == "JTDBR32E720123456"
    r = c.put(f"/api/admin/vehicules/{vid}/documents/carte_grise", headers=admin, json={"fichier": data_url(PDF, "application/pdf"), "nom": "cg.pdf"})
    assert r.status_code == 200, r.text
    assert c.get(f"/api/admin/vehicules/{vid}/documents/carte_grise/fichier", headers=admin).content == PDF
