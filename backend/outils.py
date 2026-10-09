"""Petits outils communs aux routes : paramètres de la plateforme, compteurs, nettoyage des documents."""
from __future__ import annotations

import uuid
from typing import Any, Dict

from db import db
from metier import PARAMETRES_DEFAUT


def nouvel_id() -> str:
    return uuid.uuid4().hex


def sans_id_mongo(doc: Dict[str, Any] | None) -> Dict[str, Any] | None:
    """Retire l'_id interne de MongoDB (non sérialisable, inutile au site)."""
    if doc is None:
        return None
    doc = dict(doc)
    doc.pop("_id", None)
    return doc


async def parametres() -> Dict[str, Any]:
    """Paramètres de la plateforme : valeurs par défaut complétées par celles enregistrées par l'administrateur."""
    enregistres = await db.parametres.find_one({"_id": "plateforme"}) or {}
    enregistres.pop("_id", None)
    return {**PARAMETRES_DEFAUT, **enregistres}


async def prochain_numero(nom: str) -> int:
    """Compteur séquentiel (courses, reçus, commandes…) — atomique."""
    from pymongo import ReturnDocument
    doc = await db.compteurs.find_one_and_update({"_id": nom}, {"$inc": {"seq": 1}}, upsert=True,
                                                 return_document=ReturnDocument.AFTER)
    return int((doc or {}).get("seq") or 1)
