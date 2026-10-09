"""Back-office de la société : parc, tarifs, utilisateurs, énergie, maintenance, pièces, fournisseurs, commandes,
paiements fournisseurs, courses, alertes, tableau de bord et paramètres.

Pour un développeur WinDev : les ressources simples partagent UN SEUL jeu de routes générique (liste, création,
modification, suppression) décrit par le dictionnaire RESSOURCES (≈ une « analyse » : fichier + rubriques + droits).
Les règles particulières (stock, plans de maintenance, mot de passe…) sont dans les fonctions « avant_* / apres_* ».
"""
from __future__ import annotations

import re
from datetime import timedelta
from typing import Any, Callable, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException

from db import db
from metier import (ENERGIES, PAYS, alerte_stock, alertes_document, etat_plan, iso, lire_date, maintenant,
                    numero_document)
from outils import nouvel_id, parametres, prochain_numero
from routes.auth import indicatif_pays
from routes.courses import charger as charger_course, voir as voir_course
from securite import ATELIER, EQUIPE, ROLES, exiger, hacher, normaliser_telephone, public

router = APIRouter(prefix="/admin", tags=["Back-office"])

# --------------------------------------------------------------------------------------------------------------
# Description des ressources : champ → (type, obligatoire). Types : str, float, int, bool, list, dict, date, enum:a|b
# --------------------------------------------------------------------------------------------------------------
RESSOURCES: Dict[str, Dict[str, Any]] = {
    "vehicules": {
        "collection": "vehicules", "lecture": ATELIER, "ecriture": EQUIPE, "tri": "immatriculation",
        "recherche": ["immatriculation", "marque", "modele"],
        "champs": {
            "marque": ("str", True), "modele": ("str", True), "annee": ("int", False), "immatriculation": ("str", True),
            "energie": ("enum:" + "|".join(ENERGIES), True), "categorie": ("str", True), "couleur": ("str", False),
            "places": ("int", False), "confort": ("list", False), "autonomie_km": ("float", False),
            "capacite_batterie_kwh": ("float", False), "reservoir_l": ("float", False), "kilometrage": ("float", False),
            "statut": ("enum:disponible|en_service|maintenance|hors_service", False), "chauffeur_id": ("str", False),
            "assurance_expire": ("date", False), "controle_technique_expire": ("date", False), "photo_url": ("str", False),
        },
        "defauts": {"statut": "disponible", "kilometrage": 0, "places": 4, "confort": []},
        "unique": ["immatriculation"],
    },
    "categories": {
        "collection": "categories", "lecture": EQUIPE, "ecriture": EQUIPE, "tri": "ordre", "recherche": ["code", "nom"],
        "champs": {
            "code": ("str", True), "nom": ("str", True), "description": ("str", False), "energies": ("list", False),
            "places": ("int", False), "confort": ("list", False), "prise_en_charge": ("float", False),
            "prix_km": ("float", True), "prix_minute": ("float", False), "prix_heure": ("float", False),
            "prix_jour": ("float", False), "minimum": ("float", False), "promo": ("dict", False),
            "actif": ("bool", False), "ordre": ("int", False), "icone": ("str", False),
        },
        "defauts": {"actif": True, "ordre": 10, "energies": list(ENERGIES), "confort": [], "prise_en_charge": 0,
                    "prix_minute": 0, "prix_heure": 0, "prix_jour": 0, "minimum": 0, "promo": None},
        "unique": ["code"],
    },
    "energie": {
        "collection": "energie", "lecture": ATELIER, "ecriture": ATELIER, "tri": "-le", "recherche": ["station"],
        "champs": {"vehicule_id": ("str", True), "type": ("enum:recharge|carburant", True), "quantite": ("float", True),
                   "cout": ("float", True), "kilometrage": ("float", True), "station": ("str", False), "le": ("date", False)},
    },
    "plans": {
        "collection": "plans", "lecture": ATELIER, "ecriture": ATELIER, "tri": "libelle", "recherche": ["libelle"],
        "champs": {"vehicule_id": ("str", False), "energie": ("str", False), "libelle": ("str", True),
                   "intervalle_km": ("float", False), "intervalle_jours": ("int", False), "dernier_km": ("float", False),
                   "derniere_date": ("date", False), "piece_id": ("str", False)},
    },
    "interventions": {
        "collection": "interventions", "lecture": ATELIER, "ecriture": ATELIER, "tri": "-le", "recherche": ["description"],
        "champs": {"vehicule_id": ("str", True), "mecanicien_id": ("str", False),
                   "type": ("enum:entretien|reparation|controle", True), "description": ("str", True),
                   "kilometrage": ("float", False), "pieces": ("list", False), "main_oeuvre": ("float", False),
                   "statut": ("enum:planifiee|en_cours|terminee", False), "plan_id": ("str", False), "le": ("date", False)},
        "defauts": {"statut": "planifiee", "pieces": [], "main_oeuvre": 0},
    },
    "pieces": {
        "collection": "pieces", "lecture": ATELIER, "ecriture": ATELIER, "tri": "nom", "recherche": ["reference", "nom", "categorie"],
        "champs": {"reference": ("str", True), "nom": ("str", True), "categorie": ("str", False), "compatibilites": ("list", False),
                   "quantite": ("float", False), "seuil_alerte": ("float", False), "prix_unitaire": ("float", False),
                   "fournisseur_id": ("str", False), "emplacement": ("str", False)},
        "defauts": {"quantite": 0, "seuil_alerte": 0, "prix_unitaire": 0, "compatibilites": []},
        "unique": ["reference"],
    },
    "fournisseurs": {
        "collection": "fournisseurs", "lecture": ATELIER, "ecriture": EQUIPE, "tri": "nom", "recherche": ["nom", "contact"],
        "champs": {"nom": ("str", True), "contact": ("str", False), "telephone": ("str", False), "email": ("str", False),
                   "adresse": ("str", False), "pays": ("str", False), "conditions_paiement": ("str", False)},
    },
    "commandes": {
        "collection": "commandes", "lecture": ATELIER, "ecriture": EQUIPE, "tri": "-cree_le", "recherche": ["numero", "note"],
        "champs": {"fournisseur_id": ("str", True), "lignes": ("list", True),
                   "statut": ("enum:brouillon|envoyee|recue|annulee", False), "note": ("str", False)},
        "defauts": {"statut": "brouillon"},
    },
    "paiements-fournisseurs": {
        "collection": "paiements_fournisseurs", "lecture": EQUIPE, "ecriture": EQUIPE, "tri": "-le", "recherche": ["reference"],
        "champs": {"fournisseur_id": ("str", True), "commande_id": ("str", False), "montant": ("float", True),
                   "moyen": ("str", True), "reference": ("str", False), "le": ("date", False)},
    },
    # Lot 2 — candidatures « Devenez chauffeur » (déposées sur le site public)
    "candidatures": {
        "collection": "candidatures", "lecture": EQUIPE, "ecriture": EQUIPE, "tri": "-cree_le", "recherche": ["nom", "telephone", "ville"],
        "champs": {"nom": ("str", True), "telephone": ("str", True), "ville": ("str", False), "experience_annees": ("int", False),
                   "permis_numero": ("str", False), "vehicule_personnel": ("str", False), "message": ("str", False),
                   "statut": ("enum:nouvelle|contactee|acceptee|refusee", False), "note_interne": ("str", False)},
        "defauts": {"statut": "nouvelle"},
    },
    "utilisateurs": {
        "collection": "utilisateurs", "lecture": EQUIPE, "ecriture": EQUIPE, "tri": "nom", "recherche": ["nom", "telephone", "email"],
        "champs": {"nom": ("str", True), "telephone": ("str", True), "email": ("str", False),
                   "role": ("enum:" + "|".join(ROLES), True), "mot_de_passe": ("str", False), "actif": ("bool", False),
                   "langue": ("str", False), "chauffeur": ("dict", False)},
        "defauts": {"actif": True},
    },
}


def nettoyer(ressource: str, donnees: Dict[str, Any], partiel: bool) -> Dict[str, Any]:
    """Contrôle et conversion des champs reçus selon la description de la ressource (422 avec message clair)."""
    champs = RESSOURCES[ressource]["champs"]
    sortie: Dict[str, Any] = {}
    for nom, (type_, obligatoire) in champs.items():
        if nom not in donnees:
            if obligatoire and not partiel:
                raise HTTPException(status_code=422, detail=f"Champ obligatoire manquant : {nom}")
            continue
        v = donnees[nom]
        if v in (None, "") and not obligatoire:
            sortie[nom] = None
            continue
        try:
            if type_ == "str":
                v = str(v).strip()
                if obligatoire and not v:
                    raise ValueError
            elif type_ in ("float", "int"):
                v = float(v) if type_ == "float" else int(float(v))
            elif type_ == "bool":
                v = v if isinstance(v, bool) else str(v).lower() in ("1", "true", "oui", "vrai")
            elif type_ == "list":
                v = v if isinstance(v, list) else [x.strip() for x in str(v).split(",") if x.strip()]
            elif type_ == "dict":
                if not isinstance(v, dict):
                    raise ValueError
            elif type_ == "date":
                d = lire_date(v)
                if not d:
                    raise ValueError
                v = d.isoformat()
            elif type_.startswith("enum:"):
                if v not in type_[5:].split("|"):
                    raise ValueError
        except (ValueError, TypeError):
            raise HTTPException(status_code=422, detail=f"Valeur invalide pour « {nom} »")
        sortie[nom] = v
    return sortie


# --------------------------------------------------------------------------------------------------------------
# Règles particulières (appelées par les routes génériques)
# --------------------------------------------------------------------------------------------------------------
async def avant_utilisateur(doc: Dict[str, Any], existant: Optional[Dict[str, Any]], u: Dict[str, Any]) -> None:
    """Comptes créés par la société : téléphone normalisé, mot de passe haché, rôle admin réservé à l'admin."""
    if doc.get("role") == "admin" and u["role"] != "admin":
        raise HTTPException(status_code=403, detail="Seul l'administrateur peut créer un administrateur")
    if existant and existant.get("role") == "admin" and u["role"] != "admin":
        raise HTTPException(status_code=403, detail="Seul l'administrateur peut modifier un administrateur")
    if doc.get("telephone"):
        doc["telephone"] = normaliser_telephone(doc["telephone"], await indicatif_pays())
        autre = await db.utilisateurs.find_one({"telephone": doc["telephone"], "id": {"$ne": (existant or {}).get("id")}})
        if autre:
            raise HTTPException(status_code=409, detail="Ce numéro de téléphone a déjà un compte")
    if doc.get("email"):
        doc["email"] = doc["email"].lower()
    if doc.get("mot_de_passe"):
        if len(doc["mot_de_passe"]) < 6:
            raise HTTPException(status_code=422, detail="Mot de passe : 6 caractères au moins")
        doc["mot_de_passe"] = hacher(doc["mot_de_passe"])
    else:
        doc.pop("mot_de_passe", None)
        if not existant:
            raise HTTPException(status_code=422, detail="Donnez un mot de passe initial")
    if "chauffeur" in doc:
        # Fiche chauffeur : on garde la note et l'état en ligne existants
        doc["chauffeur"] = {**((existant or {}).get("chauffeur") or {"en_ligne": False, "note_moyenne": None, "nb_notes": 0}),
                            **{k: v for k, v in (doc["chauffeur"] or {}).items() if k in ("permis_numero", "permis_expire", "vehicule_id")}}


async def apres_energie(doc: Dict[str, Any]) -> None:
    """Une recharge / un plein fait avancer le kilométrage du véhicule (jamais reculer)."""
    await db.vehicules.update_one({"id": doc["vehicule_id"], "kilometrage": {"$lt": doc["kilometrage"]}},
                                  {"$set": {"kilometrage": doc["kilometrage"]}})


async def avant_intervention(doc: Dict[str, Any], existant: Optional[Dict[str, Any]], u: Dict[str, Any]) -> None:
    """Coût de l'intervention = pièces (prix unitaire du stock) + main-d'œuvre."""
    pieces = doc.get("pieces", (existant or {}).get("pieces")) or []
    cout_pieces = 0.0
    for ligne in pieces:
        p = await db.pieces.find_one({"id": ligne.get("piece_id")}, {"_id": 0, "prix_unitaire": 1, "nom": 1})
        if not p:
            raise HTTPException(status_code=422, detail="Pièce inconnue dans l'intervention")
        ligne["nom"] = p.get("nom")
        cout_pieces += float(ligne.get("quantite") or 0) * float(p.get("prix_unitaire") or 0)
    doc["cout_pieces"] = round(cout_pieces, 2)
    doc["cout_total"] = round(cout_pieces + float(doc.get("main_oeuvre", (existant or {}).get("main_oeuvre")) or 0), 2)
    if not existant and u["role"] == "mecanicien" and not doc.get("mecanicien_id"):
        doc["mecanicien_id"] = u["id"]


async def apres_intervention(doc: Dict[str, Any], avant: Optional[Dict[str, Any]]) -> None:
    """Intervention TERMINÉE (une seule fois) : sortie des pièces du stock, plan de maintenance remis à zéro,
    véhicule remis « disponible » s'il était en maintenance."""
    if doc.get("statut") != "terminee" or (avant or {}).get("statut") == "terminee":
        return
    for ligne in doc.get("pieces") or []:
        await mouvement_stock(ligne["piece_id"], -float(ligne.get("quantite") or 0), f"Intervention {doc['id'][:8]}")
    vehicule = await db.vehicules.find_one({"id": doc["vehicule_id"]}, {"_id": 0}) or {}
    km = float(doc.get("kilometrage") or vehicule.get("kilometrage") or 0)
    if doc.get("plan_id"):
        await db.plans.update_one({"id": doc["plan_id"]}, {"$set": {"dernier_km": km, "derniere_date": iso()}})
    if vehicule.get("statut") == "maintenance":
        await db.vehicules.update_one({"id": doc["vehicule_id"]}, {"$set": {"statut": "disponible"}})
    await db.interventions.update_one({"id": doc["id"]}, {"$set": {"termine_le": iso()}})


async def mouvement_stock(piece_id: str, quantite: float, motif: str) -> Dict[str, Any]:
    """Entrée (+) ou sortie (−) de stock, tracée dans l'historique de la pièce (100 derniers mouvements)."""
    piece = await db.pieces.find_one({"id": piece_id}, {"_id": 0})
    if not piece:
        raise HTTPException(status_code=404, detail="Pièce introuvable")
    await db.pieces.update_one({"id": piece_id}, {"$inc": {"quantite": quantite}, "$push": {"mouvements": {
        "$each": [{"quantite": quantite, "motif": motif, "le": iso()}], "$slice": -100}}})
    return await db.pieces.find_one({"id": piece_id}, {"_id": 0})


async def avant_commande(doc: Dict[str, Any], existant: Optional[Dict[str, Any]], u: Dict[str, Any]) -> None:
    """Numéro de commande et total ; une commande reçue ne se modifie plus."""
    if existant and existant.get("statut") == "recue":
        raise HTTPException(status_code=409, detail="Commande déjà reçue : modification impossible")
    if doc.get("statut") == "recue":
        raise HTTPException(status_code=422, detail="Utilisez le bouton « Réceptionner » pour recevoir une commande")
    if "lignes" in doc:
        total = 0.0
        for l in doc["lignes"]:
            if not await db.pieces.find_one({"id": l.get("piece_id")}):
                raise HTTPException(status_code=422, detail="Pièce inconnue dans la commande")
            total += float(l.get("quantite") or 0) * float(l.get("prix_unitaire") or 0)
        doc["total"] = round(total, 2)
    if not existant:
        doc["numero"] = numero_document("CMD", await prochain_numero("commandes"))


async def soldes_fournisseurs() -> Dict[str, Dict[str, float]]:
    """Par fournisseur : total des commandes reçues, total payé et solde restant dû."""
    sortie: Dict[str, Dict[str, float]] = {}
    async for c in db.commandes.find({"statut": "recue"}, {"_id": 0, "fournisseur_id": 1, "total": 1}):
        s = sortie.setdefault(c["fournisseur_id"], {"total_commandes": 0.0, "total_paye": 0.0})
        s["total_commandes"] += float(c.get("total") or 0)
    async for p in db.paiements_fournisseurs.find({}, {"_id": 0, "fournisseur_id": 1, "montant": 1}):
        s = sortie.setdefault(p["fournisseur_id"], {"total_commandes": 0.0, "total_paye": 0.0})
        s["total_paye"] += float(p.get("montant") or 0)
    for s in sortie.values():
        s["solde"] = round(s["total_commandes"] - s["total_paye"], 2)
    return sortie


AVANT: Dict[str, Callable] = {"utilisateurs": avant_utilisateur, "interventions": avant_intervention, "commandes": avant_commande}


# --------------------------------------------------------------------------------------------------------------
# Routes spécifiques (déclarées AVANT les routes génériques pour ne pas être confondues avec /{ressource}/{id})
# --------------------------------------------------------------------------------------------------------------
@router.get("/tableau-de-bord")
async def tableau_de_bord(u: dict = Depends(exiger(*ATELIER))):
    """Indicateurs clés : courses et chiffre d'affaires, parc, chauffeurs en ligne, énergie, maintenance, tendances."""
    debut_jour = maintenant().replace(hour=0, minute=0, second=0, microsecond=0)
    debut_mois = debut_jour.replace(day=1)
    terminees = [c async for c in db.courses.find({"statut": "terminee", "cree_le": {"$gte": iso(debut_mois - timedelta(days=7))}},
                                                   {"_id": 0, "cree_le": 1, "prix_final": 1, "prix_estime": 1, "categorie": 1,
                                                    "vehicule": 1, "distance_km": 1, "evaluation": 1})]

    def montant(c):
        return float(c.get("prix_final") if c.get("prix_final") is not None else c.get("prix_estime") or 0)
    du_mois = [c for c in terminees if c["cree_le"] >= iso(debut_mois)]
    du_jour = [c for c in terminees if c["cree_le"] >= iso(debut_jour)]
    # Courses des 7 derniers jours (graphique)
    jours = []
    for i in range(6, -1, -1):
        j = debut_jour - timedelta(days=i)
        lot = [c for c in terminees if iso(j) <= c["cree_le"] < iso(j + timedelta(days=1))]
        jours.append({"jour": j.strftime("%Y-%m-%d"), "courses": len(lot), "chiffre": round(sum(montant(c) for c in lot), 2)})
    par_cat: Dict[str, Dict[str, float]] = {}
    par_energie: Dict[str, Dict[str, float]] = {}
    for c in du_mois:
        pc = par_cat.setdefault(c.get("categorie") or "-", {"courses": 0, "chiffre": 0.0})
        pc["courses"] += 1
        pc["chiffre"] += montant(c)
        e = ((c.get("vehicule") or {}).get("energie")) or "-"
        par_energie.setdefault(e, {"km": 0.0, "cout_energie": 0.0})["km"] += float(c.get("distance_km") or 0)
    energie = {"cout": 0.0, "kwh": 0.0, "litres": 0.0}
    async for s in db.energie.find({"le": {"$gte": iso(debut_mois)}}, {"_id": 0}):
        energie["cout"] += float(s.get("cout") or 0)
        energie["kwh" if s.get("type") == "recharge" else "litres"] += float(s.get("quantite") or 0)
    maintenance = 0.0
    async for i in db.interventions.find({"le": {"$gte": iso(debut_mois)}}, {"_id": 0, "cout_total": 1}):
        maintenance += float(i.get("cout_total") or 0)
    notes = [c["evaluation"]["note"] for c in du_mois if c.get("evaluation")]
    vehicules = {s: await db.vehicules.count_documents({"statut": s}) for s in ("disponible", "en_service", "maintenance")}
    return {
        "courses_jour": len(du_jour), "chiffre_jour": round(sum(montant(c) for c in du_jour), 2),
        "courses_mois": len(du_mois), "chiffre_mois": round(sum(montant(c) for c in du_mois), 2),
        "vehicules": {"total": await db.vehicules.count_documents({}), "disponibles": vehicules["disponible"],
                      "en_service": vehicules["en_service"], "maintenance": vehicules["maintenance"]},
        "chauffeurs_en_ligne": await db.utilisateurs.count_documents({"role": "chauffeur", "chauffeur.en_ligne": True}),
        "note_moyenne": round(sum(notes) / len(notes), 2) if notes else None,
        "energie_mois": {k: round(v, 2) for k, v in energie.items()}, "maintenance_mois": round(maintenance, 2),
        "alertes": len(await calculer_alertes()),
        "par_categorie": [{"categorie": k, "courses": v["courses"], "chiffre": round(v["chiffre"], 2)} for k, v in par_cat.items()],
        "par_energie": [{"energie": k, "km": round(v["km"], 1), "cout_energie": v["cout_energie"]} for k, v in par_energie.items()],
        "courses_7j": jours,
    }


async def calculer_alertes() -> List[Dict[str, Any]]:
    """Alertes : plans de maintenance échus ou proches, stock bas, documents expirés, véhicules immobilisés."""
    alertes: List[Dict[str, Any]] = []
    vehicules = {v["id"]: v async for v in db.vehicules.find({}, {"_id": 0})}
    async for plan in db.plans.find({}, {"_id": 0}):
        cibles = [vehicules[plan["vehicule_id"]]] if plan.get("vehicule_id") in vehicules else \
            [v for v in vehicules.values() if not plan.get("vehicule_id") and (not plan.get("energie") or v.get("energie") == plan["energie"])]
        for v in cibles:
            etat = etat_plan(plan, float(v.get("kilometrage") or 0))
            if etat["gravite"] in ("attention", "urgent"):
                # Texte lisible : « dans 450 km, 12 j » ou « dépassé de 300 km »
                morceaux = []
                for valeur, unite in ((etat["km_restants"], "km"), (etat["jours_restants"], "j")):
                    if valeur is not None:
                        morceaux.append(f"dépassé de {abs(valeur)} {unite}" if valeur < 0 else f"dans {valeur} {unite}")
                alertes.append({"type": "maintenance", "gravite": etat["gravite"], "vehicule_id": v["id"], "plan_id": plan["id"],
                                "message": f"{plan['libelle']} — {v.get('immatriculation')} ({', '.join(morceaux)})"})
    for v in vehicules.values():
        alertes.extend(alertes_document(v))
    async for p in db.pieces.find({}, {"_id": 0}):
        a = alerte_stock(p)
        if a:
            alertes.append(a)
    ordre = {"urgent": 0, "attention": 1, "info": 2}
    return sorted(alertes, key=lambda a: ordre.get(a["gravite"], 3))


@router.get("/alertes")
async def alertes(u: dict = Depends(exiger(*ATELIER))):
    return await calculer_alertes()


@router.get("/parametres")
async def lire_parametres(u: dict = Depends(exiger(*EQUIPE))):
    return {**(await parametres()), "pays_disponibles": PAYS}


@router.patch("/parametres")
async def maj_parametres(corps: Dict[str, Any] = Body(...), u: dict = Depends(exiger("admin"))):
    """Paramètres de la plateforme (pays, devise, langue, unité, majoration de nuit, commission, support…)."""
    from metier import PARAMETRES_DEFAUT
    maj = {k: v for k, v in (corps or {}).items() if k in PARAMETRES_DEFAUT}
    for k in ("vitesse_moyenne_kmh", "facteur_route", "majoration_nuit_pct", "commission_pct"):
        if k in maj:
            maj[k] = float(maj[k])
    for k in ("nuit_debut", "nuit_fin"):
        if k in maj:
            maj[k] = int(maj[k]) % 24
    if maj.get("unite_distance") not in (None, "km", "mi"):
        raise HTTPException(status_code=422, detail="Unité de distance : km ou mi")
    await db.parametres.update_one({"_id": "plateforme"}, {"$set": maj}, upsert=True)
    return await lire_parametres(u)


@router.get("/courses")
async def courses(statut: str = "", q: str = "", limite: int = 200, u: dict = Depends(exiger(*EQUIPE))):
    """Toutes les courses (filtre par statut, recherche par numéro / client / chauffeur)."""
    filtre: Dict[str, Any] = {}
    if statut:
        filtre["statut"] = statut
    if q:
        motif = {"$regex": re.escape(q), "$options": "i"}
        filtre["$or"] = [{"numero": motif}, {"client.nom": motif}, {"chauffeur.nom": motif}]
    return [c async for c in db.courses.find(filtre, {"_id": 0, "proposee_a": 0, "messages": 0}).sort("cree_le", -1).limit(min(limite, 1000))]


@router.post("/courses/{course_id}/affecter")
async def affecter(course_id: str, corps: Dict[str, Any] = Body(...), u: dict = Depends(exiger(*EQUIPE))):
    """Affectation manuelle d'une course en recherche à un chauffeur (son véhicule est repris)."""
    c = await charger_course(course_id)
    if c["statut"] not in ("recherche", "planifiee"):
        raise HTTPException(status_code=409, detail="Seule une course en attente de chauffeur peut être affectée")
    ch = await db.utilisateurs.find_one({"id": corps.get("chauffeur_id"), "role": "chauffeur"}, {"_id": 0})
    vehicule = await db.vehicules.find_one({"id": ((ch or {}).get("chauffeur") or {}).get("vehicule_id")}, {"_id": 0}) if ch else None
    if not ch or not vehicule:
        raise HTTPException(status_code=422, detail="Chauffeur inconnu ou sans véhicule affecté")
    await db.courses.update_one({"id": course_id}, {"$set": {
        "statut": "acceptee",
        "chauffeur": {"id": ch["id"], "nom": ch.get("nom"), "telephone": ch.get("telephone"),
                      "note_moyenne": (ch.get("chauffeur") or {}).get("note_moyenne")},
        "vehicule": {k: vehicule.get(k) for k in ("id", "marque", "modele", "couleur", "immatriculation", "energie")},
    }, "$push": {"historique": {"statut": "acceptee", "le": iso(), "par": u.get("nom")}}})
    await db.vehicules.update_one({"id": vehicule["id"]}, {"$set": {"statut": "en_service"}})
    from notifications import notifier_client
    notifier_client("acceptee", await charger_course(course_id), await parametres())
    return await voir_course(course_id, u)


@router.post("/pieces/{piece_id}/mouvement")
async def mouvement(piece_id: str, corps: Dict[str, Any] = Body(...), u: dict = Depends(exiger(*ATELIER))):
    """Entrée ou sortie manuelle de stock (inventaire, casse, retour…)."""
    try:
        quantite = float(corps.get("quantite"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail="Quantité invalide")
    return await mouvement_stock(piece_id, quantite, str(corps.get("motif") or "Mouvement manuel")[:120])


@router.post("/commandes/{commande_id}/recevoir")
async def recevoir(commande_id: str, u: dict = Depends(exiger(*ATELIER))):
    """Réception d'une commande fournisseur : chaque ligne entre en stock, prix unitaire mis à jour."""
    c = await db.commandes.find_one({"id": commande_id}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Commande introuvable")
    if c.get("statut") in ("recue", "annulee"):
        raise HTTPException(status_code=409, detail="Commande déjà reçue ou annulée")
    for l in c.get("lignes") or []:
        await mouvement_stock(l["piece_id"], float(l.get("quantite") or 0), f"Réception {c['numero']}")
        if l.get("prix_unitaire"):
            await db.pieces.update_one({"id": l["piece_id"]}, {"$set": {"prix_unitaire": float(l["prix_unitaire"])}})
    await db.commandes.update_one({"id": commande_id}, {"$set": {"statut": "recue", "recue_le": iso()}})
    return await db.commandes.find_one({"id": commande_id}, {"_id": 0})


# --------------------------------------------------------------------------------------------------------------
# Routes génériques : liste, création, modification, suppression
# --------------------------------------------------------------------------------------------------------------
def _ressource(nom: str) -> Dict[str, Any]:
    if nom not in RESSOURCES:
        raise HTTPException(status_code=404, detail="Ressource inconnue")
    return RESSOURCES[nom]


def _verifier_role(r: Dict[str, Any], u: Dict[str, Any], ecriture: bool) -> None:
    if u["role"] not in (r["ecriture"] if ecriture else r["lecture"]):
        raise HTTPException(status_code=403, detail="Accès non autorisé pour votre rôle")


async def _unicite(nom: str, r: Dict[str, Any], doc: Dict[str, Any], id_courant: Optional[str]) -> None:
    for champ in r.get("unique", []):
        if doc.get(champ) and await db[r["collection"]].find_one({champ: doc[champ], "id": {"$ne": id_courant}}):
            raise HTTPException(status_code=409, detail=f"« {doc[champ]} » existe déjà ({champ})")


async def _sortie(nom: str, doc: Dict[str, Any], soldes: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Document renvoyé au site (sans mot de passe ; fournisseurs avec leur solde)."""
    doc = public(doc) if nom == "utilisateurs" else {k: v for k, v in doc.items() if k != "_id"}
    if nom == "fournisseurs":
        s = (soldes or {}).get(doc["id"], {})
        doc.update(total_commandes=round(s.get("total_commandes", 0), 2), total_paye=round(s.get("total_paye", 0), 2),
                   solde=s.get("solde", 0))
    return doc


@router.get("/{nom}")
async def lister(nom: str, q: str = "", limite: int = 500, role: str = "", u: dict = Depends(exiger(*ATELIER))):
    r = _ressource(nom)
    _verifier_role(r, u, ecriture=False)
    filtre: Dict[str, Any] = {}
    if q:
        motif = {"$regex": re.escape(q), "$options": "i"}
        filtre["$or"] = [{c: motif} for c in r["recherche"]]
    if nom == "utilisateurs" and role:
        filtre["role"] = role
    tri = r.get("tri", "id")
    sens = -1 if tri.startswith("-") else 1
    docs = [d async for d in db[r["collection"]].find(filtre, {"_id": 0}).sort(tri.lstrip("-"), sens).limit(min(limite, 2000))]
    soldes = await soldes_fournisseurs() if nom == "fournisseurs" else None
    return [await _sortie(nom, d, soldes) for d in docs]


@router.post("/{nom}")
async def creer(nom: str, corps: Dict[str, Any] = Body(...), u: dict = Depends(exiger(*ATELIER))):
    r = _ressource(nom)
    _verifier_role(r, u, ecriture=True)
    doc = {**r.get("defauts", {}), **nettoyer(nom, corps or {}, partiel=False)}
    if nom in AVANT:
        await AVANT[nom](doc, None, u)
    await _unicite(nom, r, doc, None)
    doc.update(id=nouvel_id(), cree_le=iso(), cree_par=u["id"])
    if r["champs"].get("le") and not doc.get("le"):
        doc["le"] = iso()
    await db[r["collection"]].insert_one(dict(doc))
    if nom == "energie":
        await apres_energie(doc)
    if nom == "interventions":
        await apres_intervention(doc, None)
    return await _sortie(nom, await db[r["collection"]].find_one({"id": doc["id"]}, {"_id": 0}))


@router.patch("/{nom}/{doc_id}")
async def modifier(nom: str, doc_id: str, corps: Dict[str, Any] = Body(...), u: dict = Depends(exiger(*ATELIER))):
    r = _ressource(nom)
    _verifier_role(r, u, ecriture=True)
    existant = await db[r["collection"]].find_one({"id": doc_id}, {"_id": 0})
    if not existant:
        raise HTTPException(status_code=404, detail="Élément introuvable")
    doc = nettoyer(nom, corps or {}, partiel=True)
    if nom in AVANT:
        await AVANT[nom](doc, existant, u)
    await _unicite(nom, r, doc, doc_id)
    if doc:
        doc["modifie_le"] = iso()
        await db[r["collection"]].update_one({"id": doc_id}, {"$set": doc})
    nouveau = await db[r["collection"]].find_one({"id": doc_id}, {"_id": 0})
    if nom == "interventions":
        await apres_intervention(nouveau, existant)
    return await _sortie(nom, await db[r["collection"]].find_one({"id": doc_id}, {"_id": 0}))


@router.delete("/{nom}/{doc_id}")
async def supprimer(nom: str, doc_id: str, u: dict = Depends(exiger(*ATELIER))):
    r = _ressource(nom)
    _verifier_role(r, u, ecriture=True)
    if nom == "utilisateurs" and doc_id == u["id"]:
        raise HTTPException(status_code=409, detail="Vous ne pouvez pas supprimer votre propre compte")
    if nom == "commandes":
        c = await db.commandes.find_one({"id": doc_id}, {"_id": 0, "statut": 1})
        if c and c.get("statut") == "recue":
            raise HTTPException(status_code=409, detail="Commande reçue : suppression impossible (stock déjà mis à jour)")
    res = await db[r["collection"]].delete_one({"id": doc_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Élément introuvable")
    return {"ok": True}
