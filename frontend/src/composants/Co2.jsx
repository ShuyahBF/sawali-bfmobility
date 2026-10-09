// ============================================================================
// Badge « CO₂ évité » : estimation pour une course en véhicule électrique
// (≈ 0,12 kg par km par rapport au même trajet en thermique).
// ============================================================================
import { co2Evite } from '@/lib/format.js'
import { useLangue } from '@/i18n/index.jsx'

export default function Co2({ km, className = '' }) {
  const { t, langue } = useLangue()
  const kg = co2Evite(km)
  if (!kg) return null
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full bg-volt-50 px-3 py-1 text-xs font-bold text-volt-700 ring-1 ring-volt-100 ${className}`} title="≈ 0,12 kg/km">
      {/* Petite feuille */}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20 4C9 4 4 10 4 17c0 1 .1 2 .3 3 1.2-4.6 4.6-8.3 9.7-10-4 2.3-6.8 5.8-7.6 10.4C17 20 20 13 20 4z" /></svg>
      {t('cmd.co2', { kg: kg.toLocaleString(langue, { maximumFractionDigits: 1 }) })}
    </span>
  )
}
