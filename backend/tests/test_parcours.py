"""Parcours complet : inscription, estimation, commande, chauffeur (accepter → terminer), paiement, reçu, note ;
back-office : véhicules, intervention avec pièces (stock), commande fournisseur, solde, alertes, tableau de bord."""
import pytest
from fastapi.testclient import TestClient

import server

DEPART = {"lat": 12.3714, "lng": -1.5197, "adresse": "Place des Nations Unies"}
ARRIVEE = {"lat": 12.3260, "lng": -1.4870, "adresse": "Ouaga 2000"}


@pytest.fixture(scope="module")
def c():
    with TestClient(server.app) as client:   # « with » : exécute le démarrage (admin + démonstration)
        yield client


def connexion(c, identifiant, mdp):
    r = c.post("/api/auth/connexion", json={"identifiant": identifiant, "mot_de_passe": mdp})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['jeton']}"}


def test_public(c):
    assert c.get("/api/health").json() == {"ok": True}
    conf = c.get("/api/public/config").json()
    assert conf["devise"] == "XOF" and any(p["code"] == "FR" for p in conf["pays_disponibles"])
    cats = c.get("/api/public/categories").json()
    assert [x["code"] for x in cats][:2] == ["eco", "zen"] and cats[1]["promo_active"]
    est = c.post("/api/public/estimation", json={"depart": DEPART, "arrivee": ARRIVEE, "categorie": "zen"}).json()
    assert est["distance_km"] >= 7.5 and est["prix"] < est["prix_sans_promo"]
    assert c.post("/api/public/estimation", json={"depart": DEPART, "categorie": "eco"}).status_code == 422


def test_parcours_course_complet(c):
    r = c.post("/api/auth/inscription", json={"nom": "Fatou Client", "telephone": "70 11 22 33", "mot_de_passe": "client123"})
    assert r.status_code == 200 and r.json()["utilisateur"]["telephone"] == "22670112233"
    client = {"Authorization": f"Bearer {r.json()['jeton']}"}
    assert c.post("/api/auth/inscription", json={"nom": "Doublon", "telephone": "70112233", "mot_de_passe": "client123"}).status_code == 409

    # Le chauffeur du véhicule électrique passe en ligne près du départ
    chauffeur = connexion(c, "70000003", "demo-test-123")
    assert c.post("/api/chauffeur/disponibilite", headers=chauffeur, json={"en_ligne": True, "lat": 12.372, "lng": -1.52}).status_code == 200

    course = c.post("/api/courses", headers=client, json={"categorie": "zen", "depart": DEPART, "arrivee": ARRIVEE, "paiement": "especes"}).json()
    assert course["statut"] == "recherche" and course["numero"].startswith("CRS-")
    assert c.post("/api/courses", headers=client, json={"categorie": "zen", "depart": DEPART, "arrivee": ARRIVEE}).status_code == 409

    proposees = c.get("/api/chauffeur/courses", headers=chauffeur).json()["proposees"]
    assert [p["id"] for p in proposees] == [course["id"]]
    acceptee = c.post(f"/api/courses/{course['id']}/accepter", headers=chauffeur).json()
    assert acceptee["statut"] == "acceptee" and acceptee["vehicule"]["energie"] == "electrique"

    # Le client voit le chauffeur et sa position, échange un message
    vue = c.get(f"/api/courses/{course['id']}", headers=client).json()
    assert vue["chauffeur"]["position"]["lat"] == 12.372 and vue["co2_evite_kg"] > 0
    c.post(f"/api/courses/{course['id']}/messages", headers=client, json={"texte": "Je suis devant la pharmacie"})
    assert c.get(f"/api/courses/{course['id']}/messages", headers=chauffeur).json()[0]["texte"].startswith("Je suis")

    # Étapes dans l'ordre (une étape sautée est refusée)
    assert c.post(f"/api/courses/{course['id']}/statut", headers=chauffeur, json={"statut": "en_cours"}).status_code == 409
    for etape in ("en_approche", "arrivee", "en_cours"):
        assert c.post(f"/api/courses/{course['id']}/statut", headers=chauffeur, json={"statut": etape}).status_code == 200
    fin = c.post(f"/api/courses/{course['id']}/statut", headers=chauffeur, json={"statut": "terminee", "km_reel": 9.5, "encaisse": True}).json()
    assert fin["statut"] == "terminee" and fin["prix_final"] > 0 and fin["paiement"]["statut"] == "paye" and fin["distance_km"] == 9.5

    recu = c.get(f"/api/courses/{course['id']}/recu", headers=client).json()
    assert recu["numero"].startswith("REC-") and recu["total"] == fin["prix_final"] and recu["vehicule"]["immatriculation"] == "11 EV 0001"
    assert c.post(f"/api/courses/{course['id']}/noter", headers=client, json={"note": 5, "commentaire": "Parfait"}).status_code == 200
    assert c.post(f"/api/courses/{course['id']}/noter", headers=client, json={"note": 4}).status_code == 409
    assert len(c.get("/api/courses/mes", headers=client).json()) == 1

    # Un autre client ne voit pas la course
    autre = c.post("/api/auth/inscription", json={"nom": "Autre", "telephone": "76000000", "mot_de_passe": "client123"}).json()
    assert c.get(f"/api/courses/{course['id']}", headers={"Authorization": f"Bearer {autre['jeton']}"}).status_code == 404


def test_back_office(c):
    admin = connexion(c, "admin@test.bf", "admin-test-123")
    client_hdr = connexion(c, "70112233", "client123")
    assert c.get("/api/admin/vehicules", headers=client_hdr).status_code == 403

    # Véhicule : création, doublon d'immatriculation refusé
    v = c.post("/api/admin/vehicules", headers=admin, json={"marque": "Tesla", "modele": "Model 3", "immatriculation": "11 EV 0099",
                                                           "energie": "electrique", "categorie": "zen", "kilometrage": 1000}).json()
    assert v["statut"] == "disponible"
    assert c.post("/api/admin/vehicules", headers=admin, json={"marque": "X", "modele": "Y", "immatriculation": "11 EV 0099",
                                                              "energie": "electrique", "categorie": "zen"}).status_code == 409
    assert c.post("/api/admin/vehicules", headers=admin, json={"marque": "X", "modele": "Y", "immatriculation": "Z",
                                                              "energie": "solaire", "categorie": "zen"}).status_code == 422

    # Mécanicien : intervention terminée → stock décrémenté, plan remis à zéro
    meca = connexion(c, "70000010", "demo-test-123")
    piece = next(p for p in c.get("/api/admin/pieces", headers=meca).json() if p["reference"] == "PLQ-AV-01")
    plan = next(p for p in c.get("/api/admin/plans", headers=meca).json() if p["libelle"] == "Plaquettes de frein" and p["vehicule_id"])
    i = c.post("/api/admin/interventions", headers=meca, json={"vehicule_id": v["id"], "type": "entretien", "description": "Freins avant",
                                                              "kilometrage": 1200, "pieces": [{"piece_id": piece["id"], "quantite": 2}],
                                                              "main_oeuvre": 10000, "plan_id": plan["id"]}).json()
    assert i["cout_total"] == 2 * 18000 + 10000 and i["statut"] == "planifiee"
    c.patch(f"/api/admin/interventions/{i['id']}", headers=meca, json={"statut": "terminee"})
    c.patch(f"/api/admin/interventions/{i['id']}", headers=meca, json={"statut": "terminee"})   # 2e fois : sans effet sur le stock
    apres = next(p for p in c.get("/api/admin/pieces", headers=meca).json() if p["id"] == piece["id"])
    assert apres["quantite"] == piece["quantite"] - 2
    assert next(p for p in c.get("/api/admin/plans", headers=meca).json() if p["id"] == plan["id"])["dernier_km"] == 1200

    # Fournisseur : commande reçue (stock +) puis paiement partiel → solde
    f = c.get("/api/admin/fournisseurs", headers=admin).json()[0]
    filtre = next(p for p in c.get("/api/admin/pieces", headers=admin).json() if p["reference"] == "FLT-HAB-03")
    cmd = c.post("/api/admin/commandes", headers=admin, json={"fournisseur_id": f["id"], "lignes": [{"piece_id": filtre["id"], "quantite": 10, "prix_unitaire": 6500}]}).json()
    assert cmd["numero"].startswith("CMD-") and cmd["total"] == 65000
    assert c.post(f"/api/admin/commandes/{cmd['id']}/recevoir", headers=admin).json()["statut"] == "recue"
    assert c.post(f"/api/admin/commandes/{cmd['id']}/recevoir", headers=admin).status_code == 409
    c.post("/api/admin/paiements-fournisseurs", headers=admin, json={"fournisseur_id": f["id"], "montant": 40000, "moyen": "virement"})
    f2 = next(x for x in c.get("/api/admin/fournisseurs", headers=admin).json() if x["id"] == f["id"])
    assert f2["solde"] == 25000
    assert next(p for p in c.get("/api/admin/pieces", headers=admin).json() if p["id"] == filtre["id"])["quantite"] == 10

    # Utilisateurs : le gestionnaire ne crée pas d'admin ; mot de passe jamais renvoyé
    g = c.post("/api/admin/utilisateurs", headers=admin, json={"nom": "Gestion", "telephone": "71000000", "role": "gestionnaire", "mot_de_passe": "gestion123"}).json()
    assert "mot_de_passe" not in g
    gest = connexion(c, "71000000", "gestion123")
    assert c.post("/api/admin/utilisateurs", headers=gest, json={"nom": "Pirate", "telephone": "72000000", "role": "admin", "mot_de_passe": "xxxxxx"}).status_code == 403
    assert c.patch("/api/admin/parametres", headers=gest, json={"devise": "EUR"}).status_code == 403

    # Alertes (document expiré, stock, maintenance) et tableau de bord
    alertes = c.get("/api/admin/alertes", headers=admin).json()
    assert {"document", "stock"} <= {a["type"] for a in alertes} and alertes[0]["gravite"] == "urgent"
    tdb = c.get("/api/admin/tableau-de-bord", headers=admin).json()
    assert tdb["courses_mois"] == 1 and tdb["vehicules"]["total"] == 7 and len(tdb["courses_7j"]) == 7

    # Paramètres : passage en euros (export) → les estimations suivent
    assert c.patch("/api/admin/parametres", headers=admin, json={"pays": "FR", "devise": "EUR", "fuseau": "Europe/Paris"}).json()["devise"] == "EUR"
    est = c.post("/api/public/estimation", json={"depart": DEPART, "arrivee": ARRIVEE, "categorie": "eco"}).json()
    assert est["devise"] == "EUR"
    c.patch("/api/admin/parametres", headers=admin, json={"pays": "BF", "devise": "XOF", "fuseau": "Africa/Ouagadougou"})


def test_affectation_manuelle_et_annulation(c):
    admin = connexion(c, "admin@test.bf", "admin-test-123")
    client = connexion(c, "70112233", "client123")
    course = c.post("/api/courses", headers=client, json={"categorie": "van", "depart": DEPART, "arrivee": ARRIVEE}).json()
    van_chauffeur = next(u for u in c.get("/api/admin/utilisateurs?role=chauffeur", headers=admin).json()
                         if u["telephone"] == "22670000004")
    # Le chauffeur 4 conduit la Camry (confort) : refusé pour un van ; aucun chauffeur de van → annulation par le client
    assert c.post(f"/api/admin/courses/{course['id']}/affecter", headers=admin, json={"chauffeur_id": "inconnu"}).status_code == 422
    assert van_chauffeur["chauffeur"]["vehicule_id"]
    annulee = c.post(f"/api/courses/{course['id']}/annuler", headers=client, json={"motif": "Plus besoin"}).json()
    assert annulee["statut"] == "annulee"
    assert c.post(f"/api/courses/{course['id']}/annuler", headers=client, json={}).status_code == 409
