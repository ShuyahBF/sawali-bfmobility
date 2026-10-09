"""Règles métier de sawali-bfmobility, en fonctions PURES (sans base de données) : testées par tests/test_metier.py.

Pour un développeur WinDev : ce module est l'équivalent d'une collection de procédures globales ; les routes
(dossier routes/) lisent la base, appellent ces fonctions, puis enregistrent le résultat.
"""
from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

# ----------------------------------------------------------------------------------------------------------
# Pays proposés (export international) : devise, langue, indicatif téléphonique, fuseau
# ----------------------------------------------------------------------------------------------------------
PAYS = [
    {"code": "BF", "nom": "Burkina Faso", "devise": "XOF", "langue": "fr", "indicatif": "226", "fuseau": "Africa/Ouagadougou"},
    {"code": "CI", "nom": "Côte d'Ivoire", "devise": "XOF", "langue": "fr", "indicatif": "225", "fuseau": "Africa/Abidjan"},
    {"code": "SN", "nom": "Sénégal", "devise": "XOF", "langue": "fr", "indicatif": "221", "fuseau": "Africa/Dakar"},
    {"code": "ML", "nom": "Mali", "devise": "XOF", "langue": "fr", "indicatif": "223", "fuseau": "Africa/Bamako"},
    {"code": "TG", "nom": "Togo", "devise": "XOF", "langue": "fr", "indicatif": "228", "fuseau": "Africa/Lome"},
    {"code": "BJ", "nom": "Bénin", "devise": "XOF", "langue": "fr", "indicatif": "229", "fuseau": "Africa/Porto-Novo"},
    {"code": "NE", "nom": "Niger", "devise": "XOF", "langue": "fr", "indicatif": "227", "fuseau": "Africa/Niamey"},
    {"code": "CM", "nom": "Cameroun", "devise": "XAF", "langue": "fr", "indicatif": "237", "fuseau": "Africa/Douala"},
    {"code": "GA", "nom": "Gabon", "devise": "XAF", "langue": "fr", "indicatif": "241", "fuseau": "Africa/Libreville"},
    {"code": "MA", "nom": "Maroc", "devise": "MAD", "langue": "fr", "indicatif": "212", "fuseau": "Africa/Casablanca"},
    {"code": "GH", "nom": "Ghana", "devise": "GHS", "langue": "en", "indicatif": "233", "fuseau": "Africa/Accra"},
    {"code": "NG", "nom": "Nigeria", "devise": "NGN", "langue": "en", "indicatif": "234", "fuseau": "Africa/Lagos"},
    {"code": "KE", "nom": "Kenya", "devise": "KES", "langue": "en", "indicatif": "254", "fuseau": "Africa/Nairobi"},
    {"code": "FR", "nom": "France", "devise": "EUR", "langue": "fr", "indicatif": "33", "fuseau": "Europe/Paris"},
    {"code": "BE", "nom": "Belgique", "devise": "EUR", "langue": "fr", "indicatif": "32", "fuseau": "Europe/Brussels"},
    {"code": "ES", "nom": "España", "devise": "EUR", "langue": "es", "indicatif": "34", "fuseau": "Europe/Madrid"},
    {"code": "PT", "nom": "Portugal", "devise": "EUR", "langue": "pt", "indicatif": "351", "fuseau": "Europe/Lisbon"},
    {"code": "CA", "nom": "Canada", "devise": "CAD", "langue": "fr", "indicatif": "1", "fuseau": "America/Toronto"},
    {"code": "US", "nom": "United States", "devise": "USD", "langue": "en", "indicatif": "1", "fuseau": "America/New_York"},
    {"code": "GB", "nom": "United Kingdom", "devise": "GBP", "langue": "en", "indicatif": "44", "fuseau": "Europe/London"},
    {"code": "BR", "nom": "Brasil", "devise": "BRL", "langue": "pt", "indicatif": "55", "fuseau": "America/Sao_Paulo"},
]

# Paramètres par défaut de la plateforme (modifiables par l'administrateur)
PARAMETRES_DEFAUT: Dict[str, Any] = {
    "nom": "sawali-bfmobility",
    "slogan": "Vos trajets, plus verts, plus simples.",
    "pays": "BF", "devise": "XOF", "langue": "fr", "fuseau": "Africa/Ouagadougou", "unite_distance": "km",
    "vitesse_moyenne_kmh": 25.0,     # vitesse urbaine moyenne (estimation de la durée)
    "facteur_route": 1.3,            # distance à vol d'oiseau × 1,3 ≈ distance routière
    "majoration_nuit_pct": 20.0, "nuit_debut": 22, "nuit_fin": 6,
    "commission_pct": 20.0,          # part de la plateforme sur chaque course (pour les statistiques)
    "telephone_support": "", "email_support": "",
    # Lot 2
    "itineraire_routier": True,        # distance et durée par la route (OSRM) plutôt qu'à vol d'oiseau
    "notifications_whatsapp": True,    # messages WhatsApp au client (chauffeur en route, arrivé, reçu…)
    "rayon_recherche_km": 25.0,        # rayon de proposition des courses aux chauffeurs (élargi à la relance)
}

ENERGIES = ("electrique", "hybride", "thermique")
STATUTS_COURSE = ("planifiee", "recherche", "acceptee", "en_approche", "arrivee", "en_cours", "terminee", "annulee")
# Ordre des étapes que le chauffeur fait avancer
ETAPES_CHAUFFEUR = {"acceptee": "en_approche", "en_approche": "arrivee", "arrivee": "en_cours", "en_cours": "terminee"}
# CO₂ évité par km (thermique ≈ 0,12 kg/km, hybride ≈ 40 % de moins) : petit plus affiché au client
CO2_KG_PAR_KM = {"thermique": 0.12, "hybride": 0.072, "electrique": 0.0}


def maintenant() -> datetime:
    return datetime.now(timezone.utc)


def iso(d: Optional[datetime] = None) -> str:
    return (d or maintenant()).isoformat()


def lire_date(valeur: Any) -> Optional[datetime]:
    """Texte ISO (ou datetime) → datetime avec fuseau UTC ; None si vide ou illisible."""
    if not valeur:
        return None
    if isinstance(valeur, datetime):
        return valeur if valeur.tzinfo else valeur.replace(tzinfo=timezone.utc)
    try:
        d = datetime.fromisoformat(str(valeur).replace("Z", "+00:00"))
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


# ----------------------------------------------------------------------------------------------------------
# Distances et durées
# ----------------------------------------------------------------------------------------------------------
def distance_vol_oiseau_km(a: Dict[str, float], b: Dict[str, float]) -> float:
    """Distance « à vol d'oiseau » entre deux points GPS (formule de haversine), en km."""
    r = 6371.0
    la1, lo1, la2, lo2 = map(math.radians, (float(a["lat"]), float(a["lng"]), float(b["lat"]), float(b["lng"])))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def distance_route_km(a: Dict[str, float], b: Dict[str, float], facteur_route: float = 1.3) -> float:
    """Distance routière estimée (vol d'oiseau × facteur de détour), arrondie à 0,1 km."""
    return round(distance_vol_oiseau_km(a, b) * facteur_route, 1)


def duree_minutes(distance_km: float, vitesse_kmh: float = 25.0) -> int:
    """Durée estimée du trajet (au moins 1 minute)."""
    return max(1, round(distance_km / max(vitesse_kmh, 1) * 60))


# ----------------------------------------------------------------------------------------------------------
# Tarification
# ----------------------------------------------------------------------------------------------------------
def promo_active(categorie: Dict[str, Any], quand: Optional[datetime] = None) -> bool:
    """Vrai si la catégorie a une promotion en cours (pourcentage > 0 et date dans [debut, fin])."""
    promo = categorie.get("promo") or {}
    if not promo or float(promo.get("pourcentage") or 0) <= 0:
        return False
    quand = quand or maintenant()
    debut, fin = lire_date(promo.get("debut")), lire_date(promo.get("fin"))
    return (debut is None or debut <= quand) and (fin is None or quand <= fin)


def est_de_nuit(quand: datetime, nuit_debut: int, nuit_fin: int, decalage_heures: float = 0.0) -> bool:
    """Vrai si l'heure locale (UTC + décalage) est dans la plage de nuit (ex. 22 h → 6 h)."""
    heure = (quand + timedelta(hours=decalage_heures)).hour
    if nuit_debut == nuit_fin:
        return False
    return heure >= nuit_debut or heure < nuit_fin if nuit_debut > nuit_fin else nuit_debut <= heure < nuit_fin


def arrondir_montant(montant: float, devise: str) -> float:
    """Arrondi adapté à la devise : franc CFA et devises sans centimes → multiple de 5 ; sinon 2 décimales."""
    if devise in ("XOF", "XAF", "GNF", "NGN", "KES", "JPY"):
        return float(int(math.ceil(montant / 5.0) * 5))
    return round(montant + 1e-9, 2)


def calculer_prix(categorie: Dict[str, Any], mode: str, distance_km: float, duree_min: int,
                  parametres: Dict[str, Any], duree_heures: Optional[float] = None,
                  quand: Optional[datetime] = None, decalage_heures: float = 0.0) -> Dict[str, Any]:
    """Prix d'une course ou d'une location, avec le détail ligne par ligne (repris sur le reçu).

    - course : prise en charge + km × prix_km + minutes × prix_minute, au moins le minimum ;
    - heure  : heures × prix_heure (au moins 1 h) ; jour : jours × prix_jour (au moins 1 jour) ;
    - majoration de nuit (%), puis promotion (%) si active ; arrondi selon la devise.
    """
    devise = parametres.get("devise") or "XOF"
    quand = quand or maintenant()
    lignes: List[Dict[str, Any]] = []
    if mode == "heure":
        heures = max(1.0, float(duree_heures or 1))
        lignes.append({"libelle": f"Location {heures:g} h × {categorie.get('prix_heure', 0):g}", "montant": heures * float(categorie.get("prix_heure") or 0)})
    elif mode == "jour":
        jours = max(1.0, float(duree_heures or 24) / 24)
        jours = math.ceil(jours)
        lignes.append({"libelle": f"Location {jours} jour(s) × {categorie.get('prix_jour', 0):g}", "montant": jours * float(categorie.get("prix_jour") or 0)})
    else:
        lignes.append({"libelle": "Prise en charge", "montant": float(categorie.get("prise_en_charge") or 0)})
        lignes.append({"libelle": f"Distance {distance_km:g} km × {categorie.get('prix_km', 0):g}", "montant": distance_km * float(categorie.get("prix_km") or 0)})
        if float(categorie.get("prix_minute") or 0) > 0:
            lignes.append({"libelle": f"Durée {duree_min} min × {categorie.get('prix_minute', 0):g}", "montant": duree_min * float(categorie.get("prix_minute") or 0)})
        sous_total = sum(l["montant"] for l in lignes)
        minimum = float(categorie.get("minimum") or 0)
        if sous_total < minimum:
            lignes.append({"libelle": "Complément course minimum", "montant": minimum - sous_total})

    base = sum(l["montant"] for l in lignes)
    nuit = est_de_nuit(quand, int(parametres.get("nuit_debut", 22)), int(parametres.get("nuit_fin", 6)), decalage_heures)
    if nuit and float(parametres.get("majoration_nuit_pct") or 0) > 0:
        maj = base * float(parametres["majoration_nuit_pct"]) / 100
        lignes.append({"libelle": f"Majoration de nuit {parametres['majoration_nuit_pct']:g} %", "montant": maj})
    sans_promo = sum(l["montant"] for l in lignes)
    if promo_active(categorie, quand):
        promo = categorie["promo"]
        remise = sans_promo * float(promo["pourcentage"]) / 100
        lignes.append({"libelle": f"Promotion {promo.get('libelle') or ''} −{float(promo['pourcentage']):g} %".replace("  ", " "), "montant": -remise})
    total = sum(l["montant"] for l in lignes)
    return {
        "prix": arrondir_montant(total, devise),
        "prix_sans_promo": arrondir_montant(sans_promo, devise),
        "devise": devise,
        "majoration_nuit": bool(nuit and float(parametres.get("majoration_nuit_pct") or 0) > 0),
        "detail": [{"libelle": l["libelle"], "montant": round(l["montant"], 2)} for l in lignes],
    }


def co2_evite_kg(energie: str, distance_km: float) -> float:
    """CO₂ évité par rapport à un véhicule thermique (kg), pour l'affichage « course verte »."""
    return round(max(0.0, (CO2_KG_PAR_KM["thermique"] - CO2_KG_PAR_KM.get(energie, 0.12)) * distance_km), 2)


# ----------------------------------------------------------------------------------------------------------
# Attribution des courses (rapprochement client / chauffeur)
# ----------------------------------------------------------------------------------------------------------
def chauffeurs_proches(depart: Dict[str, float], chauffeurs: List[Dict[str, Any]], rayon_km: float = 15.0,
                       max_resultats: int = 5) -> List[Dict[str, Any]]:
    """Chauffeurs en ligne avec une position connue, triés du plus proche au plus loin (dans le rayon)."""
    proches = []
    for c in chauffeurs:
        pos = ((c.get("chauffeur") or {}).get("position")) or {}
        if pos.get("lat") is None or pos.get("lng") is None:
            continue
        d = distance_vol_oiseau_km(depart, pos)
        if d <= rayon_km:
            proches.append({**c, "distance_km": round(d, 2)})
    return sorted(proches, key=lambda c: c["distance_km"])[:max_resultats]


def numero_document(prefixe: str, seq: int, quand: Optional[datetime] = None) -> str:
    """Numéro lisible : CRS-2026-000123 (course), REC-… (reçu), CMD-… (commande fournisseur)."""
    return f"{prefixe}-{(quand or maintenant()).year}-{seq:06d}"


# ----------------------------------------------------------------------------------------------------------
# Maintenance, stock et documents : alertes
# ----------------------------------------------------------------------------------------------------------
def etat_plan(plan: Dict[str, Any], kilometrage_actuel: float, aujourd_hui: Optional[datetime] = None) -> Dict[str, Any]:
    """État d'un plan de maintenance : km et jours restants, et gravité (info / attention / urgent / ok)."""
    aujourd_hui = aujourd_hui or maintenant()
    km_restants = jours_restants = None
    if plan.get("intervalle_km"):
        km_restants = float(plan.get("dernier_km") or 0) + float(plan["intervalle_km"]) - float(kilometrage_actuel or 0)
    if plan.get("intervalle_jours"):
        derniere = lire_date(plan.get("derniere_date")) or aujourd_hui
        jours_restants = (derniere + timedelta(days=int(plan["intervalle_jours"])) - aujourd_hui).days
    gravite = "ok"
    if (km_restants is not None and km_restants <= 0) or (jours_restants is not None and jours_restants <= 0):
        gravite = "urgent"
    elif (km_restants is not None and km_restants <= max(500.0, float(plan.get("intervalle_km") or 0) * 0.1)) or \
            (jours_restants is not None and jours_restants <= 15):
        gravite = "attention"
    return {"km_restants": None if km_restants is None else round(km_restants), "jours_restants": jours_restants, "gravite": gravite}


def alertes_document(vehicule: Dict[str, Any], aujourd_hui: Optional[datetime] = None) -> List[Dict[str, Any]]:
    """Assurance et contrôle technique : expiré (urgent) ou expirant dans 30 jours (attention)."""
    aujourd_hui = aujourd_hui or maintenant()
    alertes = []
    for champ, libelle in (("assurance_expire", "Assurance"), ("controle_technique_expire", "Contrôle technique")):
        d = lire_date(vehicule.get(champ))
        if not d:
            continue
        jours = (d - aujourd_hui).days
        if jours < 0:
            alertes.append({"type": "document", "gravite": "urgent", "vehicule_id": vehicule.get("id"),
                            "message": f"{libelle} expiré(e) — {vehicule.get('immatriculation', '')}"})
        elif jours <= 30:
            alertes.append({"type": "document", "gravite": "attention", "vehicule_id": vehicule.get("id"),
                            "message": f"{libelle} expire dans {jours} jour(s) — {vehicule.get('immatriculation', '')}"})
    return alertes


def alerte_stock(piece: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Stock à zéro (urgent) ou sous le seuil d'alerte (attention)."""
    quantite, seuil = float(piece.get("quantite") or 0), float(piece.get("seuil_alerte") or 0)
    if quantite <= 0:
        return {"type": "stock", "gravite": "urgent", "piece_id": piece.get("id"),
                "message": f"Rupture de stock : {piece.get('nom')} ({piece.get('reference')})"}
    if quantite <= seuil:
        return {"type": "stock", "gravite": "attention", "piece_id": piece.get("id"),
                "message": f"Stock bas : {piece.get('nom')} — {quantite:g} restant(s), seuil {seuil:g}"}
    return None


def consommation(saisies: List[Dict[str, Any]]) -> Optional[float]:
    """Consommation moyenne sur 100 km (kWh ou litres) à partir des saisies d'énergie d'un véhicule."""
    tri = sorted((s for s in saisies if s.get("kilometrage") is not None), key=lambda s: float(s["kilometrage"]))
    if len(tri) < 2:
        return None
    km = float(tri[-1]["kilometrage"]) - float(tri[0]["kilometrage"])
    quantite = sum(float(s.get("quantite") or 0) for s in tri[1:])
    return round(quantite / km * 100, 2) if km > 0 else None


def decalage_fuseau(fuseau: Optional[str], quand: Optional[datetime] = None) -> float:
    """Décalage horaire (heures) du fuseau du pays par rapport à UTC, à la date donnée (heure d'été comprise)."""
    try:
        from zoneinfo import ZoneInfo
        d = (quand or maintenant()).astimezone(ZoneInfo(fuseau or "UTC")).utcoffset()
        return d.total_seconds() / 3600 if d else 0.0
    except Exception:  # noqa: BLE001 — fuseau inconnu : UTC
        return 0.0
