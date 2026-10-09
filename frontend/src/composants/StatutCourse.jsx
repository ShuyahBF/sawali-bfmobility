// ============================================================================
// Statut d'une course : pastille colorée + frise chronologique des étapes
// ============================================================================
import { useLangue } from '@/i18n/index.jsx'
import { formatHeure } from '@/lib/format.js'

// Ordre normal des étapes d'une course
export const ETAPES = ['recherche', 'acceptee', 'en_approche', 'arrivee', 'en_cours', 'terminee']

// Couleurs de la pastille selon le statut
const COULEURS = {
  planifiee: 'bg-sky-100 text-sky-800',
  recherche: 'bg-ambre-100 text-ambre-600',
  acceptee: 'bg-volt-100 text-volt-700',
  en_approche: 'bg-volt-100 text-volt-700',
  arrivee: 'bg-volt-400 text-nuit',
  en_cours: 'bg-nuit text-volt-400',
  terminee: 'bg-slate-200 text-slate-700',
  annulee: 'bg-red-100 text-red-700',
}

// Pastille de statut
export function PastilleStatut({ statut }) {
  const { t } = useLangue()
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${COULEURS[statut] || 'bg-slate-100 text-slate-700'}`}>
      {/* Point animé pour les statuts « vivants » */}
      {['recherche', 'en_approche', 'en_cours'].includes(statut) && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" aria-hidden="true" />}
      {t(`statut.${statut}`)}
    </span>
  )
}

// Frise des étapes avec l'heure de passage (tirée de course.historique)
export function FriseStatuts({ course }) {
  const { t, langue } = useLangue()
  const historique = course?.historique || []
  // Heure de passage d'une étape (la dernière occurrence)
  const heureDe = (s) => {
    const h = [...historique].reverse().find((x) => x.statut === s)
    return h ? formatHeure(h.le, langue) : ''
  }
  if (course?.statut === 'annulee') {
    return <p className="rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700">{t('statut.annulee')} {heureDe('annulee')}</p>
  }
  const rangActuel = ETAPES.indexOf(course?.statut)
  return (
    <ol className="relative space-y-0">
      {ETAPES.map((s, i) => {
        const fait = rangActuel >= i
        const actuel = rangActuel === i
        return (
          <li key={s} className="relative flex gap-3 pb-4 last:pb-0">
            {/* Trait vertical qui relie les étapes */}
            {i < ETAPES.length - 1 && (
              <span className={`absolute left-[9px] top-5 h-full w-0.5 ${rangActuel > i ? 'bg-volt-500' : 'bg-slate-200'}`} aria-hidden="true" />
            )}
            <span className={`relative z-10 mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ring-4 ring-white ${fait ? 'bg-volt-500' : 'bg-slate-200'}`}>
              {actuel && <span className="absolute inset-0 animate-ping rounded-full bg-volt-400/60 motion-reduce:hidden" />}
            </span>
            <div className="flex flex-1 items-baseline justify-between gap-2">
              <span className={`text-sm ${actuel ? 'font-bold text-nuit' : fait ? 'text-nuit' : 'text-ardoise/70'}`}>{t(`statut.${s}`)}</span>
              <span className="text-xs tabular-nums text-ardoise">{heureDe(s)}</span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
