// ============================================================================
// Espace chauffeur (pensé pour le téléphone)
//   - interrupteur En ligne / Hors ligne ; en ligne, la position GPS du
//     navigateur est envoyée toutes les 15 s (POST /chauffeur/position)
//   - courses proposées (Accepter), course en cours avec boutons d'étapes
//   - appel / messages au client, saisie d'une recharge ou d'un plein
//   - lot 2 : « Refuser » une course proposée, « Me désister » d'une course
//     acceptée (avant le départ, avec motif), itinéraire routier sur la carte
// ============================================================================
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Logo from '@/composants/Logo.jsx'
import Carte from '@/composants/Carte.jsx'
import Messagerie from '@/composants/Messagerie.jsx'
import Modale from '@/composants/Modale.jsx'
import Version from '@/composants/Version.jsx'
import SelecteurLangue from '@/composants/SelecteurLangue.jsx'
import { PastilleStatut } from '@/composants/StatutCourse.jsx'
import { useToasts } from '@/composants/Toasts.jsx'
import { useAuth } from '@/contexte/Auth.jsx'
import { useConfig } from '@/contexte/Config.jsx'
import { useLangue } from '@/i18n/index.jsx'
import api, { messageErreur } from '@/lib/api.js'
import { maPosition } from '@/lib/geo.js'
import { formatDateHeure, formatDuree } from '@/lib/format.js'

// Étape suivante d'une course selon son statut actuel
const SUIVANTE = { acceptee: 'en_approche', en_approche: 'arrivee', arrivee: 'en_cours', en_cours: 'terminee' }

// Statuts où le chauffeur peut encore se désister (avant de démarrer la course)
const DESISTABLES = ['acceptee', 'en_approche', 'arrivee']

// Lien d'itinéraire OpenStreetMap entre deux points
const itineraire = (a, b) => (a && b ? `https://www.openstreetmap.org/directions?route=${a.lat},${a.lng};${b.lat},${b.lng}` : null)

export default function Chauffeur() {
  const { t, langue } = useLangue()
  const { utilisateur, setUtilisateur, deconnexion } = useAuth()
  const { monnaie, distance } = useConfig()
  const toast = useToasts()
  const [enLigne, setEnLigne] = useState(Boolean(utilisateur?.chauffeur?.en_ligne))
  const [position, setPosition] = useState(null)
  const [donnees, setDonnees] = useState({ proposees: [], en_cours: null, recentes: [] })
  const [kmReel, setKmReel] = useState('')
  const [encaisse, setEncaisse] = useState(false)
  const [fenetre, setFenetre] = useState(null) // 'messages' | 'energie' | 'desister'
  const [motif, setMotif] = useState('')
  const [energie, setEnergie] = useState({ type: 'recharge', quantite: '', cout: '', kilometrage: '', station: '' })
  const dejaCharge = useRef(false)

  // --- Lecture des courses du chauffeur
  const charger = useCallback(async () => {
    try {
      const appel = api.get('/chauffeur/courses')
      // Premier chargement sous « Patientez… », les suivants en silence
      const { data } = dejaCharge.current ? await appel : await toast.attente(appel)
      dejaCharge.current = true
      setDonnees({ proposees: data.proposees || [], en_cours: data.en_cours || null, recentes: data.recentes || [] })
    } catch (err) {
      if (!dejaCharge.current) toast.erreur(messageErreur(err))
    }
  }, [toast])

  // Rafraîchissement : toutes les 5 s pendant une course, sinon toutes les 10 s
  const enCours = donnees.en_cours
  useEffect(() => {
    charger()
    const m = setInterval(charger, enCours ? 5000 : 10000)
    return () => clearInterval(m)
  }, [charger, enCours])

  // --- Envoi de la position toutes les 15 s quand on est en ligne
  useEffect(() => {
    if (!enLigne) return
    let actif = true
    const envoyer = async () => {
      try {
        const p = await maPosition()
        if (!actif) return
        setPosition(p)
        await api.post('/chauffeur/position', p)
      } catch { /* GPS indisponible : on réessaie au prochain tour */ }
    }
    envoyer()
    const m = setInterval(envoyer, 15000)
    return () => { actif = false; clearInterval(m) }
  }, [enLigne])

  // --- Interrupteur En ligne / Hors ligne
  const basculer = async () => {
    const cible = !enLigne
    try {
      let corps = { en_ligne: cible }
      if (cible) {
        // On joint la position si le navigateur la donne (sinon on passe quand même en ligne)
        try { const p = await maPosition(); corps = { ...corps, ...p }; setPosition(p) } catch { /* sans position */ }
      }
      const { data } = await toast.attente(api.post('/chauffeur/disponibilite', corps))
      if (data) setUtilisateur(data)
      setEnLigne(cible)
    } catch (err) {
      toast.erreur(messageErreur(err))
    }
  }

  // --- Accepter une course proposée
  const accepter = async (course) => {
    try {
      await toast.attente(api.post(`/courses/${course.id}/accepter`))
      toast.succes(`${course.numero} : ${t('statut.acceptee')}`)
      charger()
    } catch (err) {
      toast.erreur(messageErreur(err))
      charger()
    }
  }

  // --- Refuser une course proposée : elle disparaît de mes propositions
  const refuser = async (course) => {
    try {
      await toast.attente(api.post(`/courses/${course.id}/refuser`))
      // Retrait immédiat de la liste, sans attendre le prochain rafraîchissement
      setDonnees((d) => ({ ...d, proposees: d.proposees.filter((x) => x.id !== course.id) }))
      toast.info(`${course.numero} : ${t('chf.refusee')}`)
    } catch (err) {
      toast.erreur(messageErreur(err))
    }
  }

  // --- Me désister de la course acceptée : elle repart en recherche
  const desister = async (e) => {
    e.preventDefault()
    try {
      await toast.attente(api.post(`/courses/${enCours.id}/liberer`, { motif: motif.trim() || undefined }))
      toast.info(t('chf.desiste'))
      setFenetre(null)
      setMotif('')
      charger()
    } catch (err) {
      toast.erreur(messageErreur(err))
    }
  }

  // --- Passage à l'étape suivante de la course en cours
  const etapeSuivante = async () => {
    const statut = SUIVANTE[enCours.statut]
    if (!statut) return
    const corps = { statut }
    if (statut === 'terminee') {
      if (kmReel !== '') corps.km_reel = Number(kmReel)
      if (enCours.paiement?.moyen === 'especes') corps.encaisse = encaisse
    }
    try {
      await toast.attente(api.post(`/courses/${enCours.id}/statut`, corps))
      toast.succes(t(`statut.${statut}`))
      setKmReel('')
      setEncaisse(false)
      charger()
    } catch (err) {
      toast.erreur(messageErreur(err))
    }
  }

  // --- Saisie d'une recharge ou d'un plein
  const enregistrerEnergie = async (e) => {
    e.preventDefault()
    try {
      const corps = { type: energie.type, quantite: Number(energie.quantite), cout: Number(energie.cout), kilometrage: Number(energie.kilometrage) }
      if (energie.station.trim()) corps.station = energie.station.trim()
      await toast.attente(api.post('/chauffeur/energie', corps))
      toast.succes(t('chf.energieOk'))
      setFenetre(null)
      setEnergie({ type: 'recharge', quantite: '', cout: '', kilometrage: '', station: '' })
    } catch (err) {
      toast.erreur(messageErreur(err))
    }
  }

  // Destination de la navigation : le client (avant prise en charge) puis l'arrivée
  const versClient = enCours && ['acceptee', 'en_approche'].includes(enCours.statut)
  const lienRoute = enCours && (versClient ? itineraire(position, enCours.depart) : itineraire(enCours.depart, enCours.arrivee))

  return (
    <div className="min-h-screen bg-brume pb-10">
      {/* ---------- En-tête : logo + interrupteur ---------- */}
      <header className="sticky top-0 z-[500] bg-nuit text-white">
        <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-3">
          <Link to="/" aria-label="Accueil"><Logo clair taille={26} /></Link>
          <span className="ml-auto"><SelecteurLangue clair /></span>
        </div>
        <div className="mx-auto max-w-xl px-4 pb-4">
          <button
            type="button"
            role="switch"
            aria-checked={enLigne}
            onClick={basculer}
            className={`flex w-full items-center gap-4 rounded-2xl p-3 text-left transition ${enLigne ? 'bg-volt-500 text-nuit' : 'bg-white/10 text-white'}`}
          >
            {/* Interrupteur visuel */}
            <span className={`relative h-8 w-14 shrink-0 rounded-full transition ${enLigne ? 'bg-nuit' : 'bg-white/25'}`}>
              <span className={`absolute top-1 h-6 w-6 rounded-full transition-all ${enLigne ? 'left-7 bg-volt-400' : 'left-1 bg-white'}`} />
            </span>
            <span className="flex-1">
              <span className="block font-display text-lg font-bold">{enLigne ? t('chf.enLigne') : t('chf.horsLigne')}</span>
              <span className="block text-sm opacity-80">{enLigne ? t('chf.gpsActif') : t('chf.gpsInactif')}</span>
            </span>
            <span className="text-sm font-bold underline">{enLigne ? t('chf.passerHorsLigne') : t('chf.passerEnLigne')}</span>
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-xl space-y-5 px-4 pt-5">
        {/* ---------- Course en cours ---------- */}
        {enCours && (
          <section className="overflow-hidden rounded-3xl bg-white ring-1 ring-nuit/10">
            <Carte depart={enCours.depart} arrivee={enCours.arrivee} chauffeur={position} trace={enCours.trace} hauteur="h-56" className="!rounded-none ring-0" />
            <div className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-bold">{t('chf.enCours')} {enCours.numero}</h2>
                <PastilleStatut statut={enCours.statut} />
              </div>
              <p className="truncate text-sm"><b className="text-volt-700">A</b> {enCours.depart?.adresse}</p>
              {enCours.arrivee && <p className="truncate text-sm"><b className="text-ambre-600">B</b> {enCours.arrivee.adresse}</p>}
              {enCours.note_client && <p className="rounded-xl bg-ambre-50 p-2 text-sm">« {enCours.note_client} »</p>}
              <div className="flex items-center justify-between text-sm">
                <span>{t('chf.client')} : <b>{enCours.client?.nom}</b></span>
                <span className="font-display text-lg font-extrabold tabular-nums">{monnaie(enCours.prix_final ?? enCours.prix_estime, enCours.devise)}</span>
              </div>
              <p className="text-sm text-ardoise">{t(`cmd.${enCours.paiement?.moyen}`)} — {t(`paiement.${enCours.paiement?.statut || 'non_paye'}`)}</p>

              {/* Contact client + itinéraire */}
              <div className="grid grid-cols-3 gap-2">
                {enCours.client?.telephone ? <a href={`tel:${enCours.client.telephone}`} className="btn-secondaire px-2">{t('suivi.appeler')}</a> : <span />}
                <button type="button" onClick={() => setFenetre('messages')} className="btn-secondaire px-2">{t('suivi.ecrire')}</button>
                {lienRoute ? <a href={lienRoute} target="_blank" rel="noreferrer" className="btn-secondaire px-2">{t('chf.itineraire')}</a> : <span />}
              </div>

              {/* Avant de terminer : km réel et encaissement espèces */}
              {enCours.statut === 'en_cours' && (
                <div className="space-y-2 rounded-2xl bg-brume p-3">
                  <label htmlFor="km" className="block text-sm font-bold">{t('chf.kmReel')}</label>
                  <input id="km" type="number" inputMode="decimal" step="0.1" min="0" value={kmReel} onChange={(e) => setKmReel(e.target.value)} className="champ" />
                  {enCours.paiement?.moyen === 'especes' && (
                    <label className="flex items-center gap-2 text-sm font-bold">
                      <input type="checkbox" checked={encaisse} onChange={(e) => setEncaisse(e.target.checked)} className="h-5 w-5 accent-volt-600" />
                      {t('chf.encaisse')}
                    </label>
                  )}
                </div>
              )}

              {/* Bouton d'étape, grand et facile à toucher */}
              {SUIVANTE[enCours.statut] && (
                <button type="button" onClick={etapeSuivante} className={`w-full rounded-2xl py-4 font-display text-lg font-extrabold ${enCours.statut === 'en_cours' ? 'bg-nuit text-volt-400' : 'bg-volt-500 text-nuit'}`}>
                  {t(`chf.etape.${SUIVANTE[enCours.statut]}`)}
                </button>
              )}
              {/* Désistement possible tant que la course n'a pas démarré */}
              {DESISTABLES.includes(enCours.statut) && (
                <button type="button" onClick={() => setFenetre('desister')} className="w-full py-2 text-sm font-bold text-red-600 underline">{t('chf.desister')}</button>
              )}
            </div>
          </section>
        )}

        {/* ---------- Courses proposées ---------- */}
        {!enCours && (
          <section>
            <h2 className="mb-2 text-lg font-bold">{t('chf.proposees')}</h2>
            {donnees.proposees.length === 0 && (
              <p className="rounded-2xl bg-white p-4 text-sm text-ardoise ring-1 ring-nuit/10">{t('chf.aucuneProposee')}</p>
            )}
            <ul className="space-y-3">
              {donnees.proposees.map((c) => (
                <li key={c.id} className="rounded-2xl bg-white p-4 ring-1 ring-nuit/10">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-display font-bold">{c.numero}</span>
                    <span className="font-display text-xl font-extrabold tabular-nums">{monnaie(c.prix_estime, c.devise)}</span>
                  </div>
                  <p className="mt-1 truncate text-sm"><b className="text-volt-700">A</b> {c.depart?.adresse}</p>
                  {c.arrivee && <p className="truncate text-sm"><b className="text-ambre-600">B</b> {c.arrivee.adresse}</p>}
                  <p className="mt-1 text-xs text-ardoise">
                    {t(`cmd.mode.${c.mode}`)}{c.distance_km ? ` — ${distance(c.distance_km)}` : ''}{c.duree_min ? ` — ${formatDuree(c.duree_min)}` : ''}
                    {c.quand ? ` — ${formatDateHeure(c.quand, langue)}` : ''}
                  </p>
                  <div className="mt-3 grid grid-cols-[1fr_2fr] gap-2">
                    <button type="button" onClick={() => refuser(c)} className="btn-secondaire py-3">{t('chf.refuser')}</button>
                    <button type="button" onClick={() => accepter(c)} className="btn-principal py-3">{t('chf.accepter')}</button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ---------- Énergie ---------- */}
        <button type="button" onClick={() => setFenetre('energie')} className="btn-secondaire w-full py-3">⚡ {t('chf.energie')}</button>

        {/* ---------- Courses récentes ---------- */}
        {donnees.recentes.length > 0 && (
          <section>
            <h2 className="mb-2 text-lg font-bold">{t('chf.recentes')}</h2>
            <ul className="divide-y divide-nuit/5 rounded-2xl bg-white ring-1 ring-nuit/10">
              {donnees.recentes.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-bold">{c.numero}</p>
                    <p className="truncate text-ardoise">{formatDateHeure(c.cree_le, langue)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold tabular-nums">{monnaie(c.prix_final ?? c.prix_estime, c.devise)}</p>
                    <PastilleStatut statut={c.statut} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ---------- Pied : compte + version ---------- */}
        <footer className="flex flex-col items-center gap-2 pt-4 text-center">
          <p className="text-sm text-ardoise">{utilisateur?.nom}{utilisateur?.chauffeur?.note_moyenne != null && ` — ★ ${Number(utilisateur.chauffeur.note_moyenne).toFixed(1)}`}</p>
          <div className="flex gap-4">
            <Link to="/profil" className="text-sm font-bold text-nuit-600 underline">{t('nav.profil')}</Link>
            <button type="button" onClick={deconnexion} className="text-sm font-bold text-nuit-600 underline">{t('nav.deconnexion')}</button>
          </div>
          <p className="max-w-xs text-xs text-ardoise">{t('secu.note')}</p>
          <Version />
        </footer>
      </main>

      {/* Fenêtres */}
      <Modale titre={t('suivi.messages')} ouverte={fenetre === 'messages' && Boolean(enCours)} onFermer={() => setFenetre(null)}>
        {enCours && <Messagerie courseId={enCours.id} />}
      </Modale>
      <Modale titre={t('chf.desister')} ouverte={fenetre === 'desister' && Boolean(enCours)} onFermer={() => setFenetre(null)}>
        <form onSubmit={desister} className="space-y-3">
          <p className="text-sm text-ardoise">{t('chf.desisterAide')}</p>
          <label htmlFor="motif-desist" className="block text-sm font-bold">{t('suivi.motif')}</label>
          <input id="motif-desist" value={motif} onChange={(e) => setMotif(e.target.value)} className="champ" maxLength={200} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setFenetre(null)} className="btn-secondaire">{t('commun.retour')}</button>
            <button type="submit" className="rounded-xl bg-red-600 px-5 py-2.5 font-bold text-white">{t('chf.desister')}</button>
          </div>
        </form>
      </Modale>
      <Modale titre={t('chf.energie')} ouverte={fenetre === 'energie'} onFermer={() => setFenetre(null)}>
        <form onSubmit={enregistrerEnergie} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {['recharge', 'carburant'].map((ty) => (
              <button key={ty} type="button" onClick={() => setEnergie((x) => ({ ...x, type: ty }))} aria-pressed={energie.type === ty}
                className={`rounded-xl py-3 text-sm font-bold ring-1 ${energie.type === ty ? 'bg-volt-50 text-volt-700 ring-2 ring-volt-500' : 'ring-nuit/15'}`}>
                {ty === 'recharge' ? `⚡ ${t('chf.recharge')}` : `⛽ ${t('chf.carburant')}`}
              </button>
            ))}
          </div>
          {[['quantite', t('chf.quantite')], ['cout', t('chf.cout')], ['kilometrage', t('chf.kilometrage')]].map(([cle, libelle]) => (
            <div key={cle}>
              <label htmlFor={`en-${cle}`} className="mb-1 block text-sm font-bold">{libelle}</label>
              <input id={`en-${cle}`} type="number" inputMode="decimal" step="any" min="0" required value={energie[cle]} onChange={(e) => setEnergie((x) => ({ ...x, [cle]: e.target.value }))} className="champ" />
            </div>
          ))}
          <div>
            <label htmlFor="en-station" className="mb-1 block text-sm font-bold">{t('chf.station')}</label>
            <input id="en-station" value={energie.station} onChange={(e) => setEnergie((x) => ({ ...x, station: e.target.value }))} className="champ" />
          </div>
          <button type="submit" className="btn-principal w-full py-3">{t('commun.enregistrer')}</button>
        </form>
      </Modale>
    </div>
  )
}
