"""Règles métier pures : distances, prix, promotions, nuit, maintenance, stock, documents."""
from datetime import datetime, timedelta, timezone

import metier as m

OUAGA_CENTRE = {"lat": 12.3714, "lng": -1.5197}
OUAGA_2000 = {"lat": 12.3260, "lng": -1.4870}
PARAMS = {**m.PARAMETRES_DEFAUT}
ECO = {"prise_en_charge": 300, "prix_km": 250, "prix_minute": 15, "prix_heure": 5000, "prix_jour": 35000, "minimum": 1000}
MIDI = datetime(2026, 10, 9, 12, 0, tzinfo=timezone.utc)


def test_distances():
    d = m.distance_vol_oiseau_km(OUAGA_CENTRE, OUAGA_2000)
    assert 6 < d < 7
    assert m.distance_route_km(OUAGA_CENTRE, OUAGA_2000) == round(d * 1.3, 1)
    assert m.duree_minutes(25) == 60 and m.duree_minutes(0) == 1


def test_prix_course_minimum_et_arrondi():
    p = m.calculer_prix(ECO, "course", 10, 24, PARAMS, quand=MIDI)
    assert p["prix"] == 300 + 2500 + 360 and p["devise"] == "XOF" and not p["majoration_nuit"]
    petit = m.calculer_prix(ECO, "course", 1, 2, PARAMS, quand=MIDI)
    assert petit["prix"] == 1000 and any("minimum" in l["libelle"] for l in petit["detail"])
    assert m.arrondir_montant(1001, "XOF") == 1005 and m.arrondir_montant(10.234, "EUR") == 10.23


def test_location_heure_jour():
    assert m.calculer_prix(ECO, "heure", 0, 0, PARAMS, duree_heures=3, quand=MIDI)["prix"] == 15000
    assert m.calculer_prix(ECO, "jour", 0, 0, PARAMS, duree_heures=30, quand=MIDI)["prix"] == 70000   # 2 jours entamés


def test_nuit_et_promo():
    nuit = datetime(2026, 10, 9, 23, 0, tzinfo=timezone.utc)
    p = m.calculer_prix(ECO, "course", 10, 24, PARAMS, quand=nuit)
    assert p["majoration_nuit"] and p["prix"] == m.arrondir_montant(3160 * 1.2, "XOF")
    assert m.est_de_nuit(datetime(2026, 1, 1, 21, tzinfo=timezone.utc), 22, 6, decalage_heures=1)   # 22 h à Paris (UTC+1)
    promo = {**ECO, "promo": {"pourcentage": 10, "libelle": "Rentrée", "debut": None, "fin": None}}
    pp = m.calculer_prix(promo, "course", 10, 24, PARAMS, quand=MIDI)
    assert pp["prix_sans_promo"] == 3160 and pp["prix"] == m.arrondir_montant(3160 * 0.9, "XOF")
    expiree = {**ECO, "promo": {"pourcentage": 10, "fin": (MIDI - timedelta(days=1)).isoformat()}}
    assert not m.promo_active(expiree, MIDI)


def test_rapprochement_chauffeurs():
    chauffeurs = [{"id": "loin", "chauffeur": {"position": OUAGA_2000}}, {"id": "pres", "chauffeur": {"position": OUAGA_CENTRE}},
                  {"id": "sans_position", "chauffeur": {}}]
    tri = m.chauffeurs_proches(OUAGA_CENTRE, chauffeurs)
    assert [c["id"] for c in tri] == ["pres", "loin"]
    assert m.chauffeurs_proches(OUAGA_CENTRE, chauffeurs, rayon_km=1)[0]["id"] == "pres"


def test_maintenance_stock_documents():
    plan = {"intervalle_km": 10000, "dernier_km": 0, "intervalle_jours": 180, "derniere_date": (MIDI - timedelta(days=10)).isoformat()}
    assert m.etat_plan(plan, 5000, MIDI)["gravite"] == "ok"
    assert m.etat_plan(plan, 9600, MIDI)["gravite"] == "attention"
    assert m.etat_plan(plan, 10200, MIDI)["gravite"] == "urgent"
    assert m.alerte_stock({"quantite": 0, "seuil_alerte": 2, "nom": "x"})["gravite"] == "urgent"
    assert m.alerte_stock({"quantite": 2, "seuil_alerte": 2, "nom": "x"})["gravite"] == "attention"
    assert m.alerte_stock({"quantite": 5, "seuil_alerte": 2}) is None
    v = {"assurance_expire": (MIDI + timedelta(days=10)).isoformat(), "controle_technique_expire": (MIDI - timedelta(days=1)).isoformat()}
    assert {a["gravite"] for a in m.alertes_document(v, MIDI)} == {"attention", "urgent"}
    assert m.consommation([{"kilometrage": 1000, "quantite": 40}, {"kilometrage": 1400, "quantite": 60}]) == 15.0
    assert m.co2_evite_kg("electrique", 10) == 1.2 and m.numero_document("CRS", 7, MIDI) == "CRS-2026-000007"
