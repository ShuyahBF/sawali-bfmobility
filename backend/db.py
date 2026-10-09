"""Connexion MongoDB (Motor) avec PRÉFIXAGE automatique des collections (bfm_vehicules, bfm_courses…).

Le cluster Atlas est partagé avec d'autres projets : tout accès passe par `db.<nom>`, préfixé d'office,
impossible d'oublier le préfixe. Le lot 1 utilise volontairement peu de collections (limite de 500 du cluster).
"""
from __future__ import annotations

from config import get_settings


class BasePrefixee:
    """Accès aux collections : db.courses → collection « bfm_courses »."""

    def __init__(self, base, prefixe: str):
        self._base = base
        self._prefixe = prefixe

    def __getattr__(self, nom: str):
        return self._base[f"{self._prefixe}{nom}"]

    def __getitem__(self, nom: str):
        return self._base[f"{self._prefixe}{nom}"]


def _client(url: str):
    # mongomock:// → base en mémoire (tests, développement sans réseau)
    if url.startswith("mongomock://"):
        from mongomock_motor import AsyncMongoMockClient
        return AsyncMongoMockClient()
    from motor.motor_asyncio import AsyncIOMotorClient
    return AsyncIOMotorClient(url)


_reglages = get_settings()
db = BasePrefixee(_client(_reglages.mongo_url)[_reglages.mongo_db_name], _reglages.mongo_collection_prefix)


async def creer_index() -> None:
    """Index utiles (recherche et unicité). Jamais bloquant : une erreur d'index n'empêche pas le démarrage."""
    try:
        await db.utilisateurs.create_index("id", unique=True)
        await db.utilisateurs.create_index("telephone", unique=True, sparse=True)
        await db.utilisateurs.create_index("email", unique=True, sparse=True)
        await db.courses.create_index("id", unique=True)
        await db.courses.create_index([("statut", 1), ("cree_le", -1)])
        await db.courses.create_index("client.id")
        await db.courses.create_index("chauffeur.id")
        for nom in ("vehicules", "categories", "energie", "plans", "interventions", "pieces",
                    "fournisseurs", "commandes", "paiements_fournisseurs"):
            await db[nom].create_index("id", unique=True)
    except Exception:  # noqa: BLE001
        pass
