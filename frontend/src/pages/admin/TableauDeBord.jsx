// ============================================================================
// Tableau de bord de la direction (GET /admin/tableau-de-bord)
// Indicateurs du jour et du mois + petits graphiques SVG maison.
// Rafraîchi toutes les 60 s. Textes traduits (clés adm.tb.*).
// ============================================================================
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Jauge from '@/composants/Jauge.jsx'
import { BarreRepartition, BarresHorizontales, Histogramme } from '@/composants/Graphiques.jsx'
import { useToasts } from '@/composants/Toasts.jsx'
import { useConfig } from '@/contexte/Config.jsx'
import { useLangue } from '@/i18n/index.jsx'
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

// Icônes devant le nom des énergies
const ICONES_ENERGIE = { electrique: '⚡', hybride: '🔋', thermique: '⛽' }

export default function TableauDeBord() {
  const { monnaie, distance } = useConfig()
  const { t, langue } = useLangue()
  const toast = useToasts()
  const [tb, setTb] = useState(null)

  // Libellé court d'un jour dans la langue choisie (« lun. 06 »)
  const jourCourt = (iso) => {
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString(langue, { weekday: 'short', day: '2-digit' })
  }
  // Nom d'une énergie avec son icône
  const nomEnergie = (e) => (ICONES_ENERGIE[e] ? `${ICONES_ENERGIE[e]} ${t(`energie.${e}`)}` : e)

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
        <h1 className="text-3xl font-bold">{t('adm.menu.tableauDeBord')}</h1>
        {tb.alertes > 0 && <Link to="/admin/alertes" className="rounded-full bg-ambre-500 px-4 py-2 text-sm font-bold text-nuit">{t('adm.tb.alertes', { n: tb.alertes })}</Link>}
      </header>

      {/* Indicateurs */}
      <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        <Tuile accent libelle={t('adm.tb.chiffreJour')} valeur={monnaie(tb.chiffre_jour)} precision={t('adm.tb.coursesJour', { n: tb.courses_jour })} />
        <Tuile libelle={t('adm.tb.chiffreMois')} valeur={monnaie(tb.chiffre_mois)} precision={t('adm.tb.coursesMois', { n: tb.courses_mois })} />
        <Tuile libelle={t('adm.tb.chauffeursEnLigne')} valeur={tb.chauffeurs_en_ligne} precision={tb.note_moyenne ? t('adm.tb.noteMoyenne', { note: Number(tb.note_moyenne).toFixed(2) }) : undefined} />
        <Tuile
          libelle={t('adm.tb.energieMois')}
          valeur={monnaie(tb.energie_mois?.cout)}
          precision={t('adm.tb.energieDetail', { kwh: Math.round(tb.energie_mois?.kwh || 0), litres: Math.round(tb.energie_mois?.litres || 0), maintenance: monnaie(tb.maintenance_mois) })}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        {/* Courses des 7 derniers jours */}
        <section className="surface">
          <h2 className="text-lg font-bold">{t('adm.tb.courses7j')}</h2>
          <p className="mb-3 text-sm text-ardoise">{t('adm.tb.survol')}</p>
          <Histogramme
            donnees={(tb.courses_7j || []).map((j) => ({ libelle: jourCourt(j.jour), valeur: j.courses, info: monnaie(j.chiffre) }))}
            formatValeur={(n) => t('adm.tb.nCourses', { n })}
          />
        </section>

        {/* État du parc */}
        <section className="surface">
          <h2 className="text-lg font-bold">{t('adm.tb.parc', { n: v.total || 0 })}</h2>
          <div className="mt-4">
            <BarreRepartition segments={[
              { libelle: t('adm.tb.disponibles'), valeur: v.disponibles || 0, couleur: '#14C97E' },
              { libelle: t('adm.tb.enService'), valeur: v.en_service || 0, couleur: '#1E4378' },
              { libelle: t('adm.tb.maintenance'), valeur: v.maintenance || 0, couleur: '#F5A524' },
              { libelle: t('adm.tb.autres'), valeur: Math.max(0, (v.total || 0) - (v.disponibles || 0) - (v.en_service || 0) - (v.maintenance || 0)), couleur: '#CBD5E1' },
            ]} />
          </div>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Chiffre par catégorie */}
        <section className="surface">
          <h2 className="mb-4 text-lg font-bold">{t('adm.tb.parCategorie')}</h2>
          <BarresHorizontales
            donnees={(tb.par_categorie || []).map((c) => ({ libelle: `${c.categorie} (${c.courses})`, valeur: c.chiffre }))}
            formatValeur={(n) => monnaie(n)}
          />
        </section>
        {/* Kilomètres et coût d'énergie par énergie */}
        <section className="surface">
          <h2 className="mb-4 text-lg font-bold">{t('adm.tb.parEnergie')}</h2>
          <BarresHorizontales
            couleur="#14C97E"
            donnees={(tb.par_energie || []).map((e) => ({ libelle: nomEnergie(e.energie), valeur: e.km, info: t('adm.tb.coutEnergie', { cout: monnaie(e.cout_energie) }) }))}
            formatValeur={(n) => distance(n)}
          />
          {/* Coût au km, la donnée qui compare vraiment les énergies */}
          <ul className="mt-4 space-y-1 border-t border-nuit/10 pt-3 text-sm">
            {(tb.par_energie || []).filter((e) => e.km > 0).map((e) => (
              <li key={e.energie} className="flex justify-between"><span className="text-ardoise">{t('adm.tb.coutKm', { energie: nomEnergie(e.energie) })}</span><b className="tabular-nums">{monnaie(e.cout_energie / e.km)}</b></li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
