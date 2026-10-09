// ============================================================================
// Sélecteur de langue (liste déroulante compacte)
// ============================================================================
import { useLangue } from '@/i18n/index.jsx'

export default function SelecteurLangue({ clair = false }) {
  const { langue, changerLangue, langues, t } = useLangue()
  return (
    <label className="inline-flex items-center gap-1 text-sm">
      <span className="sr-only">{t('commun.langue')}</span>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className={clair ? 'text-white/70' : 'text-ardoise'}>
        <circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" />
      </svg>
      <select
        value={langue}
        onChange={(e) => changerLangue(e.target.value)}
        className={`cursor-pointer rounded-lg bg-transparent py-1 pr-1 font-bold outline-none focus-visible:ring-2 focus-visible:ring-volt-400 ${clair ? 'text-white [&>option]:text-nuit' : 'text-nuit'}`}
      >
        {langues.map((l) => <option key={l.code} value={l.code}>{l.code.toUpperCase()} · {l.nom}</option>)}
      </select>
    </label>
  )
}
