// ============================================================================
// Badge d'origine de la distance (lot 2) :
//   « par la route »  : distance calculée sur le réseau routier
//   « estimation »    : distance à vol d'oiseau corrigée (pas d'itinéraire)
// source = 'route' | 'estimation' | 'aucune'
// ============================================================================
import { useLangue } from '@/i18n/index.jsx'

export default function BadgeDistance({ source }) {
  const { t } = useLangue()
  if (!source || source === 'aucune') return null
  const route = source === 'route'
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${route ? 'bg-nuit text-volt-400' : 'bg-slate-100 text-slate-700'}`}
      title={route ? t('dist.routeAide') : t('dist.estimationAide')}
    >
      {/* Petite route ou règle selon la source */}
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
        {route ? <path d="M6 21 10 3M18 21 14 3M12 7v2M12 13v2M12 19v1" /> : <path d="M4 20 20 4M7 17l2 2M11 13l2 2M15 9l2 2" />}
      </svg>
      {route ? t('dist.route') : t('dist.estimation')}
    </span>
  )
}
