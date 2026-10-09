// ============================================================================
// Mon profil (lot 2) : nom, e-mail, langue et mot de passe (PATCH /auth/moi)
// Accessible à tout utilisateur connecté depuis l'en-tête.
// ============================================================================
import { useState } from 'react'
import PageSite from '@/composants/MiseEnPage.jsx'
import MotDePasse from '@/composants/MotDePasse.jsx'
import { useToasts } from '@/composants/Toasts.jsx'
import { useAuth } from '@/contexte/Auth.jsx'
import { useLangue } from '@/i18n/index.jsx'
import api, { messageErreur } from '@/lib/api.js'

export default function Profil() {
  const { t, langues, changerLangue, langue: langueActuelle } = useLangue()
  const { utilisateur, setUtilisateur } = useAuth()
  const toast = useToasts()
  const [champs, setChamps] = useState({
    nom: utilisateur?.nom || '',
    email: utilisateur?.email || '',
    langue: utilisateur?.langue || langueActuelle,
    mot_de_passe: '',
    confirmation: '',
  })
  const [envoi, setEnvoi] = useState(false)
  const maj = (k) => (e) => setChamps((c) => ({ ...c, [k]: e.target.value }))

  // Enregistrement : seuls les champs modifiés sont envoyés
  const enregistrer = async (e) => {
    e.preventDefault()
    if (champs.mot_de_passe && champs.mot_de_passe.length < 6) { toast.erreur(t('ins.mdpCourt')); return }
    if (champs.mot_de_passe !== champs.confirmation) { toast.erreur(t('profil.mdpDifferents')); return }
    const corps = {}
    if (champs.nom.trim() !== (utilisateur?.nom || '')) corps.nom = champs.nom.trim()
    if (champs.email.trim() !== (utilisateur?.email || '')) corps.email = champs.email.trim() || null
    if (champs.langue !== utilisateur?.langue) corps.langue = champs.langue
    if (champs.mot_de_passe) corps.mot_de_passe = champs.mot_de_passe
    if (!Object.keys(corps).length) { toast.info(t('profil.rienAChanger')); return }
    setEnvoi(true)
    try {
      const { data } = await toast.attente(api.patch('/auth/moi', corps))
      setUtilisateur(data)
      // La langue choisie s'applique tout de suite à l'interface
      if (corps.langue) changerLangue(corps.langue)
      setChamps((c) => ({ ...c, mot_de_passe: '', confirmation: '' }))
      toast.succes(t('profil.enregistre'))
    } catch (err) {
      toast.erreur(messageErreur(err))
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <PageSite>
      <div className="mx-auto max-w-xl px-4 py-8">
        <h1 className="text-3xl font-bold">{t('profil.titre')}</h1>
        <p className="mt-1 text-ardoise">{utilisateur?.telephone}</p>
        <form onSubmit={enregistrer} className="surface mt-6 space-y-4">
          <div>
            <label htmlFor="pf-nom" className="etiquette">{t('ins.nom')}</label>
            <input id="pf-nom" value={champs.nom} onChange={maj('nom')} required minLength={2} autoComplete="name" className="champ" />
          </div>
          <div>
            <label htmlFor="pf-email" className="etiquette">{t('ins.email')}</label>
            <input id="pf-email" type="email" value={champs.email} onChange={maj('email')} autoComplete="email" className="champ" />
          </div>
          <div>
            <label htmlFor="pf-langue" className="etiquette">{t('commun.langue')}</label>
            <select id="pf-langue" value={champs.langue} onChange={maj('langue')} className="champ">
              {langues.map((l) => <option key={l.code} value={l.code}>{l.nom}</option>)}
            </select>
          </div>
          {/* Changement de mot de passe (facultatif) */}
          <fieldset className="space-y-3 border-t border-nuit/10 pt-4">
            <legend className="text-sm font-bold">{t('profil.nouveauMdp')}</legend>
            <MotDePasse id="pf-mdp" value={champs.mot_de_passe} onChange={maj('mot_de_passe')} autoComplete="new-password" placeholder={t('profil.mdpVide')} aria-label={t('profil.nouveauMdp')} />
            <MotDePasse id="pf-conf" value={champs.confirmation} onChange={maj('confirmation')} autoComplete="new-password" placeholder={t('profil.confirmation')} aria-label={t('profil.confirmation')} />
          </fieldset>
          <button type="submit" disabled={envoi} className="btn-principal w-full py-3">{t('commun.enregistrer')}</button>
        </form>
      </div>
    </PageSite>
  )
}
