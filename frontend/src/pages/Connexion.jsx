// ============================================================================
// Page de connexion (e-mail ou téléphone + mot de passe)
// Après connexion : retour à la page demandée (?suite=…) sinon accueil du rôle.
// ============================================================================
import { useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import CarteAuth from './CarteAuth.jsx'
import MotDePasse from '@/composants/MotDePasse.jsx'
import { useToasts } from '@/composants/Toasts.jsx'
import { accueilDuRole, useAuth } from '@/contexte/Auth.jsx'
import { useLangue } from '@/i18n/index.jsx'
import { messageErreur } from '@/lib/api.js'

// N'accepte que des chemins internes pour la redirection (sécurité)
export function suiteSure(suite) {
  return suite && suite.startsWith('/') && !suite.startsWith('//') ? suite : null
}

export default function Connexion() {
  const { t } = useLangue()
  const { connexion, utilisateur } = useAuth()
  const toast = useToasts()
  const naviguer = useNavigate()
  const [params] = useSearchParams()
  const suite = suiteSure(params.get('suite'))
  const [identifiant, setIdentifiant] = useState('')
  const [mdp, setMdp] = useState('')
  const [envoi, setEnvoi] = useState(false)

  // Déjà connecté : on part directement
  if (utilisateur && !envoi) return <Navigate to={suite || accueilDuRole(utilisateur.role)} replace />

  // Envoi du formulaire
  const valider = async (e) => {
    e.preventDefault()
    setEnvoi(true)
    try {
      const u = await toast.attente(connexion(identifiant.trim(), mdp))
      naviguer(suite || accueilDuRole(u.role), { replace: true })
    } catch (err) {
      toast.erreur(messageErreur(err, 'Identifiant ou mot de passe incorrect.'))
      setEnvoi(false)
    }
  }

  return (
    <CarteAuth
      titre={t('cnx.titre')}
      sousTitre={t('cnx.sousTitre')}
      pied={<>{t('cnx.pasDeCompte')} <Link to={`/inscription${suite ? `?suite=${encodeURIComponent(suite)}` : ''}`} className="font-bold text-volt-700 hover:underline">{t('nav.inscription')}</Link></>}
    >
      <form onSubmit={valider} className="space-y-4">
        <div>
          <label htmlFor="identifiant" className="mb-1 block text-sm font-bold">{t('cnx.identifiant')}</label>
          <input id="identifiant" value={identifiant} onChange={(e) => setIdentifiant(e.target.value)} required autoComplete="username" className="champ" />
        </div>
        <div>
          <label htmlFor="mdp" className="mb-1 block text-sm font-bold">{t('cnx.mdp')}</label>
          <MotDePasse id="mdp" value={mdp} onChange={(e) => setMdp(e.target.value)} required autoComplete="current-password" />
        </div>
        <button type="submit" disabled={envoi} className="btn-principal w-full py-3 text-base">{t('cnx.bouton')}</button>
      </form>
    </CarteAuth>
  )
}
