// ============================================================================
// Création d'un compte client (nom, téléphone, e-mail facultatif, mot de passe)
// ============================================================================
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import CarteAuth from './CarteAuth.jsx'
import { suiteSure } from './Connexion.jsx'
import MotDePasse from '@/composants/MotDePasse.jsx'
import { useToasts } from '@/composants/Toasts.jsx'
import { accueilDuRole, useAuth } from '@/contexte/Auth.jsx'
import { useLangue } from '@/i18n/index.jsx'
import { messageErreur } from '@/lib/api.js'

export default function Inscription() {
  const { t, langue } = useLangue()
  const { inscription } = useAuth()
  const toast = useToasts()
  const naviguer = useNavigate()
  const [params] = useSearchParams()
  const suite = suiteSure(params.get('suite'))
  const [champs, setChamps] = useState({ nom: '', telephone: '', email: '', mot_de_passe: '' })
  const [envoi, setEnvoi] = useState(false)
  const maj = (k) => (e) => setChamps((c) => ({ ...c, [k]: e.target.value }))

  // Envoi du formulaire
  const valider = async (e) => {
    e.preventDefault()
    if (champs.mot_de_passe.length < 6) { toast.erreur(t('ins.mdpCourt')); return }
    setEnvoi(true)
    try {
      const corps = { nom: champs.nom.trim(), telephone: champs.telephone.trim(), mot_de_passe: champs.mot_de_passe, langue }
      if (champs.email.trim()) corps.email = champs.email.trim()
      const u = await toast.attente(inscription(corps))
      naviguer(suite || accueilDuRole(u.role), { replace: true })
    } catch (err) {
      toast.erreur(messageErreur(err))
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <CarteAuth
      titre={t('ins.titre')}
      sousTitre={t('ins.sousTitre')}
      pied={<>{t('cnx.dejaCompte')} <Link to={`/connexion${suite ? `?suite=${encodeURIComponent(suite)}` : ''}`} className="font-bold text-volt-700 hover:underline">{t('nav.connexion')}</Link></>}
    >
      <form onSubmit={valider} className="space-y-4">
        <div>
          <label htmlFor="nom" className="mb-1 block text-sm font-bold">{t('ins.nom')}</label>
          <input id="nom" value={champs.nom} onChange={maj('nom')} required autoComplete="name" className="champ" />
        </div>
        <div>
          <label htmlFor="tel" className="mb-1 block text-sm font-bold">{t('ins.telephone')}</label>
          <input id="tel" type="tel" value={champs.telephone} onChange={maj('telephone')} required autoComplete="tel" className="champ" />
        </div>
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-bold">{t('ins.email')}</label>
          <input id="email" type="email" value={champs.email} onChange={maj('email')} autoComplete="email" className="champ" />
        </div>
        <div>
          <label htmlFor="mdp" className="mb-1 block text-sm font-bold">{t('cnx.mdp')}</label>
          <MotDePasse id="mdp" value={champs.mot_de_passe} onChange={maj('mot_de_passe')} required minLength={6} autoComplete="new-password" />
        </div>
        <button type="submit" disabled={envoi} className="btn-principal w-full py-3 text-base">{t('ins.bouton')}</button>
      </form>
    </CarteAuth>
  )
}
