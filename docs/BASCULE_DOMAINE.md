# bfmobility — passage au domaine bfmobility.cloud

Ancien domaine : `sawalismartsysems.com` (reste en service pendant toute la transition).
Nouveau domaine : **bfmobility.cloud**.

## 1. Enregistrements DNS à créer (chez le registrar du domaine)

Les valeurs sont celles de Render ; l'écran « Custom Domains » de chaque service les affiche et fait foi.

| Type | Nom | Valeur |
|---|---|---|
| A | `@` | `216.24.57.1` |
| CNAME | `www` | `bfmobility-frontend.onrender.com` |
| CNAME | `api` | `bfmobility-backend.onrender.com` |

- Supprimer d'abord tout A, AAAA ou CNAME existant sur `@`, `www` et `api` (page d'attente du registrar). Garder les enregistrements MX (messagerie) s'il y en a.
- Chez Cloudflare : « DNS seul » (nuage gris) pendant la validation. TTL 300 s.

## 2. Domaines dans Render (une fois les DNS saisis)
`render.yaml` déclare déjà les nouveaux domaines (étape « préparation », sans risque : l'ancien domaine reste le principal) :

- service **bfmobility-frontend** : `bfmobility.cloud`, `www.bfmobility.cloud` ;
- service **bfmobility-backend** : `api.bfmobility.cloud`.

Si Render ne les a pas ajoutés tout seul : Settings › Custom Domains › Add, puis « Verify ». Attendre le certificat HTTPS (quelques minutes).

## 3. Bascule (UNIQUEMENT quand les trois adresses répondent en HTTPS)
Vérifier d'abord : `https://bfmobility.cloud` affiche le site ; `https://api.bfmobility.cloud/api/health` répond.

Puis changer :

| Où | Variable | Nouvelle valeur |
|---|---|---|
| bfmobility-backend | `FRONTEND_ORIGIN` | `https://bfmobility.cloud,https://www.bfmobility.cloud,https://sawalismartsysems.com,https://www.sawalismartsysems.com,https://bfmobility-frontend.onrender.com` (le NOUVEAU domaine en premier : il sert aux liens et aux retours de paiement) |
| bfmobility-frontend | `VITE_API_URL` | `https://api.bfmobility.cloud` (nécessite de relancer la compilation du site) |
| bfmobility-backend | `PUBLIC_API_URL` (si renseignée) | `https://api.bfmobility.cloud` |

À mettre à jour ensuite, côté services externes (adresses qui contiennent l'ancien domaine) :
- adresse de rappel (callback) **PawaPay** et webhook **Stripe** : nouvelle adresse sous `https://api.bfmobility.cloud/api/…` ;
- WhatsApp / Liluvine : adresse de retour `https://api.bfmobility.cloud/api/webhooks/liluvine-retour` dans SAWALI ;
- signal de présence (`backend/presence_sawali.py`, constante `SITE`) : `bfmobility.cloud`.

L'ancien domaine peut rester actif plusieurs semaines : les liens déjà envoyés continuent de marcher.

## 4. Application Android (PWABuilder)
Créer le paquet avec l'adresse **https://bfmobility.cloud**, seulement après la bascule (voir `ANDROID.md`).
