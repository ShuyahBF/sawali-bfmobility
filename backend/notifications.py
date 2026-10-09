"""Lot 2 — notifications WhatsApp au client aux moments clés de sa course.

Envoi par transmission_wa.envoyer_whatsapp : WABA propre de la plateforme si configuré, sinon « Transmission WA
Universelle Liluvine » de SAWALI. Toujours EN ARRIÈRE-PLAN et jamais bloquant : une panne d'envoi n'empêche
jamais la course d'avancer. Désactivable dans les paramètres (notifications_whatsapp).
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, Optional

from config import get_settings

logger = logging.getLogger("notifications")

# Textes par événement et par langue ({…} = valeurs de la course). Repli : français.
TEXTES = {
    "fr": {
        "acceptee": "🚗 {nom} : votre chauffeur {chauffeur} arrive en {vehicule} ({plaque}). Suivez-le en direct : {lien}",
        "arrivee": "📍 Votre chauffeur {chauffeur} est arrivé au point de départ ({vehicule}, {plaque}).",
        "terminee": "✅ Course {numero} terminée : {montant}. Merci d'avoir roulé avec {nom} ! Votre reçu : {lien_recu}",
        "liberee": "ℹ️ Votre chauffeur n'est plus disponible : nous recherchons un autre chauffeur pour la course {numero}.",
        "annulee": "❌ Votre course {numero} a été annulée.",
        "reservation": "📅 Réservation {numero} enregistrée pour le {quand}. Nous vous préviendrons à l'arrivée du chauffeur.",
    },
    "en": {
        "acceptee": "🚗 {nom}: your driver {chauffeur} is on the way in a {vehicule} ({plaque}). Track live: {lien}",
        "arrivee": "📍 Your driver {chauffeur} has arrived at the pickup point ({vehicule}, {plaque}).",
        "terminee": "✅ Ride {numero} completed: {montant}. Thanks for riding with {nom}! Your receipt: {lien_recu}",
        "liberee": "ℹ️ Your driver is no longer available: we are looking for another driver for ride {numero}.",
        "annulee": "❌ Your ride {numero} has been cancelled.",
        "reservation": "📅 Booking {numero} saved for {quand}. We will notify you when your driver arrives.",
    },
}


def texte_notification(evenement: str, course: Dict[str, Any], parametres: Dict[str, Any], langue: str = "fr") -> Optional[str]:
    """Fonction PURE : texte du message (None si l'événement n'a pas de message)."""
    modeles = TEXTES.get(langue) or TEXTES["fr"]
    modele = modeles.get(evenement)
    if not modele:
        return None
    site = get_settings().public_site_url
    vehicule = course.get("vehicule") or {}
    montant = course.get("prix_final") if course.get("prix_final") is not None else course.get("prix_estime")
    return modele.format(
        nom=parametres.get("nom") or "sawali-bfmobility",
        chauffeur=(course.get("chauffeur") or {}).get("nom") or "",
        vehicule=" ".join(x for x in (vehicule.get("marque"), vehicule.get("modele"), vehicule.get("couleur")) if x),
        plaque=vehicule.get("immatriculation") or "",
        numero=course.get("numero") or "",
        montant=f"{montant:g} {course.get('devise') or ''}".strip() if montant is not None else "",
        quand=(course.get("quand") or "")[:16].replace("T", " "),
        lien=f"{site}/courses/{course.get('id')}", lien_recu=f"{site}/recu/{course.get('id')}",
    )


async def _envoyer(numero: str, texte: str) -> None:
    try:
        import transmission_wa
        res = await transmission_wa.envoyer_whatsapp(numero, texte)
        if not res.get("ok"):
            logger.info("Notification WhatsApp non envoyée : %s", res.get("erreur"))
    except Exception:  # noqa: BLE001 — jamais bloquant
        logger.debug("Notification WhatsApp impossible", exc_info=True)


def notifier_client(evenement: str, course: Dict[str, Any], parametres: Dict[str, Any], langue: str = "fr") -> None:
    """Programme l'envoi (tâche de fond) si les notifications sont activées et que le client a un numéro."""
    if not parametres.get("notifications_whatsapp", True):
        return
    numero = (course.get("client") or {}).get("telephone")
    texte = texte_notification(evenement, course, parametres, langue)
    if numero and texte:
        try:
            asyncio.get_running_loop().create_task(_envoyer(numero, texte))
        except RuntimeError:
            pass
