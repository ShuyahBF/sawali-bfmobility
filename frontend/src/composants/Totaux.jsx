// ============================================================================
// Totaux (lot 10) — bandeau de chiffres clés au-dessus d'une liste (ex. coût total de l'énergie d'un véhicule,
// nombre de courses, chiffre d'affaires). elements = [{ libelle, valeur, fort? }] ; « fort » met le chiffre en avant.
// ============================================================================
export default function Totaux({ elements }) {
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {elements.map((e) => (
        <div key={e.libelle} className={`rounded-2xl px-4 py-3 ${e.fort ? 'bg-nuit text-white' : 'bg-white ring-1 ring-nuit/10'}`}>
          <dt className={`text-xs ${e.fort ? 'text-white/70' : 'text-ardoise'}`}>{e.libelle}</dt>
          <dd className={`font-display text-lg font-bold tabular-nums ${e.fort ? 'text-volt-400' : 'text-nuit'}`}>{e.valeur}</dd>
        </div>
      ))}
    </dl>
  )
}
