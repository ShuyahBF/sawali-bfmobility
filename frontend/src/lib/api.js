// ============================================================================
// Accès au serveur (API FastAPI) — client axios unique pour tout le site
// ============================================================================
import axios from 'axios'

// Adresse du serveur : variable d'environnement VITE_API_URL (saisie sur Render),
// sinon le serveur local de développement. On retire un éventuel « / » final.
const BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '')
export const URL_API = `${BASE}/api`

// Clé du jeton de connexion dans le stockage local du navigateur
const CLE_JETON = 'bfm_jeton'

// --- Lecture / écriture du jeton (protégées : le stockage peut être bloqué)
export function lireJeton() {
  try { return localStorage.getItem(CLE_JETON) } catch { return null }
}
export function ecrireJeton(jeton) {
  try {
    if (jeton) localStorage.setItem(CLE_JETON, jeton)
    else localStorage.removeItem(CLE_JETON)
  } catch { /* stockage indisponible : on continue sans mémoriser */ }
}

// --- Client axios préconfiguré
const api = axios.create({ baseURL: URL_API, timeout: 30000 })

// Avant chaque appel : ajout de l'en-tête « Authorization: Bearer <jeton> »
api.interceptors.request.use((config) => {
  const jeton = lireJeton()
  if (jeton) config.headers.Authorization = `Bearer ${jeton}`
  return config
})

// Après chaque réponse : sur 401 (jeton expiré ou invalide), on efface le jeton
// et on prévient l'application (événement écouté par le contexte d'authentification).
api.interceptors.response.use(
  (reponse) => reponse,
  (erreur) => {
    if (erreur?.response?.status === 401 && lireJeton()) {
      ecrireJeton(null)
      window.dispatchEvent(new Event('bfm:deconnexion'))
    }
    return Promise.reject(erreur)
  },
)

// Message d'erreur lisible (le serveur répond {"detail": "..."} en français).
// FastAPI peut aussi renvoyer une liste d'erreurs de validation.
export function messageErreur(erreur, defaut = 'Une erreur est survenue.') {
  const detail = erreur?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail.length) {
    return detail.map((d) => `${(d.loc || []).slice(-1)[0] || ''} : ${d.msg}`).join(' ; ')
  }
  if (erreur?.code === 'ECONNABORTED') return 'Le serveur met trop de temps à répondre.'
  if (!erreur?.response) return 'Serveur injoignable. Vérifiez votre connexion.'
  return defaut
}

export default api
