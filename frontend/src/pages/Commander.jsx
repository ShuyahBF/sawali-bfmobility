// ============================================================================
// Commande d'une course en 3 étapes
//   1. Trajet       : mode (course / à l'heure / à la journée), quand, départ, arrivée
//   2. Véhicule     : estimation de chaque catégorie, choix
//   3. Confirmation : paiement, mot pour le chauffeur, validation (POST /courses)
// Si le visiteur n'est pas connecté, la commande est gardée dans le navigateur
// le temps de la connexion, puis reprise automatiquement.
// ============================================================================
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import PageSite from '@/composants/MiseEnPage.jsx'
import Carte from '@/composants/Carte.jsx'
import RechercheAdresse from '@/composants/RechercheAdresse.jsx'
import BadgeEnergie from '@/composants/BadgeEnergie.jsx'
import Co2 from '@/composants/Co2.jsx'
import Jauge from '@/composants/Jauge.jsx'
import { useToasts } from '@/composants/Toasts.jsx'
import { useAuth } from '@/contexte/Auth.jsx'
import { useConfig } from '@/contexte/Config.jsx'
import { useLangue } from '@/i18n/index.jsx'
import api, { messageErreur } from '@/lib/api.js'
import { adresseDuPoint, maPosition } from '@/lib/geo.js'
import { formatDuree } from '@/lib/format.js'

// Clé du brouillon de commande (gardé pendant la connexion)
const CLE_BROUILLON = 'bfm_brouillon_commande'

// Lecture du brouillon éventuel (puis effacement)
function lireBrouillon() {
  try {
    const b = sessionStorage.getItem(CLE_BROUILLON)
    if (!b) return null
    sessionStorage.removeItem(CLE_BROUILLON)
    return JSON.parse(b)
  } catch { return null }
}

// Date/heure locale au format attendu par <input type="datetime-local"> (dans 1 h par défaut)
function dansUneHeure() {
  const d = new Date(Date.now() + 60 * 60 * 1000)
  d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0)
  const z = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`
}

// Indicateur d'étapes 1 — 2 — 3
function Etapes({ etape, setEtape }) {
  const { t } = useLangue()
  const noms = [t('cmd.etape1'), t('cmd.etape2'), t('cmd.etape3')]
  return (
    <ol className="flex items-center gap-2 text-sm">
      {noms.map((nom, i) => {
        const n = i + 1
        const fait = n < etape
        return (
          <li key={nom} className="flex flex-1 items-center gap-2">
            <button
              type="button"
              disabled={!fait}
              onClick={() => fait && setEtape(n)}
              className={`grid h-8 w-8 shrink-0 place-items-center rounded-full font-display font-extrabold ${n === etape ? 'bg-nuit text-volt-400' : fait ? 'bg-volt-500 text-nuit' : 'bg-white text-ardoise ring-1 ring-nuit/15'}`}
              aria-current={n === etape ? 'step' : undefined}
            >
              {fait ? '✓' : n}
            </button>
            <span className={`hidden font-bold sm:inline ${n === etape ? 'text-nuit' : 'text-ardoise'}`}>{nom}</span>
            {n < 3 && <span className={`h-0.5 flex-1 rounded ${fait ? 'bg-volt-500' : 'bg-nuit/10'}`} aria-hidden="true" />}
          </li>
        )
      })}
    </ol>
  )
}

export default function Commander() {
  const { t, langue } = useLangue()
  const { categories, monnaie, distance } = useConfig()
  const { utilisateur } = useAuth()
  const toast = useToasts()
  const naviguer = useNavigate()
  const lieu = useLocation()

  // État initial : brouillon après connexion, sinon trajet venu du simulateur
  const [initial] = useState(() => lireBrouillon() || lieu.state || {})
  const [etape, setEtape] = useState(initial.etape || 1)
  const [mode, setMode] = useState(initial.mode || 'course')
  const [plusTard, setPlusTard] = useState(Boolean(initial.plusTard))
  const [quand, setQuand] = useState(initial.quand || dansUneHeure())
  const [duree, setDuree] = useState(initial.duree || (initial.mode === 'jour' ? 1 : 2))
  const [depart, setDepart] = useState(initial.depart || null)
  const [arrivee, setArrivee] = useState(initial.arrivee || null)
  const [pointActif, setPointActif] = useState(initial.depart ? 'arrivee' : 'depart')
  const [categorie, setCategorie] = useState(initial.categorie || '')
  const [paiement, setPaiement] = useState(initial.paiement || 'especes')
  const [note, setNote] = useState(initial.note || '')
  // Estimations par catégorie : { code: estimation | {erreur} }
  const [estimations, setEstimations] = useState({})
  const [estimationEnCours, setEstimationEnCours] = useState(false)
  const [envoi, setEnvoi] = useState(false)

  const arriveeObligatoire = mode === 'course'
  // Durée envoyée au serveur, toujours en heures (1 jour = 24 h)
  const dureeHeures = mode === 'heure' ? Number(duree) : mode === 'jour' ? Number(duree) * 24 : undefined

  // Clic sur la carte : place le point actif puis cherche son adresse
  const surClicCarte = async (p) => {
    const cible = pointActif
    const provisoire = { ...p, adresse: `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}` }
    if (cible === 'depart') { setDepart(provisoire); setPointActif('arrivee') } else setArrivee(provisoire)
    const adresse = await adresseDuPoint(p.lat, p.lng, langue)
    if (cible === 'depart') setDepart((d) => (d && d.lat === p.lat ? { ...d, adresse } : d))
    else setArrivee((a) => (a && a.lat === p.lat ? { ...a, adresse } : a))
  }

  // « Ma position » → départ
  const prendrePosition = async () => {
    try {
      const p = await toast.attente(maPosition())
      setDepart({ ...p, adresse: await adresseDuPoint(p.lat, p.lng, langue) })
      setPointActif('arrivee')
    } catch (err) {
      toast.erreur(err.message)
    }
  }

  // Corps commun d'une estimation
  const corpsEstimation = (code) => ({
    depart: { lat: depart.lat, lng: depart.lng },
    arrivee: arrivee ? { lat: arrivee.lat, lng: arrivee.lng } : null,
    categorie: code,
    mode,
    duree_heures: dureeHeures,
    quand: plusTard ? new Date(quand).toISOString() : undefined,
  })

  // Étape 1 → 2 : estimation de toutes les catégories en parallèle
  const versEtape2 = async () => {
    if (!depart) { toast.erreur(t('cmd.manqueDepart')); return }
    if (arriveeObligatoire && !arrivee) { toast.erreur(t('cmd.manqueArrivee')); return }
    setEtape(2)
    setEstimationEnCours(true)
    const resultats = await toast.attente(Promise.allSettled(
      categories.map((c) => api.post('/public/estimation', corpsEstimation(c.code)).then((r) => [c.code, r.data])),
    ))
    const table = {}
    resultats.forEach((r, i) => {
      if (r.status === 'fulfilled') table[r.value[0]] = r.value[1]
      else table[categories[i].code] = { erreur: messageErreur(r.reason, t('cmd.indisponible')) }
    })
    setEstimations(table)
    setEstimationEnCours(false)
    // Catégorie présélectionnée si elle a une estimation, sinon la première disponible
    if (!table[categorie] || table[categorie].erreur) {
      const premiere = categories.find((c) => table[c.code] && !table[c.code].erreur)
      setCategorie(premiere?.code || '')
    }
  }

  const estimation = estimations[categorie]
  const cat = useMemo(() => categories.find((c) => c.code === categorie), [categories, categorie])

  // Étape 3 : confirmation (ou passage par la connexion)
  const confirmer = async () => {
    if (!utilisateur) {
      // On garde tout le parcours, on revient ici après la connexion
      try {
        sessionStorage.setItem(CLE_BROUILLON, JSON.stringify({ etape: 3, mode, plusTard, quand, duree, depart, arrivee, categorie, paiement, note }))
      } catch { /* stockage bloqué : le client ressaisira */ }
      toast.info(t('cmd.connexionRequise'))
      naviguer('/connexion?suite=/commander')
      return
    }
    setEnvoi(true)
    try {
      const corps = {
        mode,
        categorie,
        depart: { lat: depart.lat, lng: depart.lng, adresse: depart.adresse },
        arrivee: arrivee ? { lat: arrivee.lat, lng: arrivee.lng, adresse: arrivee.adresse } : null,
        paiement,
      }
      if (plusTard) corps.quand = new Date(quand).toISOString()
      if (dureeHeures) corps.duree_heures = dureeHeures
      if (note.trim()) corps.note_client = note.trim()
      const { data } = await toast.attente(api.post('/courses', corps))
      toast.succes(t('cmd.creee'))
      naviguer(`/courses/${data.id}`, { replace: true })
    } catch (err) {
      toast.erreur(messageErreur(err))
      setEnvoi(false)
    }
  }

  // Si l'estimation est revenue d'un brouillon (étape 3 sans estimation), on la recalcule
  useEffect(() => {
    if (etape > 1 && !Object.keys(estimations).length && depart && categories.length) versEtape2().then(() => setEtape(initial.etape || 2))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories.length])

  return (
    <PageSite sansPied>
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[1fr_1.1fr] lg:py-10">
        {/* ---------- Colonne gauche : étapes ---------- */}
        <div className="order-2 lg:order-1">
          <h1 className="text-3xl font-bold">{t('cmd.titre')}</h1>
          <div className="mt-4"><Etapes etape={etape} setEtape={setEtape} /></div>

          {/* ===== Étape 1 : trajet ===== */}
          {etape === 1 && (
            <div className="mt-6 space-y-5">
              {/* Mode */}
              <div className="grid grid-cols-3 gap-1 rounded-2xl bg-white p-1 ring-1 ring-nuit/10" role="radiogroup">
                {['course', 'heure', 'jour'].map((m) => (
                  <button key={m} type="button" role="radio" aria-checked={mode === m}
                    onClick={() => { setMode(m); setDuree(m === 'jour' ? 1 : 2) }}
                    className={`rounded-xl py-2.5 text-sm font-bold transition ${mode === m ? 'bg-nuit text-white' : 'text-nuit hover:bg-brume'}`}>
                    {t(`cmd.mode.${m}`)}
                  </button>
                ))}
              </div>

              {/* Adresses */}
              <div className="space-y-2">
                <div onFocus={() => setPointActif('depart')}>
                  <RechercheAdresse valeur={depart} onChoix={(p) => { setDepart(p); setPointActif('arrivee') }} placeholder={t('cmd.departPh')} lettre="A" pastille="bg-volt-400" />
                </div>
                <div onFocus={() => setPointActif('arrivee')}>
                  <RechercheAdresse valeur={arrivee} onChoix={setArrivee} placeholder={arriveeObligatoire ? t('cmd.arriveePh') : t('cmd.arriveeOpt')} lettre="B" pastille="bg-ambre-500" />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <button type="button" onClick={prendrePosition} className="font-bold text-volt-700 hover:underline">◎ {t('cmd.maPosition')}</button>
                  <span className="text-ardoise">{t('cmd.toucherCarte', { point: pointActif === 'depart' ? 'A' : 'B' })}</span>
                </div>
              </div>

              {/* Durée (location à l'heure / à la journée) */}
              {mode !== 'course' && (
                <div>
                  <label htmlFor="duree" className="mb-1 block text-sm font-bold">{t('cmd.duree')}</label>
                  <select id="duree" value={duree} onChange={(e) => setDuree(Number(e.target.value))} className="champ">
                    {(mode === 'heure' ? [1, 2, 3, 4, 5, 6, 8, 10, 12] : [1, 2, 3, 4, 5, 6, 7]).map((n) => (
                      <option key={n} value={n}>{mode === 'heure' ? t('cmd.heures', { n }) : t('cmd.jours', { n })}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Quand */}
              <fieldset>
                <legend className="mb-1 text-sm font-bold">{t('cmd.quand')}</legend>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setPlusTard(false)} className={`flex-1 rounded-xl py-2.5 text-sm font-bold ring-1 ${!plusTard ? 'bg-volt-50 text-volt-700 ring-volt-500' : 'bg-white ring-nuit/15'}`}>{t('cmd.maintenant')}</button>
                  <button type="button" onClick={() => setPlusTard(true)} className={`flex-1 rounded-xl py-2.5 text-sm font-bold ring-1 ${plusTard ? 'bg-volt-50 text-volt-700 ring-volt-500' : 'bg-white ring-nuit/15'}`}>{t('cmd.plusTard')}</button>
                </div>
                {plusTard && (
                  <input type="datetime-local" value={quand} min={dansUneHeure().slice(0, 10) + 'T00:00'} onChange={(e) => setQuand(e.target.value)} className="champ mt-2" aria-label={t('cmd.dateHeure')} />
                )}
              </fieldset>

              <button type="button" onClick={versEtape2} className="btn-principal w-full py-3 text-base">{t('cmd.suivant')}</button>
            </div>
          )}

          {/* ===== Étape 2 : choix du véhicule ===== */}
          {etape === 2 && (
            <div className="mt-6">
              <h2 className="text-xl font-bold">{t('cmd.choisir')}</h2>
              {estimationEnCours && <div className="mt-6 flex justify-center"><Jauge taille={48} /></div>}
              <ul className="mt-4 space-y-3" role="radiogroup">
                {!estimationEnCours && categories.map((c) => {
                  const e = estimations[c.code]
                  const choisi = c.code === categorie
                  const indispo = !e || e.erreur
                  return (
                    <li key={c.code}>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={choisi}
                        disabled={indispo}
                        onClick={() => setCategorie(c.code)}
                        className={`flex w-full items-center gap-4 rounded-2xl bg-white p-4 text-left ring-1 transition disabled:opacity-50 ${choisi ? 'ring-2 ring-volt-500' : 'ring-nuit/10 hover:ring-nuit/30'}`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-display text-lg font-bold">{c.nom}</span>
                            {(c.energies || []).map((en) => <BadgeEnergie key={en} energie={en} />)}
                            {c.promo_active && <span className="rounded-full bg-ambre-500 px-2 py-0.5 text-xs font-bold text-nuit">−{c.promo?.pourcentage} %</span>}
                          </div>
                          <p className="mt-0.5 text-sm text-ardoise">
                            {t('accueil.places', { n: c.places })}
                            {e && !e.erreur && ` · ${distance(e.distance_km)} · ${formatDuree(e.duree_min)}`}
                          </p>
                          {e?.erreur && <p className="text-sm text-red-600">{e.erreur}</p>}
                        </div>
                        {e && !e.erreur && (
                          <div className="text-right">
                            <p className="font-display text-xl font-extrabold tabular-nums">{monnaie(e.prix, e.devise)}</p>
                            {e.prix_sans_promo > e.prix && <p className="text-xs text-ardoise line-through">{monnaie(e.prix_sans_promo, e.devise)}</p>}
                          </div>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
              <div className="mt-5 flex gap-2">
                <button type="button" onClick={() => setEtape(1)} className="btn-secondaire">{t('cmd.precedent')}</button>
                <button type="button" disabled={!estimation || estimation.erreur} onClick={() => setEtape(3)} className="btn-principal flex-1 py-3">{t('cmd.suivant')}</button>
              </div>
            </div>
          )}

          {/* ===== Étape 3 : confirmation ===== */}
          {etape === 3 && estimation && !estimation.erreur && (
            <div className="mt-6 space-y-5">
              {/* Récapitulatif du prix */}
              <div className="rounded-3xl bg-nuit p-5 text-white">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-white/60">{cat?.nom} · {t(`cmd.mode.${mode}`)}</p>
                    <p className="mt-1 font-display text-4xl font-extrabold tabular-nums text-volt-400">{monnaie(estimation.prix, estimation.devise)}</p>
                    <p className="text-sm text-white/60">{t('cmd.total')}</p>
                  </div>
                  <div className="text-right text-sm text-white/70 tabular-nums">
                    <p>{distance(estimation.distance_km)}</p>
                    <p>{formatDuree(estimation.duree_min)}</p>
                  </div>
                </div>
                {/* Détail du prix ligne par ligne */}
                {estimation.detail?.length > 0 && (
                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer text-white/70">{t('cmd.detail')}</summary>
                    <dl className="mt-2 space-y-1">
                      {estimation.detail.map((d) => (
                        <div key={d.libelle} className="flex justify-between gap-2"><dt className="text-white/70">{d.libelle}</dt><dd className="tabular-nums">{monnaie(d.montant, estimation.devise)}</dd></div>
                      ))}
                    </dl>
                  </details>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {estimation.majoration_nuit && <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-bold text-ambre-500">☾ {t('simu.nuit')}</span>}
                  {cat?.energies?.includes('electrique') && <Co2 km={estimation.distance_km} />}
                </div>
              </div>

              {/* Moyen de paiement */}
              <fieldset>
                <legend className="mb-2 text-sm font-bold">{t('cmd.paiement')}</legend>
                <div className="grid grid-cols-3 gap-2">
                  {['especes', 'mobile_money', 'carte'].map((p) => (
                    <button key={p} type="button" onClick={() => setPaiement(p)} aria-pressed={paiement === p}
                      className={`rounded-xl px-2 py-3 text-sm font-bold ring-1 ${paiement === p ? 'bg-volt-50 text-volt-700 ring-2 ring-volt-500' : 'bg-white ring-nuit/15'}`}>
                      {t(`cmd.${p}`)}
                    </button>
                  ))}
                </div>
              </fieldset>

              {/* Mot pour le chauffeur */}
              <div>
                <label htmlFor="note" className="mb-1 block text-sm font-bold">{t('cmd.note')}</label>
                <textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={300} placeholder={t('cmd.notePh')} className="champ" />
              </div>

              {!utilisateur && <p className="rounded-xl bg-ambre-50 p-3 text-sm text-nuit">{t('cmd.connexionRequise')}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={() => setEtape(2)} className="btn-secondaire">{t('cmd.precedent')}</button>
                <button type="button" disabled={envoi} onClick={confirmer} className="btn-principal flex-1 py-3 text-base">
                  {utilisateur ? (plusTard ? t('cmd.confirmerResa') : t('cmd.confirmer')) : t('nav.connexion')}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ---------- Colonne droite : carte ---------- */}
        <div className="order-1 lg:order-2">
          <div className="lg:sticky lg:top-20">
            <Carte depart={depart} arrivee={arrivee} onClic={etape === 1 ? surClicCarte : undefined} hauteur="h-64 sm:h-80 lg:h-[560px]" />
            {(depart || arrivee) && (
              <div className="mt-3 space-y-1 text-sm">
                {depart && <p className="truncate"><b className="text-volt-700">A</b> {depart.adresse}</p>}
                {arrivee && <p className="truncate"><b className="text-ambre-600">B</b> {arrivee.adresse}</p>}
              </div>
            )}
          </div>
        </div>
      </div>
    </PageSite>
  )
}
