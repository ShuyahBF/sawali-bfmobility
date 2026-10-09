# sawali-bfmobility

Plateforme web de **VTC et location de véhicules avec chauffeur** — électriques ⚡, hybrides 🔋 et thermiques ⛽ —
pensée pour s'exporter dans tous les pays (devise, langue, fuseau, unité de distance réglables).

## Deux faces
- **Clients** : tarifs au km / à l'heure / à la journée et promotions, estimation instantanée sur carte, commande ou
  réservation, suivi du chauffeur en direct, appel et messages, paiement (espèces, mobile money, carte), reçu
  imprimable, note du chauffeur, CO₂ évité.
- **Société** : tableau de bord, parc (immatriculation, énergie, confort, kilométrage, documents), catégories et
  tarifs, chauffeurs / mécaniciens / gestionnaires, courses et affectation, énergie (recharges, pleins), plans de
  maintenance et interventions, pièces détachées et stock, fournisseurs, commandes et paiements fournisseurs, alertes.
- **Chauffeurs** : en ligne / hors ligne avec GPS, courses proposées, étapes de la course, encaissement, recharges.

## Structure
| Dossier | Contenu |
|---|---|
| `backend/` | API FastAPI + MongoDB (collections préfixées `bfm_`) — `metier.py` contient les règles de calcul |
| `frontend/` | Site Vite + React + Tailwind, carte Leaflet / OpenStreetMap, i18n (fr, en, es, pt) |
| `docs/API.md` | Contrat d'API (toutes les routes) |
| `render.yaml` | Blueprint Render (serveur + site) |

## Démarrer en local
```bash
cd backend && python -m venv .venv && . .venv/bin/activate && pip install -r requirements-dev.txt
cp .env.exemple .env      # base en mémoire, démonstration activée
uvicorn server:app --reload --port 8000
python -m pytest tests -q
cd ../frontend && npm install && npm run dev   # http://localhost:5173
```

## Version et lot
Source unique : `frontend/src/version.js` (VERSION +1 et LOT = numéro de la PR à chaque déploiement), exposée par
`GET /api/version` et affichée sur la connexion et toutes les pages.

## Secrets
Aucun secret dans Git : `MONGO_URL`, `ADMIN_MOT_DE_PASSE`, `DEMO_MOT_DE_PASSE`, `LOOIS_SUPPORT_CLE` sont saisis dans
Render (variables « sync: false »).
