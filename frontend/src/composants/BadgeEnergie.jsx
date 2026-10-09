// ============================================================================
// Badge d'énergie d'un véhicule : ⚡ électrique, 🔋 hybride, ⛽ thermique
// ============================================================================
import { useLangue } from '@/i18n/index.jsx'

const STYLES = {
  electrique: { icone: '⚡', classe: 'bg-volt-50 text-volt-700 ring-volt-100' },
  hybride: { icone: '🔋', classe: 'bg-sky-50 text-sky-800 ring-sky-100' },
  thermique: { icone: '⛽', classe: 'bg-ambre-50 text-ambre-600 ring-ambre-100' },
}

export default function BadgeEnergie({ energie }) {
  const { t } = useLangue()
  const s = STYLES[energie] || { icone: '•', classe: 'bg-slate-100 text-slate-700 ring-slate-200' }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ring-1 ${s.classe}`}>
      <span aria-hidden="true">{s.icone}</span>
      {STYLES[energie] ? t(`energie.${energie}`) : energie}
    </span>
  )
}
