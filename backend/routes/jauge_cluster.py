"""Lot 32 — GET /api/admin/atlas/jauge : occupation du cluster de production (administrateur uniquement).
Règles de calcul : jauge_cluster.py. Jamais d'adresse ni d'identifiant de connexion dans la réponse."""
from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends

import jauge_cluster
from config import get_settings
from db import db
from securite import exiger

router = APIRouter(prefix="/admin/atlas", tags=["Back-office"])


@router.get("/jauge")
async def jauge(forcer: bool = False, _: Dict[str, Any] = Depends(exiger("admin"))):
    """Taille occupée (Mo) et nombre de collections du cluster, avec couleur et pourcentage ;
    « forcer » ignore la mesure gardée en mémoire (10 min)."""
    # Le client Mongo est celui de la base de la plateforme (la base enveloppée par BasePrefixee)
    return await jauge_cluster.mesurer(db._base.client, get_settings().mongo_db_name, forcer)
