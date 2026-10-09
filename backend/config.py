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

    # --- Lot 2 : paiement Mobile Money (pawaPay, page de paiement hébergée) ---
    pawapay_environment: str = "sandbox"              # sandbox | production
    pawapay_api_token_sandbox: Optional[str] = None
    pawapay_api_token_production: Optional[str] = None
    pawapay_callback_secret: Optional[str] = None      # morceau secret de l'adresse de notification
    pawapay_default_country: str = "BFA"               # code pays ISO à 3 lettres

    # --- Lot 2 : paiement par carte (Stripe Checkout) ---
    stripe_secret_key: Optional[str] = None
    stripe_webhook_secret: Optional[str] = None

    # --- Lot 2 : WhatsApp (codes de connexion, notifications) : WABA propre, sinon Transmission SAWALI ---
    whatsapp_access_token: Optional[str] = None
    whatsapp_phone_number_id: Optional[str] = None
    whatsapp_otp_template: Optional[str] = None        # modèle Meta « authentification », 1 variable = le code
    whatsapp_otp_template_lang: str = "fr"
    # SMS de secours pour les codes (Orange, OVH)
    orange_sms_client_id: Optional[str] = None
    orange_sms_client_secret: Optional[str] = None
    orange_sms_sender_msisdn: Optional[str] = None
    orange_sms_sender_name: Optional[str] = None
    ovh_sms_endpoint: str = "ovh-eu"
    ovh_sms_application_key: Optional[str] = None
    ovh_sms_application_secret: Optional[str] = None
    ovh_sms_consumer_key: Optional[str] = None
    ovh_sms_service_name: Optional[str] = None
    ovh_sms_sender: Optional[str] = None
    default_phone_country_code: str = "226"

    # --- Lot 2 : itinéraires routiers (serveur OSRM ; public par défaut, remplaçable par le vôtre) ---
    osrm_url: str = "https://router.project-osrm.org"

    @property
    def public_site_url(self) -> str:
        """Adresse publique du site (première de FRONTEND_ORIGIN) : retours de paiement, liens des messages."""
        o = self.frontend_origins
        return o[0].rstrip("/") if o else "http://localhost:5173"

    @property
    def frontend_origins(self) -> list[str]:
        return [o.strip() for o in self.frontend_origin.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
