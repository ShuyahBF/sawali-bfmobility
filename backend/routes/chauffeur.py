"""Espace chauffeur : disponibilité (en ligne / hors ligne), position GPS, courses proposées, saisie d'énergie."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from db import db
from metier import iso
from outils import nouvel_id
from routes.courses import activer_reservations
from securite import exiger, public

router = APIRouter(prefix="/chauffeur", tags=["Chauffeur"])


class Disponibilite(BaseModel):
    en_ligne: bool
    lat: Optional[float] = None
    lng: Optional[float] = None


class Position(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class SaisieEnergie(BaseModel):
    type: str                       # recharge (électrique) | carburant (thermique, hybride)
    quantite: float = Field(gt=0)   # kWh ou litres
    cout: float = Field(ge=0)
    kilometrage: float = Field(ge=0)
    station: Optional[str] = Field(default=None, max_length=120)


@router.post("/disponibilite")
async def disponibilite(corps: Disponibilite, u: dict = Depends(exiger("chauffeur"))):
    """Passage en ligne / hors ligne (avec la position actuelle si connue)."""
    maj = {"chauffeur.en_ligne": corps.en_ligne}
    if corps.lat is not None and corps.lng is not None:
        maj["chauffeur.position"] = {"lat": corps.lat, "lng": corps.lng, "le": iso()}
    await db.utilisateurs.update_one({"id": u["id"]}, {"$set": maj})
    return public(await db.utilisateurs.find_one({"id": u["id"]}, {"_id": 0}))


@router.post("/position")
async def position(corps: Position, u: dict = Depends(exiger("chauffeur"))):
    """Position GPS envoyée par le téléphone du chauffeur (toutes les 15 s quand il est en ligne)."""
    await db.utilisateurs.update_one({"id": u["id"]}, {"$set": {"chauffeur.position": {"lat": corps.lat, "lng": corps.lng, "le": iso()}}})
    return {"ok": True}


@router.get("/courses")
async def mes_courses(u: dict = Depends(exiger("chauffeur"))):
    """Courses proposées (en attente d'un chauffeur), course en cours et dernières courses terminées."""
    await activer_reservations()
    # Proposées : celles qui me sont proposées, et celles proposées à personne (aucun chauffeur en ligne au moment
    # de la commande) dans la catégorie de mon véhicule
    vehicule = await db.vehicules.find_one({"id": (u.get("chauffeur") or {}).get("vehicule_id")}, {"_id": 0, "categorie": 1}) or {}
    filtre = {"statut": "recherche", "$or": [{"proposee_a": u["id"]},
                                             {"proposee_a": {"$size": 0}, "categorie": vehicule.get("categorie", "-")}]}
    proposees = [c async for c in db.courses.find(filtre,
                                                   {"_id": 0, "proposee_a": 0, "messages": 0}).sort("cree_le", 1).limit(20)]
    en_cours = await db.courses.find_one({"chauffeur.id": u["id"], "statut": {"$in": ["acceptee", "en_approche", "arrivee", "en_cours"]}},
                                         {"_id": 0, "proposee_a": 0})
    recentes = [c async for c in db.courses.find({"chauffeur.id": u["id"], "statut": {"$in": ["terminee", "annulee"]}},
                                                  {"_id": 0, "proposee_a": 0, "messages": 0}).sort("cree_le", -1).limit(20)]
    return {"proposees": proposees, "en_cours": en_cours, "recentes": recentes}


@router.post("/energie")
async def energie(corps: SaisieEnergie, u: dict = Depends(exiger("chauffeur"))):
    """Recharge électrique ou plein de carburant du véhicule du chauffeur (met à jour le kilométrage)."""
    if corps.type not in ("recharge", "carburant"):
        raise HTTPException(status_code=422, detail="Type inconnu (recharge ou carburant)")
    vehicule_id = (u.get("chauffeur") or {}).get("vehicule_id")
    if not vehicule_id:
        raise HTTPException(status_code=409, detail="Aucun véhicule ne vous est affecté")
    saisie = {"id": nouvel_id(), "vehicule_id": vehicule_id, **corps.model_dump(), "saisi_par": u["id"], "le": iso()}
    await db.energie.insert_one(dict(saisie))
    await db.vehicules.update_one({"id": vehicule_id, "kilometrage": {"$lt": corps.kilometrage}},
                                  {"$set": {"kilometrage": corps.kilometrage}})
    return saisie
