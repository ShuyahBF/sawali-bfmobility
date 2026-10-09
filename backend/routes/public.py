"""Routes publiques (sans connexion) : configuration du site, catégories et tarifs, estimation d'un prix."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from db import db
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
    return {**{k: p.get(k) for k in cles}, "pays_disponibles": PAYS}


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
    distance = distance_route_km(demande.depart.model_dump(), demande.arrivee.model_dump(), float(p["facteur_route"])) if demande.arrivee else 0.0
    duree = duree_minutes(distance, float(p["vitesse_moyenne_kmh"])) if distance else 0
    quand = lire_date(demande.quand)
    # Heure locale du pays (majoration de nuit) : décalage du fuseau de la plateforme
    prix = calculer_prix(categorie, demande.mode, distance, duree, p, demande.duree_heures, quand,
                         decalage_fuseau(p.get("fuseau"), quand))
    return {"distance_km": distance, "duree_min": duree, **prix}


@router.post("/public/estimation")
async def estimation(demande: DemandeEstimation):
    return await estimer(demande)
