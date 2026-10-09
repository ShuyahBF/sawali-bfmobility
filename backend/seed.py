"""Données de départ : premier administrateur (variables d'environnement) et, si SEED_DEMO=1, une démonstration
complète (catégories et tarifs, véhicules électriques / hybrides / thermiques, chauffeurs, pièces, fournisseur, plans).
Les mots de passe ne sont JAMAIS écrits dans le code : ADMIN_MOT_DE_PASSE (et DEMO_MOT_DE_PASSE pour la démo)."""
from __future__ import annotations

import os
from datetime import timedelta

from config import get_settings
from db import db
from metier import iso, maintenant
from outils import nouvel_id
from securite import hacher, normaliser_telephone


async def creer_admin() -> None:
    """Premier administrateur, seulement s'il n'existe encore aucun administrateur."""
    r = get_settings()
    if not r.admin_mot_de_passe or not (r.admin_email or r.admin_telephone):
        return
    if await db.utilisateurs.find_one({"role": "admin"}):
        return
    u = {"id": nouvel_id(), "nom": "Administrateur", "role": "admin", "actif": True, "langue": "fr",
         "mot_de_passe": hacher(r.admin_mot_de_passe), "cree_le": iso()}
    if r.admin_email:
        u["email"] = r.admin_email.strip().lower()
    if r.admin_telephone:
        u["telephone"] = normaliser_telephone(r.admin_telephone)
    await db.utilisateurs.insert_one(u)


CATEGORIES_DEMO = [
    {"code": "eco", "nom": "Éco", "description": "Le trajet malin du quotidien", "energies": ["hybride", "thermique"],
     "places": 4, "confort": ["Climatisation"], "prise_en_charge": 300, "prix_km": 250, "prix_minute": 15,
     "prix_heure": 5000, "prix_jour": 35000, "minimum": 1000, "ordre": 1, "icone": "🚗"},
    {"code": "zen", "nom": "Zen électrique", "description": "100 % électrique, silencieux et zéro émission",
     "energies": ["electrique"], "places": 4, "confort": ["Climatisation", "Chargeur USB", "Wi-Fi"],
     "prise_en_charge": 400, "prix_km": 275, "prix_minute": 15, "prix_heure": 6000, "prix_jour": 42000, "minimum": 1200,
     "ordre": 2, "icone": "⚡", "promo": {"pourcentage": 15, "libelle": "Lancement électrique", "debut": None, "fin": None}},
    {"code": "confort", "nom": "Confort", "description": "Berline spacieuse, chauffeur expérimenté",
     "energies": ["hybride", "electrique"], "places": 4, "confort": ["Climatisation", "Sièges cuir", "Eau offerte", "Wi-Fi"],
     "prise_en_charge": 600, "prix_km": 400, "prix_minute": 20, "prix_heure": 9000, "prix_jour": 60000, "minimum": 2000, "ordre": 3, "icone": "🛋️"},
    {"code": "van", "nom": "Van", "description": "Jusqu'à 7 passagers et leurs bagages", "energies": ["thermique", "hybride"],
     "places": 7, "confort": ["Climatisation", "Grand coffre"], "prise_en_charge": 800, "prix_km": 450, "prix_minute": 20,
     "prix_heure": 10000, "prix_jour": 70000, "minimum": 2500, "ordre": 4, "icone": "🚐"},
]


async def creer_demo() -> None:
    """Démonstration (une seule fois, si aucune catégorie n'existe). Ouagadougou comme ville d'exemple."""
    if await db.categories.count_documents({}) > 0:
        return
    for c in CATEGORIES_DEMO:
        await db.categories.insert_one({"id": nouvel_id(), "actif": True, "promo": None, **c, "cree_le": iso()})
    dans = lambda j: iso(maintenant() + timedelta(days=j))  # noqa: E731
    vehicules = [
        ("Toyota", "Corolla Hybrid", "hybride", "eco", "Gris", "11 AB 2201", 48200),
        ("Hyundai", "Accent", "thermique", "eco", "Blanc", "11 AC 5512", 91000),
        ("BYD", "Atto 3", "electrique", "zen", "Bleu", "11 EV 0001", 12500),
        ("Renault", "Mégane E-Tech", "electrique", "zen", "Vert", "11 EV 0002", 8300),
        ("Toyota", "Camry Hybrid", "hybride", "confort", "Noir", "11 CF 7788", 35400),
        ("Toyota", "Hiace", "thermique", "van", "Blanc", "11 VN 3030", 120300),
    ]
    ids = []
    for i, (marque, modele, energie, cat, couleur, immat, km) in enumerate(vehicules):
        vid = nouvel_id()
        ids.append(vid)
        await db.vehicules.insert_one({
            "id": vid, "marque": marque, "modele": modele, "annee": 2023, "energie": energie, "categorie": cat,
            "couleur": couleur, "immatriculation": immat, "places": 7 if cat == "van" else 4, "kilometrage": km,
            "statut": "disponible", "confort": ["Climatisation"],
            "autonomie_km": 420 if energie == "electrique" else None, "capacite_batterie_kwh": 60 if energie == "electrique" else None,
            "reservoir_l": None if energie == "electrique" else 45,
            "assurance_expire": dans(20 if i == 1 else 200), "controle_technique_expire": dans(-3 if i == 5 else 150),
            "cree_le": iso()})
    mdp = os.environ.get("DEMO_MOT_DE_PASSE")
    if mdp:
        noms = ["Issa Ouédraogo", "Awa Sawadogo", "Moussa Kaboré", "Aminata Traoré"]
        positions = [(12.3714, -1.5197), (12.3650, -1.5330), (12.3800, -1.5050), (12.3550, -1.5100)]
        for i, nom in enumerate(noms):
            await db.utilisateurs.insert_one({
                "id": nouvel_id(), "nom": nom, "telephone": f"2267000000{i + 1}", "role": "chauffeur", "actif": True,
                "langue": "fr", "mot_de_passe": hacher(mdp), "cree_le": iso(),
                "chauffeur": {"vehicule_id": ids[i], "en_ligne": False, "note_moyenne": 4.8, "nb_notes": 12,
                              "permis_numero": f"BF-{1000 + i}", "permis_expire": dans(700),
                              "position": {"lat": positions[i][0], "lng": positions[i][1], "le": iso()}}})
        await db.utilisateurs.insert_one({"id": nouvel_id(), "nom": "Karim Zongo", "telephone": "22670000010",
                                          "role": "mecanicien", "actif": True, "langue": "fr", "mot_de_passe": hacher(mdp), "cree_le": iso()})
    fid = nouvel_id()
    await db.fournisseurs.insert_one({"id": fid, "nom": "Auto Pièces Faso", "contact": "M. Ilboudo", "telephone": "22625300000",
                                      "pays": "BF", "conditions_paiement": "30 jours", "cree_le": iso()})
    pieces = [("PLQ-AV-01", "Plaquettes de frein avant", "Freinage", 12, 4, 18000),
              ("FLT-HUI-02", "Filtre à huile", "Moteur", 3, 5, 4500),
              ("HUI-5W30", "Huile moteur 5W30 (5 L)", "Moteur", 8, 4, 22000),
              ("PNE-205", "Pneu 205/55 R16", "Pneumatiques", 6, 4, 45000),
              ("FLT-HAB-03", "Filtre d'habitacle", "Climatisation", 0, 2, 7000)]
    pid = {}
    for ref, nom, cat, q, seuil, prix in pieces:
        pid[ref] = nouvel_id()
        await db.pieces.insert_one({"id": pid[ref], "reference": ref, "nom": nom, "categorie": cat, "quantite": q,
                                    "seuil_alerte": seuil, "prix_unitaire": prix, "fournisseur_id": fid, "compatibilites": [],
                                    "cree_le": iso()})
    plans = [("Vidange moteur", "thermique", 10000, 180, "HUI-5W30"), ("Vidange moteur (hybride)", "hybride", 15000, 365, "HUI-5W30"),
             ("Plaquettes de frein", None, 30000, None, "PLQ-AV-01"), ("Contrôle batterie haute tension", "electrique", 20000, 365, None),
             ("Filtre d'habitacle", None, 15000, 365, "FLT-HAB-03")]
    # Un plan PAR VÉHICULE concerné, dernier entretien à mi-parcours (réaliste) ; la vidange du van est
    # volontairement presque échue, pour montrer une alerte « attention » dans la démonstration
    async for v in db.vehicules.find({}, {"_id": 0}):
        for libelle, energie, km, jours, ref in plans:
            if energie and energie != v["energie"]:
                continue
            dernier = float(v["kilometrage"]) - km * (0.95 if v["categorie"] == "van" and "Vidange" in libelle else 0.4)
            await db.plans.insert_one({"id": nouvel_id(), "libelle": libelle, "vehicule_id": v["id"], "energie": energie,
                                       "intervalle_km": km, "intervalle_jours": jours, "dernier_km": max(0.0, dernier),
                                       "derniere_date": iso(maintenant() - timedelta(days=60)),
                                       "piece_id": pid.get(ref), "cree_le": iso()})


async def initialiser() -> None:
    await creer_admin()
    if get_settings().seed_demo:
        await creer_demo()
