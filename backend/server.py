"""Point d'entrée FastAPI — serveur de sawali-bfmobility (plateforme VTC multi-pays)."""
from __future__ import annotations

import asyncio

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

import presence_sawali
import version_plateforme
from config import get_settings
from db import creer_index
from routes import admin, auth, chauffeur, courses, paiements, public
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
api.include_router(admin.router)
app.include_router(api)


@app.on_event("startup")
async def demarrage() -> None:
    """Index, premier administrateur, démonstration éventuelle, puis signal de présence à SAWALI (règle 4)."""
    await creer_index()
    await initialiser()
    asyncio.create_task(presence_sawali.boucle_presence())
    asyncio.create_task(paiements.boucle_rapprochement())   # lot 2 : finalise les paiements en ligne en attente
