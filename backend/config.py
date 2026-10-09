"""Configuration centralisée de sawali-bfmobility, lue dans les variables d'environnement (.env en local).

Aucun secret n'est écrit ici : MONGO_URL, JWT_SECRET, ADMIN_MOT_DE_PASSE… sont saisis par le propriétaire
dans le tableau de bord Render (variables « sync: false » du Blueprint render.yaml).
"""
from __future__ import annotations

from functools import lru_cache
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # MongoDB : toutes les collections sont préfixées (bfm_…) pour cohabiter dans un cluster partagé.
    # MONGO_URL=mongomock:// → base en mémoire (développement et tests, jamais en production).
    mongo_url: str = "mongomock://"
    mongo_db_name: str = "sawali_bfmobility"
    mongo_collection_prefix: str = "bfm_"

    # Jeton de connexion (JWT) — JWT_SECRET généré par Render (generateValue)
    jwt_secret: str = "a-changer-dans-les-variables-d-environnement"
    jwt_algorithm: str = "HS256"
    jwt_expires_minutes: int = 60 * 24 * 30   # 30 jours : les clients restent connectés sur leur téléphone

    # Site public (CORS) : une ou plusieurs adresses séparées par des virgules, l'officielle en premier
    frontend_origin: str = "http://localhost:5173"

    # Premier compte administrateur, créé au démarrage s'il n'existe pas (mot de passe saisi par le propriétaire)
    admin_email: Optional[str] = None
    admin_mot_de_passe: Optional[str] = None
    admin_telephone: Optional[str] = None

    # Données de démonstration (catégories, véhicules, chauffeurs, pièces) : SEED_DEMO=1
    seed_demo: bool = False

    @property
    def frontend_origins(self) -> list[str]:
        return [o.strip() for o in self.frontend_origin.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
