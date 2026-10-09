// ============================================================================
// « Devenez chauffeur » (lot 2) : formulaire de candidature public
// envoyé à POST /public/candidatures, traité ensuite dans le back-office
// (écran Candidatures). Une seule candidature par numéro et par jour (409).
// ============================================================================
import { useState } from 'react'
import { Link } from 'react-router-dom'
import PageSite from '@/composants/MiseEnPage.jsx'
import { useToasts } from '@/composants/Toasts.jsx'
import { useLangue } from '@/i18n/index.jsx'
import api, { messageErreur } from '@/lib/api.js'

// Valeurs vides du formulaire
const VIDE = { nom: '', telephone: '', ville: '', experience_annees: '', permis_numero: '', vehicule_personnel: '', message: '' }

export default function DevenirChauffeur() {
  const { t } = useLangue()
  const toast = useToasts()
  const [champs, setChamps] = useState(VIDE)
  const [envoi, setEnvoi] = useState(false)
  const [envoyee, setEnvoyee] = useState(false)
  const maj = (k) => (e) => setChamps((c) => ({ ...c, [k]: e.target.value }))

  // Envoi de la candidature (champs vides non envoyés)
  const envoyer = async (e) => {
    e.preventDefault()
    setEnvoi(true)
    try {
      const corps = {}
      Object.entries(champs).forEach(([k, v]) => {
        const valeur = String(v).trim()
        if (valeur) corps[k] = k === 'experience_annees' ? Number(valeur) : valeur
      })
      await toast.attente(api.post('/public/candidatures', corps))
      setEnvoyee(true)
      setChamps(VIDE)
    } catch (err) {
      toast.erreur(messageErreur(err))
    } finally {
      setEnvoi(false)
    }
  }

  // Petit raccourci pour un champ texte avec son libellé
  const champ = (cle, libelle, props = {}) => (
    <div>
      <label htmlFor={`cand-${cle}`} className="etiquette">{libelle}{props.required && <span className="text-red-600"> *</span>}</label>
      <input id={`cand-${cle}`} value={champs[cle]} onChange={maj(cle)} className="champ" {...props} />
    </div>
  )

  return (
    <PageSite>
      <div className="mx-auto grid max-w-5xl gap-10 px-4 py-10 lg:grid-cols-[1fr_1.3fr]">
        {/* Présentation */}
        <div>
          <h1 className="text-4xl font-extrabold leading-tight">{t('cand.titre')}</h1>
          <p className="mt-4 text-lg text-ardoise">{t('accueil.chauffeurTexte')}</p>
          <ul className="mt-6 space-y-3 text-nuit">
            {['cand.av1', 'cand.av2', 'cand.av3'].map((k) => (
              <li key={k} className="flex gap-3"><span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-volt-500" aria-hidden="true" />{t(k)}</li>
            ))}
          </ul>
        </div>

        {/* Formulaire ou confirmation */}
        {envoyee ? (
          <div className="surface h-fit text-center">
            <p className="font-display text-2xl font-bold">{t('cand.merci')}</p>
            <p className="mt-2 text-ardoise">{t('cand.rappel')}</p>
            <Link to="/" className="btn-principal mt-6">{t('commun.retour')}</Link>
          </div>
        ) : (
          <form onSubmit={envoyer} className="surface grid gap-4 sm:grid-cols-2">
            {champ('nom', t('ins.nom'), { required: true, autoComplete: 'name', minLength: 2 })}
            {champ('telephone', t('ins.telephone'), { required: true, type: 'tel', autoComplete: 'tel' })}
            {champ('ville', t('cand.ville'))}
            {champ('experience_annees', t('cand.experience'), { type: 'number', min: 0, max: 60, inputMode: 'numeric' })}
            {champ('permis_numero', t('cand.permis'))}
            {champ('vehicule_personnel', t('cand.vehicule'), { placeholder: t('cand.vehiculePh') })}
            <div className="sm:col-span-2">
              <label htmlFor="cand-message" className="etiquette">{t('cand.message')}</label>
              <textarea id="cand-message" value={champs.message} onChange={maj('message')} rows={3} maxLength={1000} className="champ" />
            </div>
            <button type="submit" disabled={envoi} className="btn-principal py-3 text-base sm:col-span-2">{t('cand.envoyer')}</button>
          </form>
        )}
      </div>
    </PageSite>
  )
}
