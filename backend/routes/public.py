"""Routes publiques (sans connexion) : configuration du site, catégories et tarifs, estimation d'un prix."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from db import db
from itineraire import itineraire
from metier import PAYS, calculer_prix, decalage_fuseau, distance_route_km, duree_minutes, lire_date, promo_active
from outils import parametres

router = APIRouter(tags=["Public"])


class Point(BaseModel):
    lat: float
    lng: float
    adresse: Optional[str] = None


class DemandeEstimation(BaseModel):
    depart: Point
    arrivee: Optional[Point] = None
    categorie: str
    mode: str = "course"            # course | heure | jour
    duree_heures: Optional[float] = None
    quand: Optional[str] = None


@router.get("/public/config")
async def config_publique():
    """Ce dont le site a besoin pour s'afficher : nom, pays, devise, langue, unité de distance, pays proposés."""
    p = await parametres()
    cles = ("nom", "slogan", "pays", "devise", "langue", "fuseau", "unite_distance", "telephone_support", "email_support")
    # Lot 2 : moyens de paiement en ligne et connexion par code réellement disponibles (le site s'adapte)
    import otp_senders
    import transmission_wa
    from routes.paiements import moyens
    otp = otp_senders.whatsapp_configured() or transmission_wa.liluvine_configure() or otp_senders.sms_configured()
    return {**{k: p.get(k) for k in cles}, "pays_disponibles": PAYS, "paiements_en_ligne": await moyens(),
            "connexion_par_code": bool(otp)}


class Candidature(BaseModel):
    """Lot 2 — « Devenez chauffeur » : candidature déposée depuis le site public."""
    nom: str
    telephone: str
    ville: Optional[str] = None
    experience_annees: Optional[int] = None
    permis_numero: Optional[str] = None
    vehicule_personnel: Optional[str] = None     # ex. « Toyota Corolla hybride 2021 » (facultatif)
    message: Optional[str] = None


@router.post("/public/candidatures")
async def candidater(corps: Candidature):
    """Enregistre la candidature (traitée dans le back-office : Candidatures). Anti-doublon : 1 par numéro et par jour."""
    from datetime import timedelta
    from metier import iso, maintenant
    from outils import nouvel_id
    from routes.auth import indicatif_pays
    from securite import normaliser_telephone
    if len(corps.nom.strip()) < 2:
        raise HTTPException(status_code=422, detail="Indiquez votre nom")
    tel = normaliser_telephone(corps.telephone, await indicatif_pays())
    if await db.candidatures.find_one({"telephone": tel, "cree_le": {"$gte": iso(maintenant() - timedelta(days=1))}}):
        raise HTTPException(status_code=409, detail="Votre candidature est déjà enregistrée : nous vous rappelons")
    doc = {"id": nouvel_id(), **{k: (v.strip() if isinstance(v, str) else v) for k, v in corps.model_dump().items()},
           "telephone": tel, "statut": "nouvelle", "cree_le": iso()}
    await db.candidatures.insert_one(dict(doc))
    return {"ok": True}


async def categories_actives() -> list:
    """Catégories actives, triées, avec le nombre de véhicules disponibles et l'indicateur de promo."""
    sortie = []
    async for c in db.categories.find({"actif": {"$ne": False}}, {"_id": 0}).sort("ordre", 1):
        c["promo_active"] = promo_active(c)
        c["vehicules_disponibles"] = await db.vehicules.count_documents({"categorie": c["code"], "statut": "disponible"})
        sortie.append(c)
    return sortie


@router.get("/public/categories")
async def categories():
    return await categories_actives()


async def estimer(demande: DemandeEstimation) -> dict:
    """Estimation commune (route publique et création de course)."""
    categorie = await db.categories.find_one({"code": demande.categorie, "actif": {"$ne": False}}, {"_id": 0})
    if not categorie:
        raise HTTPException(status_code=404, detail="Catégorie de véhicule inconnue")
    if demande.mode not in ("course", "heure", "jour"):
        raise HTTPException(status_code=422, detail="Mode inconnu (course, heure ou jour)")
    if demande.mode == "course" and demande.arrivee is None:
        raise HTTPException(status_code=422, detail="Indiquez la destination")
    p = await parametres()
    distance, duree, trace, source = 0.0, 0, None, "aucune"
    if demande.arrivee:
        # Lot 2 : itinéraire routier (OSRM) si activé ; sinon / en secours : vol d'oiseau × facteur de détour
        route = await itineraire(demande.depart.model_dump(), demande.arrivee.model_dump()) if p.get("itineraire_routier") else None
        if route:
            distance, duree, trace, source = route["distance_km"], route["duree_min"], route["trace"], "route"
        else:
            distance = distance_route_km(demande.depart.model_dump(), demande.arrivee.model_dump(), float(p["facteur_route"]))
            duree, source = duree_minutes(distance, float(p["vitesse_moyenne_kmh"])), "estimation"
    quand = lire_date(demande.quand)
    # Heure locale du pays (majoration de nuit) : décalage du fuseau de la plateforme
    prix = calculer_prix(categorie, demande.mode, distance, duree, p, demande.duree_heures, quand,
                         decalage_fuseau(p.get("fuseau"), quand))
    return {"distance_km": distance, "duree_min": duree, "trace": trace, "source_distance": source, **prix}


@router.post("/public/estimation")
async def estimation(demande: DemandeEstimation):
    return await estimer(demande)
