"""Point d'entrée FastAPI — serveur de sawali-bfmobility (plateforme VTC multi-pays)."""
from __future__ import annotations

import asyncio

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

import presence_sawali
import signal_connexion   # lot 26 : connexions et visites signalées à SAWALI
import support_sawali   # SAWALI lot 90 : pictogramme d'assistance → support SAWALI
import version_plateforme
from config import get_settings
from db import creer_index
from routes import admin, auth, chauffeur, courses, documents_vehicules, paiements, photos_vehicules, public   # lot 9 : photos ; lot 11 : scans
from routes import retours_sawali   # lot 24 : retours signés de SAWALI (statuts, réponses, STOP, statistiques)
from seed import initialiser

reglages = get_settings()

app = FastAPI(title="sawali-bfmobility API", version=version_plateforme.infos_version()["libelle"])

# Le site (frontend) est servi depuis un autre domaine : autorisation CORS de ses adresses
app.add_middleware(CORSMiddleware, allow_origins=reglages.frontend_origins, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])

api = APIRouter(prefix="/api")


@api.get("/health", tags=["Public"])
async def sante():
    """Le serveur répond (utilisé par la page de connexion : « Serveur actif »)."""
    return {"ok": True}


@api.get("/version", tags=["Public"])
async def version():
    """Version et lot (source unique : frontend/src/version.js)."""
    return version_plateforme.infos_version()


api.include_router(auth.router)
api.include_router(public.router)
api.include_router(courses.router)
api.include_router(chauffeur.router)
api.include_router(paiements.router)   # lot 2 : paiement en ligne (avant admin : routes plus précises)
api.include_router(photos_vehicules.router)   # lot 9 : 4 photos par véhicule (avant admin : routes plus précises)
api.include_router(documents_vehicules.router)   # lot 11 : scans assurance, visite technique, TVM
api.include_router(admin.router)
api.include_router(retours_sawali.router)   # lot 24 : /api/webhooks/liluvine-retour
api.include_router(signal_connexion.router)   # lot 26 : /api/presence/visite (visiteur non connecté)
# SAWALI lot 90 — support SAWALI (personnel du back-office) : identité envoyée à SAWALI pour le fil de discussion
from securite import utilisateur_courant  # noqa: E402
api.include_router(support_sawali.creer_router(utilisateur_courant, lambda u: {
    "id": str(u.get("id") or ""), "nom": u.get("nom") or "", "role": u.get("role") or "",
    "contexte": "bfmobility", "email": u.get("email") or "", "telephone": u.get("telephone") or ""}))
app.include_router(api)


@app.on_event("startup")
async def demarrage() -> None:
    """Index, premier administrateur, démonstration éventuelle, puis signal de présence à SAWALI (règle 4)."""
    await creer_index()
    await initialiser()
    asyncio.create_task(presence_sawali.boucle_presence())
    asyncio.create_task(paiements.boucle_rapprochement())   # lot 2 : finalise les paiements en ligne en attente
