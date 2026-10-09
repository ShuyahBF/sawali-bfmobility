"""Courses et locations : commande par le client, attribution au chauffeur, étapes, paiement, note, messages, reçu.

Cycle de vie d'une course (statut) :
    planifiee (réservation à plus de 30 min) → recherche → acceptee → en_approche → arrivee → en_cours → terminee
    ou annulee à tout moment avant « en_cours ».
"""
from __future__ import annotations

from datetime import timedelta
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from db import db
from metier import (ETAPES_CHAUFFEUR, calculer_prix, co2_evite_kg, decalage_fuseau, duree_minutes, iso, lire_date,
                    maintenant, numero_document)
from outils import nouvel_id, parametres, prochain_numero
from routes.public import DemandeEstimation, Point, estimer
from notifications import notifier_client
from securite import EQUIPE, exiger, utilisateur_courant

router = APIRouter(tags=["Courses"])

MOYENS_PAIEMENT = ("especes", "mobile_money", "carte")
STATUTS_ANNULABLES = ("planifiee", "recherche", "acceptee", "en_approche", "arrivee")


class NouvelleCourse(BaseModel):
    mode: str = "course"
    categorie: str
    depart: Point
    arrivee: Optional[Point] = None
    quand: Optional[str] = None
    duree_heures: Optional[float] = None
    paiement: str = "especes"
    note_client: Optional[str] = Field(default=None, max_length=500)


class Annulation(BaseModel):
    motif: Optional[str] = Field(default=None, max_length=300)


class Paiement(BaseModel):
    moyen: str
    telephone: Optional[str] = None


class Evaluation(BaseModel):
    note: int = Field(ge=1, le=5)
    commentaire: Optional[str] = Field(default=None, max_length=500)


class Etape(BaseModel):
    statut: str
    km_reel: Optional[float] = Field(default=None, ge=0)
    encaisse: Optional[bool] = None


class Message(BaseModel):
    texte: str = Field(min_length=1, max_length=1000)


# ------------------------------------------------------------------------------------------------- outils
def _historique(statut: str) -> Dict[str, Any]:
    return {"statut": statut, "le": iso()}


async def charger(course_id: str) -> Dict[str, Any]:
    c = await db.courses.find_one({"id": course_id}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Course introuvable")
    return c


def peut_voir(u: Dict[str, Any], c: Dict[str, Any]) -> bool:
    """Le client propriétaire, le chauffeur affecté et l'équipe de la société voient la course."""
    return (u["role"] in EQUIPE or (c.get("client") or {}).get("id") == u["id"]
            or (c.get("chauffeur") or {}).get("id") == u["id"])


async def avec_position(c: Dict[str, Any]) -> Dict[str, Any]:
    """Ajoute la position la plus récente du chauffeur (suivi en direct par le client)."""
    ch = c.get("chauffeur")
    if ch and ch.get("id"):
        u = await db.utilisateurs.find_one({"id": ch["id"]}, {"_id": 0, "chauffeur": 1})
        c["chauffeur"] = {**ch, "position": ((u or {}).get("chauffeur") or {}).get("position")}
    return c


async def proposer_aux_chauffeurs(course: Dict[str, Any], rayon_km: Optional[float] = None) -> None:
    """Rapprochement : les chauffeurs en ligne, libres, avec un véhicule de la catégorie, les plus proches d'abord.
    La course leur est PROPOSÉE (liste « proposee_a ») ; le premier qui accepte l'obtient."""
    from metier import chauffeurs_proches
    vehicules = {v["id"]: v async for v in db.vehicules.find({"categorie": course["categorie"],
                                                               "statut": {"$in": ["disponible", "en_service"]}}, {"_id": 0})}
    candidats = [u async for u in db.utilisateurs.find({"role": "chauffeur", "actif": {"$ne": False},
                                                         "chauffeur.en_ligne": True}, {"_id": 0})]
    occupes = {c["chauffeur"]["id"] async for c in db.courses.find(
        {"statut": {"$in": ["acceptee", "en_approche", "arrivee", "en_cours"]}}, {"chauffeur.id": 1})}
    refus = set(course.get("refusee_par") or [])   # lot 2 : les chauffeurs qui ont refusé ne la revoient pas
    libres = [u for u in candidats if (u.get("chauffeur") or {}).get("vehicule_id") in vehicules
              and u["id"] not in occupes and u["id"] not in refus]
    if rayon_km is None:
        rayon_km = float((await parametres()).get("rayon_recherche_km") or 25.0)
    proches = chauffeurs_proches(course["depart"], libres, rayon_km=rayon_km, max_resultats=8)
    # Aucun chauffeur positionné à proximité : la course reste visible de tous les chauffeurs libres de la catégorie
    ids = [u["id"] for u in proches] or [u["id"] for u in libres]
    await db.courses.update_one({"id": course["id"]}, {"$set": {"proposee_a": ids}})


async def activer_reservations() -> None:
    """Réservations dont l'heure approche (moins de 30 min) : passent de « planifiee » à « recherche »."""
    limite = iso(maintenant() + timedelta(minutes=30))
    async for c in db.courses.find({"statut": "planifiee", "quand": {"$lte": limite}}, {"_id": 0}):
        await db.courses.update_one({"id": c["id"], "statut": "planifiee"},
                                    {"$set": {"statut": "recherche"}, "$push": {"historique": _historique("recherche")}})
        await proposer_aux_chauffeurs({**c, "statut": "recherche"})


# ------------------------------------------------------------------------------------------------- client
@router.post("/courses")
async def commander(corps: NouvelleCourse, u: dict = Depends(utilisateur_courant)):
    """Commande d'une course (immédiate ou réservée) ou d'une location à l'heure / à la journée."""
    if corps.paiement not in MOYENS_PAIEMENT:
        raise HTTPException(status_code=422, detail="Moyen de paiement inconnu")
    en_cours = await db.courses.find_one({"client.id": u["id"], "statut": {"$in": ["recherche", "acceptee", "en_approche", "arrivee", "en_cours"]}})
    if en_cours:
        raise HTTPException(status_code=409, detail="Vous avez déjà une course en cours")
    est = await estimer(DemandeEstimation(depart=corps.depart, arrivee=corps.arrivee, categorie=corps.categorie,
                                          mode=corps.mode, duree_heures=corps.duree_heures, quand=corps.quand))
    quand = lire_date(corps.quand)
    reservee = bool(quand and quand > maintenant() + timedelta(minutes=30))
    statut = "planifiee" if reservee else "recherche"
    course = {
        "id": nouvel_id(), "numero": numero_document("CRS", await prochain_numero("courses")), "statut": statut,
        "mode": corps.mode, "categorie": corps.categorie,
        "depart": corps.depart.model_dump(), "arrivee": corps.arrivee.model_dump() if corps.arrivee else None,
        "quand": iso(quand) if quand else iso(), "duree_heures": corps.duree_heures,
        "distance_km": est["distance_km"], "duree_min": est["duree_min"], "trace": est.get("trace"),
        "prix_estime": est["prix"], "prix_final": None, "devise": est["devise"], "detail_prix": est["detail"],
        "paiement": {"moyen": corps.paiement, "statut": "non_paye", "reference": None},
        "client": {"id": u["id"], "nom": u.get("nom"), "telephone": u.get("telephone")},
        "chauffeur": None, "vehicule": None, "note_client": corps.note_client, "evaluation": None,
        "historique": [_historique(statut)], "proposee_a": [], "cree_le": iso(),
    }
    await db.courses.insert_one(dict(course))
    if statut == "recherche":
        await proposer_aux_chauffeurs(course)
    else:
        notifier_client("reservation", course, await parametres(), u.get("langue") or "fr")
    return await charger(course["id"])


@router.get("/courses/mes")
async def mes_courses(u: dict = Depends(utilisateur_courant)):
    """Courses du client (ou du chauffeur), les plus récentes d'abord."""
    champ = "chauffeur.id" if u["role"] == "chauffeur" else "client.id"
    return [c async for c in db.courses.find({champ: u["id"]}, {"_id": 0, "proposee_a": 0}).sort("cree_le", -1).limit(200)]


@router.get("/courses/{course_id}")
async def voir(course_id: str, u: dict = Depends(utilisateur_courant)):
    c = await charger(course_id)
    if not peut_voir(u, c):
        raise HTTPException(status_code=404, detail="Course introuvable")
    c.pop("proposee_a", None)
    if c.get("vehicule") and c.get("distance_km"):
        c["co2_evite_kg"] = co2_evite_kg(c["vehicule"].get("energie", "thermique"), float(c["distance_km"]))
    return await avec_position(c)


@router.post("/courses/{course_id}/annuler")
async def annuler(course_id: str, corps: Annulation, u: dict = Depends(utilisateur_courant)):
    c = await charger(course_id)
    if not peut_voir(u, c):
        raise HTTPException(status_code=404, detail="Course introuvable")
    if c["statut"] not in STATUTS_ANNULABLES:
        raise HTTPException(status_code=409, detail="Cette course ne peut plus être annulée")
    await db.courses.update_one({"id": course_id}, {"$set": {"statut": "annulee", "annulation": {
        "par": u["role"], "motif": corps.motif, "le": iso()}}, "$push": {"historique": _historique("annulee")}})
    if c.get("vehicule"):
        await db.vehicules.update_one({"id": c["vehicule"]["id"], "statut": "en_service"}, {"$set": {"statut": "disponible"}})
    if u["id"] != (c.get("client") or {}).get("id"):
        notifier_client("annulee", c, await parametres())
    return await voir(course_id, u)


@router.post("/courses/{course_id}/payer")
async def payer(course_id: str, corps: Paiement, u: dict = Depends(utilisateur_courant)):
    """Paiement du client. Lot 1 : le paiement est ENREGISTRÉ (« en_attente ») ; il passe à « payé » quand le chauffeur
    encaisse (espèces) ou quand la société le confirme. Les passerelles en ligne (Mobile Money, carte) arrivent au lot 2."""
    c = await charger(course_id)
    if (c.get("client") or {}).get("id") != u["id"] and u["role"] not in EQUIPE:
        raise HTTPException(status_code=404, detail="Course introuvable")
    if corps.moyen not in MOYENS_PAIEMENT:
        raise HTTPException(status_code=422, detail="Moyen de paiement inconnu")
    if (c.get("paiement") or {}).get("statut") == "paye":
        raise HTTPException(status_code=409, detail="Cette course est déjà payée")
    statut = "paye" if u["role"] in EQUIPE else "en_attente"
    reference = f"PAY-{c['numero']}"
    await db.courses.update_one({"id": course_id}, {"$set": {"paiement": {
        "moyen": corps.moyen, "statut": statut, "reference": reference, "telephone": corps.telephone, "le": iso()}}})
    return await voir(course_id, u)


@router.post("/courses/{course_id}/noter")
async def noter(course_id: str, corps: Evaluation, u: dict = Depends(utilisateur_courant)):
    """Note du client sur une course terminée ; met à jour la note moyenne du chauffeur."""
    c = await charger(course_id)
    if (c.get("client") or {}).get("id") != u["id"]:
        raise HTTPException(status_code=404, detail="Course introuvable")
    if c["statut"] != "terminee":
        raise HTTPException(status_code=409, detail="Vous pourrez noter la course une fois terminée")
    if c.get("evaluation"):
        raise HTTPException(status_code=409, detail="Course déjà notée")
    await db.courses.update_one({"id": course_id}, {"$set": {"evaluation": {**corps.model_dump(), "le": iso()}}})
    if c.get("chauffeur"):
        ch = await db.utilisateurs.find_one({"id": c["chauffeur"]["id"]}, {"_id": 0, "chauffeur": 1}) or {}
        info = ch.get("chauffeur") or {}
        nb = int(info.get("nb_notes") or 0)
        moyenne = (float(info.get("note_moyenne") or 0) * nb + corps.note) / (nb + 1)
        await db.utilisateurs.update_one({"id": c["chauffeur"]["id"]}, {"$set": {
            "chauffeur.note_moyenne": round(moyenne, 2), "chauffeur.nb_notes": nb + 1}})
    return await voir(course_id, u)


@router.get("/courses/{course_id}/recu")
async def recu(course_id: str, u: dict = Depends(utilisateur_courant)):
    """Reçu de la course (affiché et imprimé par le site)."""
    c = await charger(course_id)
    if not peut_voir(u, c):
        raise HTTPException(status_code=404, detail="Course introuvable")
    if c["statut"] != "terminee":
        raise HTTPException(status_code=409, detail="Le reçu est disponible à la fin de la course")
    if not c.get("recu_numero"):
        c["recu_numero"] = numero_document("REC", await prochain_numero("recus"))
        await db.courses.update_one({"id": course_id}, {"$set": {"recu_numero": c["recu_numero"]}})
    p = await parametres()
    total = c.get("prix_final") if c.get("prix_final") is not None else c.get("prix_estime")
    return {
        "numero": c["recu_numero"], "course_numero": c["numero"], "date": c.get("termine_le") or c["cree_le"],
        "societe": {"nom": p.get("nom"), "telephone": p.get("telephone_support"), "email": p.get("email_support"), "pays": p.get("pays")},
        "client": {"nom": c["client"].get("nom"), "telephone": c["client"].get("telephone")},
        "chauffeur": {"nom": (c.get("chauffeur") or {}).get("nom")},
        "vehicule": {"modele": " ".join(x for x in ((c.get("vehicule") or {}).get("marque"), (c.get("vehicule") or {}).get("modele")) if x),
                     "immatriculation": (c.get("vehicule") or {}).get("immatriculation"), "energie": (c.get("vehicule") or {}).get("energie")},
        "trajet": {"depart": (c.get("depart") or {}).get("adresse"), "arrivee": (c.get("arrivee") or {}).get("adresse"),
                   "distance_km": c.get("distance_km"), "duree_min": c.get("duree_min")},
        "lignes": c.get("detail_prix") or [], "total": total, "devise": c.get("devise"),
        "paiement": c.get("paiement"),
        "co2_evite_kg": co2_evite_kg((c.get("vehicule") or {}).get("energie", "thermique"), float(c.get("distance_km") or 0)),
    }


@router.get("/courses/{course_id}/messages")
async def messages(course_id: str, u: dict = Depends(utilisateur_courant)):
    c = await charger(course_id)
    if not peut_voir(u, c):
        raise HTTPException(status_code=404, detail="Course introuvable")
    return c.get("messages") or []


@router.post("/courses/{course_id}/messages")
async def ecrire(course_id: str, corps: Message, u: dict = Depends(utilisateur_courant)):
    """Message entre le client et le chauffeur (mise en relation par la plateforme, numéros non obligatoires)."""
    c = await charger(course_id)
    if not peut_voir(u, c):
        raise HTTPException(status_code=404, detail="Course introuvable")
    m = {"id": nouvel_id(), "auteur_id": u["id"], "auteur_nom": u.get("nom"), "role": u["role"], "texte": corps.texte.strip(), "le": iso()}
    await db.courses.update_one({"id": course_id}, {"$push": {"messages": {"$each": [m], "$slice": -200}}})
    return m


# ------------------------------------------------------------------------------------------------- chauffeur
@router.post("/courses/{course_id}/accepter")
async def accepter(course_id: str, u: dict = Depends(exiger("chauffeur"))):
    """Le premier chauffeur qui accepte obtient la course (mise à jour atomique sur le statut « recherche »)."""
    info = u.get("chauffeur") or {}
    vehicule = await db.vehicules.find_one({"id": info.get("vehicule_id")}, {"_id": 0}) if info.get("vehicule_id") else None
    if not vehicule:
        raise HTTPException(status_code=409, detail="Aucun véhicule ne vous est affecté : contactez la société")
    if await db.courses.find_one({"chauffeur.id": u["id"], "statut": {"$in": ["acceptee", "en_approche", "arrivee", "en_cours"]}}):
        raise HTTPException(status_code=409, detail="Terminez d'abord votre course en cours")
    c = await charger(course_id)
    if c["categorie"] != vehicule.get("categorie"):
        raise HTTPException(status_code=409, detail="Votre véhicule n'est pas de la catégorie demandée")
    res = await db.courses.update_one({"id": course_id, "statut": "recherche"}, {"$set": {
        "statut": "acceptee",
        "chauffeur": {"id": u["id"], "nom": u.get("nom"), "telephone": u.get("telephone"), "note_moyenne": info.get("note_moyenne")},
        "vehicule": {k: vehicule.get(k) for k in ("id", "marque", "modele", "couleur", "immatriculation", "energie")},
    }, "$push": {"historique": _historique("acceptee")}})
    if res.modified_count == 0:
        raise HTTPException(status_code=409, detail="Course déjà prise par un autre chauffeur ou annulée")
    await db.vehicules.update_one({"id": vehicule["id"]}, {"$set": {"statut": "en_service"}})
    notifier_client("acceptee", await charger(course_id), await parametres())
    return await voir(course_id, u)


@router.post("/courses/{course_id}/statut")
async def etape(course_id: str, corps: Etape, u: dict = Depends(exiger("chauffeur", *EQUIPE))):
    """Le chauffeur fait avancer sa course : en_approche → arrivee → en_cours → terminee.
    À la fin : prix final recalculé avec le km réel (s'il est donné), kilométrage du véhicule mis à jour,
    paiement en espèces marqué « payé » si le chauffeur a encaissé."""
    c = await charger(course_id)
    if u["role"] == "chauffeur" and (c.get("chauffeur") or {}).get("id") != u["id"]:
        raise HTTPException(status_code=404, detail="Course introuvable")
    attendu = ETAPES_CHAUFFEUR.get(c["statut"])
    if corps.statut != attendu:
        raise HTTPException(status_code=409, detail=f"Étape suivante attendue : {attendu or 'aucune'}")
    maj: Dict[str, Any] = {"statut": corps.statut}
    if corps.statut == "en_cours":
        maj["demarre_le"] = iso()
    if corps.statut == "terminee":
        maj["termine_le"] = iso()
        p = await parametres()
        categorie = await db.categories.find_one({"code": c["categorie"]}, {"_id": 0}) or {}
        distance = float(corps.km_reel) if corps.km_reel is not None else float(c.get("distance_km") or 0)
        debut = lire_date(c.get("demarre_le"))
        duree = max(1, round((maintenant() - debut).total_seconds() / 60)) if debut else duree_minutes(distance, float(p["vitesse_moyenne_kmh"]))
        if c["mode"] == "course" and categorie:
            prix = calculer_prix(categorie, "course", round(distance, 1), duree, p, None, lire_date(c.get("quand")),
                                 decalage_fuseau(p.get("fuseau")))
            maj.update(prix_final=prix["prix"], detail_prix=prix["detail"], distance_km=round(distance, 1), duree_min=duree)
        else:
            maj["prix_final"] = c.get("prix_estime")
        # Le chauffeur coche « encaissé » (espèces, ou paiement reçu sur son téléphone) : la course est payée
        if corps.encaisse:
            maj["paiement"] = {**(c.get("paiement") or {}), "statut": "paye", "reference": f"PAY-{c['numero']}", "le": iso()}
        if c.get("vehicule"):
            await db.vehicules.update_one({"id": c["vehicule"]["id"]}, {"$set": {"statut": "disponible"},
                                                                         "$inc": {"kilometrage": round(distance, 1)}})
    await db.courses.update_one({"id": course_id}, {"$set": maj, "$push": {"historique": _historique(corps.statut)}})
    if corps.statut in ("arrivee", "terminee"):
        notifier_client(corps.statut, await charger(course_id), await parametres())
    return await voir(course_id, u)


# ------------------------------------------------------------------------------------------------- lot 2 : relance, refus, libération
@router.post("/courses/{course_id}/relancer")
async def relancer(course_id: str, u: dict = Depends(utilisateur_courant)):
    """Le client relance la recherche (aucun chauffeur n'a encore accepté) : rayon élargi à 2 × le rayon habituel."""
    c = await charger(course_id)
    if (c.get("client") or {}).get("id") != u["id"] and u["role"] not in EQUIPE:
        raise HTTPException(status_code=404, detail="Course introuvable")
    if c["statut"] != "recherche":
        raise HTTPException(status_code=409, detail="La course n'est pas en recherche de chauffeur")
    rayon = float((await parametres()).get("rayon_recherche_km") or 25.0) * 2
    await db.courses.update_one({"id": course_id}, {"$set": {"relancee_le": iso()}, "$inc": {"relances": 1}})
    await proposer_aux_chauffeurs(c, rayon_km=rayon)
    return await voir(course_id, u)


@router.post("/courses/{course_id}/refuser")
async def refuser(course_id: str, u: dict = Depends(exiger("chauffeur"))):
    """Le chauffeur refuse une course proposée : elle disparaît de sa liste et ne lui est plus proposée."""
    c = await charger(course_id)
    if c["statut"] != "recherche":
        raise HTTPException(status_code=409, detail="Cette course n'est plus proposée")
    await db.courses.update_one({"id": course_id}, {"$pull": {"proposee_a": u["id"]}, "$addToSet": {"refusee_par": u["id"]}})
    return {"ok": True}


@router.post("/courses/{course_id}/liberer")
async def liberer(course_id: str, corps: Annulation, u: dict = Depends(exiger("chauffeur", *EQUIPE))):
    """Le chauffeur se désiste AVANT le départ (panne, empêchement) : la course repart en recherche d'un autre
    chauffeur, le véhicule redevient disponible et le client est prévenu."""
    c = await charger(course_id)
    if u["role"] == "chauffeur" and (c.get("chauffeur") or {}).get("id") != u["id"]:
        raise HTTPException(status_code=404, detail="Course introuvable")
    if c["statut"] not in ("acceptee", "en_approche", "arrivee"):
        raise HTTPException(status_code=409, detail="La course ne peut plus être libérée")
    ancien = (c.get("chauffeur") or {}).get("id")
    await db.courses.update_one({"id": course_id}, {
        "$set": {"statut": "recherche", "chauffeur": None, "vehicule": None},
        "$addToSet": {"refusee_par": ancien},
        "$push": {"historique": {"statut": "recherche", "le": iso(), "motif": corps.motif or "chauffeur libéré"}}})
    if c.get("vehicule"):
        await db.vehicules.update_one({"id": c["vehicule"]["id"]}, {"$set": {"statut": "disponible"}})
    nouvelle = await charger(course_id)
    await proposer_aux_chauffeurs(nouvelle)
    notifier_client("liberee", c, await parametres())
    # Le chauffeur n'est plus affecté : on renvoie l'état de la course sans passer par le contrôle « peut_voir »
    resultat = await charger(course_id)
    for cle in ("proposee_a", "refusee_par", "messages"):
        resultat.pop(cle, None)
    return resultat
