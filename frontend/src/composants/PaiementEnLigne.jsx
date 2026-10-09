// ============================================================================
// Paiement en ligne (lot 2) : Mobile Money (pawaPay) et carte (Stripe Checkout)
//   payerEnLigne(api, courseId, moyen, telephone) : demande la page de paiement
//        au serveur puis y envoie le navigateur (window.location.href = adresse)
//   <BoutonsPaiement> : boutons « Payer par Mobile Money » / « Payer par carte »,
//        affichés seulement si le moyen est configuré (config.paiements_en_ligne)
//   <SuiviPaiement>   : bandeau d'état au retour sur /courses/:id?paiement=REF ;
//        interroge le serveur toutes les 4 s tant que le paiement est en attente
//        (2 minutes au plus), puis prévient et recharge la course.
// ============================================================================
import { useEffect, useRef, useState } from 'react'
import api, { messageErreur } from '@/lib/api.js'
import { useConfig } from '@/contexte/Config.jsx'
import { useAuth } from '@/contexte/Auth.jsx'
import { useLangue } from '@/i18n/index.jsx'
import { useToasts } from './Toasts.jsx'
import Jauge from './Jauge.jsx'

// Chemin de l'API selon le moyen choisi
const CHEMINS = { mobile_money: 'mobile-money', carte: 'carte' }

// Demande la page de paiement et y redirige le navigateur
export async function payerEnLigne(courseId, moyen, telephone) {
  const corps = moyen === 'mobile_money' && telephone ? { telephone } : {}
  const { data } = await api.post(`/paiements/courses/${courseId}/${CHEMINS[moyen]}`, corps)
  if (!data?.adresse) throw new Error('Adresse de paiement absente.')
  window.location.href = data.adresse
  return data
}

// Moyens de paiement en ligne réellement disponibles
export function useMoyensEnLigne() {
  const { config } = useConfig()
  const p = config.paiements_en_ligne || {}
  return { mobile_money: Boolean(p.mobile_money), carte: Boolean(p.carte) }
}

// Boutons de paiement d'une course existante
export function BoutonsPaiement({ course }) {
  const { t } = useLangue()
  const { utilisateur } = useAuth()
  const toast = useToasts()
  const moyens = useMoyensEnLigne()
  const [telephone, setTelephone] = useState(utilisateur?.telephone || '')
  const [envoi, setEnvoi] = useState(false)

  if (!moyens.mobile_money && !moyens.carte) return null

  // Clic sur un bouton : redirection vers l'opérateur
  const payer = async (moyen) => {
    setEnvoi(true)
    try {
      await toast.attente(payerEnLigne(course.id, moyen, telephone.trim()), t('pay.redirection'))
    } catch (err) {
      toast.erreur(messageErreur(err, err.message))
      setEnvoi(false)
    }
  }

  return (
    <div className="space-y-2">
      {moyens.mobile_money && (
        <div className="flex gap-2">
          <label className="sr-only" htmlFor="tel-mm">{t('suivi.telMobile')}</label>
          <input id="tel-mm" type="tel" value={telephone} onChange={(e) => setTelephone(e.target.value)} placeholder={t('suivi.telMobile')} className="champ min-w-0 flex-1" />
          <button type="button" disabled={envoi} onClick={() => payer('mobile_money')} className="btn-principal whitespace-nowrap">{t('pay.mobileMoney')}</button>
        </div>
      )}
      {moyens.carte && (
        <button type="button" disabled={envoi} onClick={() => payer('carte')} className="btn-nuit w-full">{t('pay.carte')}</button>
      )}
    </div>
  )
}

// Statuts pour lesquels on continue d'interroger le serveur
const EN_COURS = ['initie', 'en_attente', 'en_cours']

// Bandeau d'état au retour de la page de paiement
export function SuiviPaiement({ reference, onFini }) {
  const { t } = useLangue()
  const toast = useToasts()
  const [etat, setEtat] = useState(reference === 'annule' ? { statut: 'annule' } : { statut: 'en_attente' })
  // onFini peut changer à chaque affichage : on garde la dernière version
  const finRef = useRef(onFini)
  useEffect(() => { finRef.current = onFini }, [onFini])

  useEffect(() => {
    // Paiement abandonné sur la page de l'opérateur
    if (reference === 'annule') { toast.info(t('pay.annule')); return }
    let actif = true
    let minuterie = null
    const debut = Date.now()
    // Une interrogation ; on recommence 4 s plus tard si c'est toujours en attente
    const interroger = async () => {
      try {
        const { data } = await api.get(`/paiements/${encodeURIComponent(reference)}`, { params: { rafraichir: true } })
        if (!actif) return
        setEtat(data)
        if (EN_COURS.includes(data.statut) && Date.now() - debut < 120000) {
          minuterie = setTimeout(interroger, 4000)
          return
        }
        // Résultat définitif (ou délai de 2 min dépassé)
        if (data.statut === 'paye') toast.succes(t('pay.reussi'))
        else if (EN_COURS.includes(data.statut)) toast.info(t('pay.long'))
        else toast.erreur(data.message || t('pay.echec'))
        finRef.current?.()
      } catch (err) {
        if (!actif) return
        setEtat({ statut: 'erreur', message: messageErreur(err) })
        toast.erreur(messageErreur(err))
      }
    }
    interroger()
    return () => { actif = false; clearTimeout(minuterie) }
  }, [reference, toast, t])

  // Présentation selon l'état
  const s = etat.statut
  const styles = {
    paye: ['bg-volt-50 ring-volt-500 text-volt-700', t('pay.reussi')],
    annule: ['bg-slate-50 ring-slate-300 text-slate-700', t('pay.annule')],
    echec: ['bg-red-50 ring-red-400 text-red-700', etat.message || t('pay.echec')],
    montant_incoherent: ['bg-red-50 ring-red-400 text-red-700', etat.message || t('pay.incoherent')],
    erreur: ['bg-red-50 ring-red-400 text-red-700', etat.message || t('pay.echec')],
  }
  const [classe, texte] = styles[s] || ['bg-ambre-50 ring-ambre-500 text-nuit', t('pay.verification')]
  return (
    <div className={`flex items-center gap-3 rounded-2xl p-4 text-sm font-bold ring-1 ${classe}`} role="status">
      {EN_COURS.includes(s) && <Jauge taille={24} couleur="#D9860A" />}
      <span className="flex-1">{texte}</span>
    </div>
  )
}
