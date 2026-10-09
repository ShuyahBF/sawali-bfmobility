"""Lot 2 — itinéraire ROUTIER (distance, durée et tracé) via un serveur OSRM (Open Source Routing Machine).

Fonctionne dans tous les pays (données OpenStreetMap). Si le serveur ne répond pas en 4 s, on revient à
l'estimation « vol d'oiseau × facteur de détour » (metier.distance_route_km) : la commande n'est jamais bloquée.
Les réponses sont gardées en mémoire 10 minutes (mêmes points arrondis à ~10 m) pour ne pas solliciter OSRM inutilement.
"""
from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

import httpx

from config import get_settings

_CACHE: Dict[tuple, tuple] = {}
DUREE_CACHE = 600


def _cle(a: Dict[str, float], b: Dict[str, float]) -> tuple:
    return (round(float(a["lat"]), 4), round(float(a["lng"]), 4), round(float(b["lat"]), 4), round(float(b["lng"]), 4))


def simplifier(points: List[List[float]], max_points: int = 300) -> List[List[float]]:
    """Réduit le tracé à ~300 points (affichage léger sur la carte), en gardant le premier et le dernier."""
    if len(points) <= max_points:
        return points
    pas = len(points) / max_points
    garde = [points[int(i * pas)] for i in range(max_points)]
    garde[-1] = points[-1]
    return garde


async def itineraire(a: Dict[str, float], b: Dict[str, float]) -> Optional[Dict[str, Any]]:
    """{distance_km, duree_min, trace:[[lat,lng],…]} ou None (serveur indisponible : estimation de secours)."""
    cle = _cle(a, b)
    if cle in _CACHE and time.time() - _CACHE[cle][0] < DUREE_CACHE:
        return _CACHE[cle][1]
    url = (f"{get_settings().osrm_url.rstrip('/')}/route/v1/driving/"
           f"{float(a['lng'])},{float(a['lat'])};{float(b['lng'])},{float(b['lat'])}")
    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            r = await client.get(url, params={"overview": "full", "geometries": "geojson"})
        donnees = r.json()
        route = (donnees.get("routes") or [None])[0]
        if r.status_code >= 400 or not route:
            return None
        resultat = {
            "distance_km": round(float(route["distance"]) / 1000, 1),
            "duree_min": max(1, round(float(route["duration"]) / 60)),
            # OSRM donne [lng, lat] : on inverse pour la carte (Leaflet attend [lat, lng])
            "trace": simplifier([[p[1], p[0]] for p in route["geometry"]["coordinates"]]),
        }
    except Exception:  # noqa: BLE001 — réseau, format : estimation de secours
        return None
    _CACHE[cle] = (time.time(), resultat)
    return resultat
