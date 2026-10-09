// ============================================================================
// Logo « bfmobility » : une goutte jaune soleil traversée d'un éclair + le nom.
//   clair = true → texte blanc (sur fond bleu nuit)
// ============================================================================
export function Goutte({ taille = 32 }) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 64 64" aria-hidden="true">
      {/* Goutte (énergie) */}
      <path d="M32 6C32 6 14 26 14 39a18 18 0 0 0 36 0C50 26 32 6 32 6z" fill="#FFC629" />
      {/* Reflet */}
      <path d="M22 40a10 10 0 0 0 6 9" stroke="#FFF8DB" strokeWidth="3" strokeLinecap="round" fill="none" />
      {/* Éclair (mobilité électrique) */}
      <path d="M35 22 25 39h7l-3 12 11-18h-7z" fill="#1A1650" />
    </svg>
  )
}

export default function Logo({ clair = false, taille = 30, avecNom = true }) {
  return (
    <span className="inline-flex items-center gap-2 select-none">
      <Goutte taille={taille} />
      {avecNom && (
        <span className={`font-display text-xl font-extrabold tracking-tight ${clair ? 'text-white' : 'text-nuit'}`}>
          bf<span className={clair ? 'text-volt-400' : 'text-nuit-600'}>mobility</span>
        </span>
      )}
    </span>
  )
}
