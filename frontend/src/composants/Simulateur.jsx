// ============================================================================
// Simulateur de prix instantané (page d'accueil)
// Le visiteur choisit départ, arrivée et catégorie : l'estimation est demandée
// automatiquement au serveur (POST /public/estimation) dès que tout est rempli,
// puis il peut passer à la commande avec le trajet pré-rempli.
// ============================================================================
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api, { messageErreur } from '@/lib/api.js'
import { adresseDuPoint, maPosition } from '@/lib/geo.js'
import { formatDuree } from '@/lib/format.js'
import { useConfig } from '@/contexte/Config.jsx'
import { useLangue } from '@/i18n/index.jsx'
import { useToasts } from './Toasts.jsx'
import RechercheAdresse from './RechercheAdresse.jsx'
import BadgeEnergie from './BadgeEnergie.jsx'
import Co2 from './Co2.jsx'

export default function Simulateur() {
  const { categories, monnaie, distance } = useConfig()
  const { t, langue } = useLangue()
  const toast = useToasts()
  const naviguer = useNavigate()
  const [depart, setDepart] = useState(null)
  const [arrivee, setArrivee] = useState(null)
  const [categorie, setCategorie] = useState('')
  const [estimation, setEstimation] = useState(null)

  // Catégorie par défaut : la première de la liste
  const code = categorie || categories[0]?.code || ''
  const cat = categories.find((c) => c.code === code)

  // Estimation automatique quand départ + arrivée + catégorie sont connus
  useEffect(() => {
    if (!depart || !arrivee || !code) { setEstimation(null); return }
    let actif = true
    const corps = { depart: { lat: depart.lat, lng: depart.lng }, arrivee: { lat: arrivee.lat, lng: arrivee.lng }, categorie: code, mode: 'course' }
    toast.attente(api.post('/public/estimation', corps))
      .then(({ data }) => actif && setEstimation(data))
      .catch((err) => { if (actif) { setEstimation(null); toast.erreur(messageErreur(err, t('cmd.indisponible'))) } })
    return () => { actif = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depart?.lat, depart?.lng, arrivee?.lat, arrivee?.lng, code])

  // Bouton « Ma position » : remplit le départ
  const prendrePosition = async () => {
    try {
      const p = await toast.attente(maPosition())
      setDepart({ ...p, adresse: await adresseDuPoint(p.lat, p.lng, langue) })
    } catch (err) {
      toast.erreur(err.message)
    }
  }

  // Passage à la commande avec le trajet déjà rempli
  const commander = () => naviguer('/commander', { state: { depart, arrivee, categorie: code } })

  return (
    <div className="rounded-[28px] bg-white p-5 text-nuit shadow-2xl shadow-black/30 sm:p-6">
      <h2 className="font-display text-xl font-bold">{t('simu.titre')}</h2>
      <div className="mt-4 space-y-2">
        <RechercheAdresse valeur={depart} onChoix={setDepart} placeholder={t('cmd.departPh')} lettre="A" pastille="bg-volt-400" />
        <RechercheAdresse valeur={arrivee} onChoix={setArrivee} placeholder={t('cmd.arriveePh')} lettre="B" pastille="bg-ambre-500" />
        <button type="button" onClick={prendrePosition} className="text-sm font-bold text-volt-700 hover:underline">
          ◎ {t('cmd.maPosition')}
        </button>
      </div>

      {/* Choix de la catégorie : pastilles */}
      {categories.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label={t('simu.categorie')}>
          {categories.map((c) => (
            <button
              key={c.code}
              type="button"
              role="radio"
              aria-checked={c.code === code}
              onClick={() => setCategorie(c.code)}
              className={`rounded-full px-3 py-1.5 text-sm font-bold transition ${c.code === code ? 'bg-nuit text-white' : 'bg-brume text-nuit hover:bg-volt-50'}`}
            >
              {c.nom}
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-ardoise">{t('commun.chargement')}</p>
      )}
      {cat && <div className="mt-2 flex flex-wrap gap-1">{(cat.energies || []).map((e) => <BadgeEnergie key={e} energie={e} />)}</div>}

      {/* Résultat */}
      <div className="mt-5 rounded-2xl bg-brume p-4" aria-live="polite">
        {estimation ? (
          <>
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs text-ardoise">{t('simu.prix')}</p>
                <p className="font-display text-3xl font-extrabold tabular-nums">{monnaie(estimation.prix, estimation.devise)}</p>
                {estimation.prix_sans_promo > estimation.prix && (
                  <p className="text-sm text-ardoise line-through">{t('simu.sansPromo', { prix: monnaie(estimation.prix_sans_promo, estimation.devise) })}</p>
                )}
              </div>
              <div className="text-right text-sm text-ardoise tabular-nums">
                <p>{distance(estimation.distance_km)}</p>
                <p>{formatDuree(estimation.duree_min)}</p>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {estimation.majoration_nuit && <span className="rounded-full bg-nuit px-2.5 py-1 text-xs font-bold text-ambre-500">☾ {t('simu.nuit')}</span>}
              {cat?.energies?.includes('electrique') && <Co2 km={estimation.distance_km} />}
            </div>
          </>
        ) : (
          <p className="text-sm text-ardoise">{t('simu.astuce')}</p>
        )}
      </div>
      <button type="button" onClick={commander} className="btn-principal mt-4 w-full py-3 text-base">
        {estimation ? t('simu.commander') : t('accueil.cta')}
      </button>
    </div>
  )
}
