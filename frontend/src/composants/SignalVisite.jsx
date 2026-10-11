// ============================================================================
// Lot 26 — Signal « visite » envoyé au serveur (qui le relaie, signé, à SAWALI)
// ----------------------------------------------------------------------------
// Composant monté UNE fois pour tout le site, sans rien afficher :
//   - attend de savoir si quelqu'un est connecté (« pret ») ;
//   - si PERSONNE n'est connecté, envoie POST /api/presence/visite
//     { visiteur, page } au plus une fois toutes les 30 minutes par navigateur ;
//   - « visiteur » = identifiant aléatoire gardé dans le stockage local du
//     navigateur (aucune donnée personnelle), avec l'heure du dernier envoi.
// Le stockage local peut être bloqué (navigation privée…) : chaque accès est
// protégé par try/catch ; en cas d'échec, l'envoi reste possible (le serveur
// limite lui aussi à une fois / 30 min par visiteur ou par adresse IP).
// Aucune erreur n'est jamais montrée à l'utilisateur.
// ============================================================================
import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import api from '@/lib/api.js'
import { useAuth } from '@/contexte/Auth.jsx'

// Clés du stockage local et intervalle minimal entre deux signaux
const CLE_VISITEUR = 'bfm_visiteur'
const CLE_DERNIER_ENVOI = 'bfm_visite_le'
const INTERVALLE_MS = 30 * 60 * 1000

// Lecture / écriture protégées du stockage local
function lire(cle) {
  try { return localStorage.getItem(cle) } catch { return null }
}
function ecrire(cle, valeur) {
  try { localStorage.setItem(cle, valeur) } catch { /* stockage indisponible : on continue */ }
}

// Identifiant aléatoire du navigateur (créé à la première visite)
function identifiantVisiteur() {
  let id = lire(CLE_VISITEUR)
  if (!id) {
    try {
      id = crypto.randomUUID().replace(/-/g, '')
    } catch {
      id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`
    }
    ecrire(CLE_VISITEUR, id)
  }
  return id
}

export default function SignalVisite() {
  const { utilisateur, pret } = useAuth()
  const { pathname } = useLocation()
  // Vrai dès que la décision a été prise pour ce chargement (pas de nouvel essai après une déconnexion)
  const fait = useRef(false)

  useEffect(() => {
    // On attend de savoir si quelqu'un est connecté ; un utilisateur connecté n'envoie rien
    if (!pret || fait.current) return
    fait.current = true
    if (utilisateur) return
    // Une fois toutes les 30 minutes au plus par navigateur
    const dernier = Number(lire(CLE_DERNIER_ENVOI) || 0)
    if (Date.now() - dernier < INTERVALLE_MS) return
    ecrire(CLE_DERNIER_ENVOI, String(Date.now()))
    api.post('/presence/visite', { visiteur: identifiantVisiteur(), page: pathname })
      .catch(() => { /* serveur injoignable : sans importance */ })
    // Uniquement au chargement de l'application (et quand l'état de connexion est connu)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pret, utilisateur])

  return null
}
