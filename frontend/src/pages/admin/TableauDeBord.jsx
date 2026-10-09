// ============================================================================
// Tableau de bord de la direction (GET /admin/tableau-de-bord)
// Indicateurs du jour et du mois + petits graphiques SVG maison.
// Rafraîchi toutes les 60 s.
// ============================================================================
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Jauge from '@/composants/Jauge.jsx'
import { BarreRepartition, BarresHorizontales, Histogramme } from '@/composants/Graphiques.jsx'
import { useToasts } from '@/composants/Toasts.jsx'
import { useConfig } from '@/contexte/Config.jsx'
import api, { messageErreur } from '@/lib/api.js'

// Tuile d'indicateur : grand chiffre + libellé + précision
function Tuile({ libelle, valeur, precision, accent = false }) {
  return (
    <div className={`min-w-0 rounded-3xl p-5 ${accent ? 'bg-nuit text-white' : 'bg-white ring-1 ring-nuit/10'}`}>
      <p className={`text-sm ${accent ? 'text-white/60' : 'text-ardoise'}`}>{libelle}</p>
      <p className={`mt-1 break-words font-display text-2xl font-extrabold tabular-nums 2xl:text-3xl ${accent ? 'text-volt-400' : 'text-nuit'}`}>{valeur}</p>
      {precision && <p className={`mt-1 text-sm ${accent ? 'text-white/60' : 'text-ardoise'}`}>{precision}</p>}
    </div>
  )
}

// Libellé court d'un jour (« lun. 06 »)
const jourCourt = (iso) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString('fr', { weekday: 'short', day: '2-digit' })
}
const NOMS_ENERGIE = { electrique: '⚡ Électrique', hybride: '🔋 Hybride', thermique: '⛽ Thermique' }

export default function TableauDeBord() {
  const { monnaie, distance } = useConfig()
  const toast = useToasts()
  const [tb, setTb] = useState(null)

  // Chargement (premier sous « Patientez… », ensuite en silence)
  const charger = useCallback(async (silencieux) => {
    try {
      const appel = api.get('/admin/tableau-de-bord')
      const { data } = silencieux ? await appel : await toast.attente(appel)
      setTb(data)
    } catch (err) {
      if (!silencieux) toast.erreur(messageErreur(err))
    }
  }, [toast])

  useEffect(() => {
    charger(false)
    const m = setInterval(() => charger(true), 60000)
    return () => clearInterval(m)
  }, [charger])

  if (!tb) return <div className="grid min-h-[50vh] place-items-center"><Jauge taille={56} /></div>

  const v = tb.vehicules || {}
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-3xl font-bold">Tableau de bord</h1>
        {tb.alertes > 0 && <Link to="/admin/alertes" className="rounded-full bg-ambre-500 px-4 py-2 text-sm font-bold text-nuit">{tb.alertes} alerte(s) à traiter</Link>}
      </header>

      {/* Indicateurs */}
      <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        <Tuile accent libelle="Chiffre du jour" valeur={monnaie(tb.chiffre_jour)} precision={`${tb.courses_jour} course(s) aujourd’hui`} />
        <Tuile libelle="Chiffre du mois" valeur={monnaie(tb.chiffre_mois)} precision={`${tb.courses_mois} course(s) ce mois`} />
        <Tuile libelle="Chauffeurs en ligne" valeur={tb.chauffeurs_en_ligne} precision={tb.note_moyenne ? `Note moyenne ★ ${Number(tb.note_moyenne).toFixed(2)}` : undefined} />
        <Tuile libelle="Énergie du mois" valeur={monnaie(tb.energie_mois?.cout)} precision={`${Math.round(tb.energie_mois?.kwh || 0)} kWh — ${Math.round(tb.energie_mois?.litres || 0)} L — maintenance ${monnaie(tb.maintenance_mois)}`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        {/* Courses des 7 derniers jours */}
        <section className="surface">
          <h2 className="text-lg font-bold">Courses sur 7 jours</h2>
          <p className="mb-3 text-sm text-ardoise">Survolez une barre pour le chiffre du jour.</p>
          <Histogramme
            donnees={(tb.courses_7j || []).map((j) => ({ libelle: jourCourt(j.jour), valeur: j.courses, info: monnaie(j.chiffre) }))}
            formatValeur={(n) => `${n} course(s)`}
          />
        </section>

        {/* État du parc */}
        <section className="surface">
          <h2 className="text-lg font-bold">Parc : {v.total || 0} véhicule(s)</h2>
          <div className="mt-4">
            <BarreRepartition segments={[
              { libelle: 'Disponibles', valeur: v.disponibles || 0, couleur: '#14C97E' },
              { libelle: 'En service', valeur: v.en_service || 0, couleur: '#1E4378' },
              { libelle: 'Maintenance', valeur: v.maintenance || 0, couleur: '#F5A524' },
              { libelle: 'Autres', valeur: Math.max(0, (v.total || 0) - (v.disponibles || 0) - (v.en_service || 0) - (v.maintenance || 0)), couleur: '#CBD5E1' },
            ]} />
          </div>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Chiffre par catégorie */}
        <section className="surface">
          <h2 className="mb-4 text-lg font-bold">Chiffre par catégorie (mois)</h2>
          <BarresHorizontales
            donnees={(tb.par_categorie || []).map((c) => ({ libelle: `${c.categorie} (${c.courses})`, valeur: c.chiffre }))}
            formatValeur={(n) => monnaie(n)}
          />
        </section>
        {/* Kilomètres et coût d'énergie par énergie */}
        <section className="surface">
          <h2 className="mb-4 text-lg font-bold">Kilomètres par énergie (mois)</h2>
          <BarresHorizontales
            couleur="#14C97E"
            donnees={(tb.par_energie || []).map((e) => ({ libelle: NOMS_ENERGIE[e.energie] || e.energie, valeur: e.km, info: `Coût énergie : ${monnaie(e.cout_energie)}` }))}
            formatValeur={(n) => distance(n)}
          />
          {/* Coût au km, la donnée qui compare vraiment les énergies */}
          <ul className="mt-4 space-y-1 border-t border-nuit/10 pt-3 text-sm">
            {(tb.par_energie || []).filter((e) => e.km > 0).map((e) => (
              <li key={e.energie} className="flex justify-between"><span className="text-ardoise">Coût énergie au km, {NOMS_ENERGIE[e.energie] || e.energie}</span><b className="tabular-nums">{monnaie(e.cout_energie / e.km)}</b></li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
