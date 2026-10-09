// ============================================================================
// Authentification : utilisateur connecté, connexion, inscription, déconnexion.
// Le jeton est gardé dans le navigateur (voir lib/api.js) ; au démarrage on
// redemande l'utilisateur au serveur (/auth/moi) pour vérifier qu'il est valide.
// ============================================================================
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import api, { ecrireJeton, lireJeton } from '@/lib/api.js'

const ContexteAuth = createContext(null)

// Page d'accueil de chaque rôle après connexion
export function accueilDuRole(role) {
  switch (role) {
    case 'admin':
    case 'gestionnaire':
      return '/admin'
    case 'mecanicien':
      return '/admin/interventions'
    case 'chauffeur':
      return '/chauffeur'
    default:
      return '/courses'
  }
}

export function AuthProvider({ children }) {
  const [utilisateur, setUtilisateur] = useState(null)
  // « pret » passe à vrai quand on sait si quelqu'un est connecté
  const [pret, setPret] = useState(!lireJeton())

  // Vérification du jeton au démarrage
  useEffect(() => {
    if (!lireJeton()) return
    api.get('/auth/moi')
      .then(({ data }) => setUtilisateur(data))
      .catch(() => { ecrireJeton(null); setUtilisateur(null) })
      .finally(() => setPret(true))
  }, [])

  // Déconnexion forcée quand le serveur répond 401 (événement émis par lib/api.js)
  useEffect(() => {
    const surDeconnexion = () => setUtilisateur(null)
    window.addEventListener('bfm:deconnexion', surDeconnexion)
    return () => window.removeEventListener('bfm:deconnexion', surDeconnexion)
  }, [])

  // Connexion avec e-mail ou téléphone + mot de passe
  const connexion = useCallback(async (identifiant, mot_de_passe) => {
    const { data } = await api.post('/auth/connexion', { identifiant, mot_de_passe })
    ecrireJeton(data.jeton)
    setUtilisateur(data.utilisateur)
    return data.utilisateur
  }, [])

  // Inscription d'un client (rôle « client » attribué par le serveur)
  const inscription = useCallback(async (champs) => {
    const { data } = await api.post('/auth/inscription', champs)
    ecrireJeton(data.jeton)
    setUtilisateur(data.utilisateur)
    return data.utilisateur
  }, [])

  // Déconnexion volontaire
  const deconnexion = useCallback(() => {
    ecrireJeton(null)
    setUtilisateur(null)
  }, [])

  const valeur = useMemo(
    () => ({ utilisateur, setUtilisateur, pret, connexion, inscription, deconnexion }),
    [utilisateur, pret, connexion, inscription, deconnexion],
  )
  return <ContexteAuth.Provider value={valeur}>{children}</ContexteAuth.Provider>
}

export function useAuth() {
  return useContext(ContexteAuth)
}
