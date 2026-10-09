// ============================================================================
// Suivi d'une course en direct (rafraîchi toutes les 5 s)
//   carte (départ, arrivée, position du chauffeur), carte du chauffeur
//   (appel tel:, messages), frise des statuts, paiement, note, reçu, annulation.
// Lot 2 : itinéraire routier, paiement en ligne (Mobile Money / carte) avec
// suivi du retour (?paiement=REF), bouton « Relancer la recherche ».
// ============================================================================
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import PageSite from '@/composants/MiseEnPage.jsx'
import Carte from '@/composants/Carte.jsx'
import Messagerie from '@/composants/Messagerie.jsx'
import Etoiles from '@/composants/Etoiles.jsx'
import Co2 from '@/composants/Co2.jsx'
import Jauge from '@/composants/Jauge.jsx'
import Modale from '@/composants/Modale.jsx'
import BadgeEnergie from '@/composants/BadgeEnergie.jsx'
import BadgeDistance from '@/composants/BadgeDistance.jsx'
import { BoutonsPaiement, SuiviPaiement, useMoyensEnLigne } from '@/composants/PaiementEnLigne.jsx'
import { FriseStatuts, PastilleStatut } from '@/composants/StatutCourse.jsx'
import { useToasts } from '@/composants/Toasts.jsx'
import { useConfig } from '@/contexte/Config.jsx'
import { useLangue } from '@/i18n/index.jsx'
import api, { messageErreur } from '@/lib/api.js'
import { formatDateHeure, formatDuree } from '@/lib/format.js'

// Statuts pendant lesquels la course est « vivante » (rafraîchissement utile)
const ACTIFS = ['planifiee', 'recherche', 'acceptee', 'en_approche', 'arrivee', 'en_cours']
// Statuts où le client peut encore annuler
const ANNULABLES = ['planifiee', 'recherche', 'acceptee', 'en_approche']
// Délai avant de proposer « Relancer la recherche » (2 minutes)
const DELAI_RELANCE_MS = 2 * 60 * 1000

// Depuis quand la course est en « recherche » (dernier passage dans l'historique)
function debutRecherche(course) {
  const h = [...(course.historique || [])].reverse().find((x) => x.statut === 'recherche')
  return h ? new Date(h.le).getTime() : new Date(course.cree_le).getTime()
}

export default function SuiviCourse() {
  const { id } = useParams()
  const { t, langue } = useLangue()
  const { monnaie, distance } = useConfig()
  const toast = useToasts()
  const [course, setCourse] = useState(null)
  const [erreur, setErreur] = useState('')
  const [fenetre, setFenetre] = useState(null) // 'annuler' | 'payer' | 'messages'
  const [motif, setMotif] = useState('')
  const [telMobile, setTelMobile] = useState('')
  const [note, setNote] = useState(0)
  const [commentaire, setCommentaire] = useState('')
  // Retour de la page de paiement : ?paiement=REF ou ?paiement=annule
  const [params] = useSearchParams()
  const retourPaiement = params.get('paiement')
  const moyensEnLigne = useMoyensEnLigne()
  // Heure actuelle, mise à jour toutes les 15 s (pour le bouton « Relancer »)
  const [maintenant, setMaintenant] = useState(() => Date.now())
  useEffect(() => {
    const m = setInterval(() => setMaintenant(Date.now()), 15000)
    return () => clearInterval(m)
  }, [])

  // Lecture de la course
  const charger = useCallback(async () => {
    try {
      const { data } = await api.get(`/courses/${id}`)
      setCourse(data)
      setErreur('')
    } catch (err) {
      setErreur(messageErreur(err))
    }
  }, [id])

  // Premier chargement, puis toutes les 5 s tant que la course est en cours
  useEffect(() => { charger() }, [charger])
  const vivante = course && ACTIFS.includes(course.statut)
  useEffect(() => {
    if (!vivante) return
    const m = setInterval(charger, 5000)
    return () => clearInterval(m)
  }, [vivante, charger])

  // Action générique sur la course (annuler, payer, noter)
  const agir = async (chemin, corps, messageOk) => {
    try {
      const { data } = await toast.attente(api.post(`/courses/${id}/${chemin}`, corps))
      setCourse(data)
      setFenetre(null)
      if (messageOk) toast.succes(messageOk)
    } catch (err) {
      toast.erreur(messageErreur(err))
    }
  }

  if (!course) {
    return (
      <PageSite>
        <div className="grid min-h-[50vh] place-items-center px-4">
          {erreur ? <p className="text-red-600">{erreur}</p> : <Jauge taille={56} />}
        </div>
      </PageSite>
    )
  }

  const c = course
  const prix = c.prix_final ?? c.prix_estime
  const electrique = c.vehicule?.energie === 'electrique'
  // Paiement en ligne possible : course terminée (prix définitif) ou location dès la commande
  const payable = c.paiement?.statut !== 'paye' && c.statut !== 'annulee' && (c.statut === 'terminee' || c.mode !== 'course')
  const enLigne = payable && (moyensEnLigne.mobile_money || moyensEnLigne.carte)
  // Ancien enregistrement manuel (sans opérateur) : seulement si aucun paiement en ligne n'est configuré
  const peutPayer = payable && !enLigne && c.paiement?.moyen !== 'especes'
  // « Relancer la recherche » : en recherche depuis plus de 2 minutes
  const peutRelancer = c.statut === 'recherche' && maintenant - debutRecherche(c) > DELAI_RELANCE_MS

  return (
    <PageSite sansPied>
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[1.25fr_1fr]">
        {/* ---------- Carte en direct ---------- */}
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold">{t('suivi.titre', { numero: c.numero })}</h1>
            <PastilleStatut statut={c.statut} />
          </div>
          {/* Bandeau de retour du paiement en ligne */}
          {retourPaiement && <div className="mb-3"><SuiviPaiement reference={retourPaiement} onFini={charger} /></div>}
          <Carte depart={c.depart} arrivee={c.arrivee} chauffeur={c.chauffeur?.position} trace={c.trace} hauteur="h-72 sm:h-96 lg:h-[520px]" />
          {vivante && <p className="mt-2 flex items-center gap-2 text-xs text-ardoise"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-volt-500" />{t('suivi.majAuto')}</p>}
          {c.statut === 'recherche' && (
            <div className="mt-4 rounded-2xl bg-ambre-50 p-4">
              <div className="flex items-center gap-3"><Jauge taille={28} couleur="#D9860A" /><p className="text-sm font-bold">{t('suivi.attente')}</p></div>
              {/* Personne n'a accepté depuis 2 min : on élargit la recherche */}
              {peutRelancer && (
                <button type="button" onClick={() => agir('relancer', undefined, t('suivi.relancee'))} className="btn-nuit mt-3 w-full">{t('suivi.relancer')}</button>
              )}
            </div>
          )}
        </div>

        {/* ---------- Informations ---------- */}
        <div className="space-y-4">
          {/* Chauffeur */}
          {c.chauffeur && (
            <section className="rounded-3xl bg-nuit p-5 text-white">
              <p className="text-sm text-white/60">{t('suivi.chauffeur')}</p>
              <div className="mt-1 flex items-center gap-4">
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-volt-500 font-display text-2xl font-extrabold text-nuit" aria-hidden="true">
                  {(c.chauffeur.nom || '?').slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-xl font-bold">{c.chauffeur.nom}</p>
                  {c.chauffeur.note_moyenne != null && <p className="text-sm text-volt-600">★ {Number(c.chauffeur.note_moyenne).toFixed(1)}</p>}
                </div>
              </div>
              {c.vehicule && (
                <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                  <span className="rounded-lg bg-white px-2 py-1 font-mono font-bold tracking-wider text-nuit">{c.vehicule.immatriculation}</span>
                  <span>{c.vehicule.marque} {c.vehicule.modele}{c.vehicule.couleur ? `, ${c.vehicule.couleur}` : ''}</span>
                  {c.vehicule.energie && <BadgeEnergie energie={c.vehicule.energie} />}
                </div>
              )}
              <div className="mt-4 grid grid-cols-2 gap-2">
                {c.chauffeur.telephone && <a href={`tel:${c.chauffeur.telephone}`} className="btn-principal">{t('suivi.appeler')}</a>}
                <button type="button" onClick={() => setFenetre('messages')} className="rounded-xl px-4 py-2.5 font-bold ring-1 ring-white/25 hover:bg-white/10">{t('suivi.ecrire')}</button>
              </div>
            </section>
          )}

          {/* Statuts */}
          <section className="surface">
            <FriseStatuts course={c} />
          </section>

          {/* Trajet et prix */}
          <section className="surface space-y-2 text-sm">
            <p className="truncate"><b className="text-volt-700">A</b> {c.depart?.adresse}</p>
            {c.arrivee && <p className="truncate"><b className="text-ambre-600">B</b> {c.arrivee.adresse}</p>}
            <p className="text-ardoise">{formatDateHeure(c.quand || c.cree_le, langue)} · {t(`cmd.mode.${c.mode}`)}{c.distance_km ? ` · ${distance(c.distance_km)}` : ''}{c.duree_min ? ` · ${formatDuree(c.duree_min)}` : ''}</p>
            <div className="flex items-end justify-between border-t border-nuit/10 pt-3">
              <div>
                <p className="text-ardoise">{t('suivi.prix')}</p>
                <p className="font-display text-2xl font-extrabold tabular-nums">{monnaie(prix, c.devise)}</p>
              </div>
              <div className="text-right">
                <p className="text-ardoise">{t(`cmd.${c.paiement?.moyen}`)}</p>
                <p className={`font-bold ${c.paiement?.statut === 'paye' ? 'text-volt-700' : 'text-ambre-600'}`}>{t(`paiement.${c.paiement?.statut || 'non_paye'}`)}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {c.distance_km > 0 && <BadgeDistance source={c.trace?.length > 1 ? 'route' : 'estimation'} />}
              {electrique && c.distance_km > 0 && <Co2 km={c.distance_km} />}
            </div>
          </section>

          {/* Paiement en ligne (Mobile Money / carte) */}
          {enLigne && (
            <section className="surface">
              <h2 className="mb-3 font-bold">{t('pay.titre')}</h2>
              <BoutonsPaiement course={c} />
            </section>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            {peutPayer && <button type="button" onClick={() => setFenetre('payer')} className="btn-principal flex-1">{t('suivi.payer')}</button>}
            {c.statut === 'terminee' && <Link to={`/recu/${c.id}`} className="btn-nuit flex-1">{t('suivi.recu')}</Link>}
            {ANNULABLES.includes(c.statut) && <button type="button" onClick={() => setFenetre('annuler')} className="btn-secondaire flex-1 text-red-600">{t('suivi.annulerCourse')}</button>}
          </div>

          {/* Note de la course */}
          {c.statut === 'terminee' && (
            <section className="surface">
              {c.evaluation ? (
                <>
                  <p className="text-sm font-bold">{t('suivi.merciNote')}</p>
                  <Etoiles valeur={c.evaluation.note} />
                  {c.evaluation.commentaire && <p className="mt-1 text-sm text-ardoise">« {c.evaluation.commentaire} »</p>}
                </>
              ) : (
                <form onSubmit={(e) => { e.preventDefault(); if (note) agir('noter', { note, commentaire: commentaire.trim() || undefined }, t('suivi.merciNote')) }}>
                  <p className="mb-2 font-bold">{t('suivi.noter')}</p>
                  <Etoiles valeur={note} onChange={setNote} taille="text-3xl" />
                  <textarea value={commentaire} onChange={(e) => setCommentaire(e.target.value)} rows={2} placeholder={t('suivi.commentaire')} className="champ mt-3" maxLength={500} />
                  <button type="submit" disabled={!note} className="btn-principal mt-3 w-full">{t('commun.envoyer')}</button>
                </form>
              )}
            </section>
          )}
        </div>
      </div>

      {/* Fenêtres : messages, annulation, paiement */}
      <Modale titre={t('suivi.messages')} ouverte={fenetre === 'messages'} onFermer={() => setFenetre(null)}>
        <Messagerie courseId={id} actif={vivante} />
      </Modale>
      <Modale titre={t('suivi.annulerCourse')} ouverte={fenetre === 'annuler'} onFermer={() => setFenetre(null)}>
        <label htmlFor="motif" className="etiquette">{t('suivi.motif')}</label>
        <input id="motif" value={motif} onChange={(e) => setMotif(e.target.value)} className="champ" />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={() => setFenetre(null)} className="btn-secondaire">{t('commun.retour')}</button>
          <button type="button" onClick={() => agir('annuler', { motif: motif.trim() || undefined }, t('statut.annulee'))} className="rounded-xl bg-red-600 px-5 py-2.5 font-bold text-white">{t('suivi.annulerCourse')}</button>
        </div>
      </Modale>
      <Modale titre={t('suivi.payer')} ouverte={fenetre === 'payer'} onFermer={() => setFenetre(null)}>
        <p className="font-display text-3xl font-extrabold tabular-nums">{monnaie(prix, c.devise)}</p>
        <p className="text-sm text-ardoise">{t(`cmd.${c.paiement?.moyen}`)}</p>
        {c.paiement?.moyen === 'mobile_money' && (
          <div className="mt-4">
            <label htmlFor="telmm" className="etiquette">{t('suivi.telMobile')}</label>
            <input id="telmm" type="tel" value={telMobile} onChange={(e) => setTelMobile(e.target.value)} className="champ" />
          </div>
        )}
        <button type="button" onClick={() => agir('payer', { moyen: c.paiement?.moyen, telephone: telMobile.trim() || undefined }, t('paiement.en_attente'))} className="btn-principal mt-4 w-full py-3">{t('suivi.payer')}</button>
      </Modale>
    </PageSite>
  )
}
