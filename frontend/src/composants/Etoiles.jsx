// ============================================================================
// Notation par étoiles (1 à 5). En lecture seule si onChange est absent.
// ============================================================================
export default function Etoiles({ valeur = 0, onChange, taille = 'text-2xl' }) {
  return (
    <div className={`inline-flex gap-1 ${taille}`} role={onChange ? 'radiogroup' : 'img'} aria-label={`${valeur} / 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        onChange ? (
          <button key={n} type="button" role="radio" aria-checked={valeur === n} aria-label={`${n} / 5`} onClick={() => onChange(n)}
            className={`leading-none transition-transform hover:scale-110 ${n <= valeur ? 'text-volt-500' : 'text-slate-300'}`}>★</button>
        ) : (
          <span key={n} aria-hidden="true" className={n <= Math.round(valeur) ? 'text-volt-500' : 'text-slate-300'}>★</span>
        )
      ))}
    </div>
  )
}
