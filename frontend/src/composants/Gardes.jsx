// ============================================================================
// Protection des pages : redirige vers /connexion si personne n'est connecté,
// ou vers l'accueil du rôle si le rôle n'a pas accès à la page.
// ============================================================================
import { Navigate, useLocation } from 'react-router-dom'
import { accueilDuRole, useAuth } from '@/contexte/Auth.jsx'
import Jauge from './Jauge.jsx'

export default function RouteProtegee({ roles, children }) {
  const { utilisateur, pret } = useAuth()
  const lieu = useLocation()

  // Vérification du jeton en cours : petite jauge centrale
  if (!pret) {
    return <div className="grid min-h-[60vh] place-items-center"><Jauge taille={56} /></div>
  }
  // Personne de connecté : page de connexion, avec retour prévu ensuite
  if (!utilisateur) {
    return <Navigate to={`/connexion?suite=${encodeURIComponent(lieu.pathname + lieu.search)}`} replace />
  }
  // Rôle non autorisé
  if (roles && !roles.includes(utilisateur.role)) {
    return <Navigate to={accueilDuRole(utilisateur.role)} replace />
  }
  return children
}
