// ============================================================================
// Jauge d'attente : cercle transparent avec un arc qui tourne (comme SAWALI).
//   taille  : diamètre en pixels
//   couleur : couleur de l'arc (vert électrique par défaut)
// ============================================================================
export default function Jauge({ taille = 40, couleur = '#14C97E', epaisseur = 4, libelle = 'Patientez…' }) {
  const r = (taille - epaisseur) / 2
  const circonference = 2 * Math.PI * r
  return (
    <svg
      width={taille}
      height={taille}
      viewBox={`0 0 ${taille} ${taille}`}
      className="animate-tourne motion-reduce:animate-[tourne_2.5s_linear_infinite]"
      role="progressbar"
      aria-label={libelle}
    >
      {/* Piste du cercle : très transparente */}
      <circle cx={taille / 2} cy={taille / 2} r={r} fill="none" stroke={couleur} strokeOpacity="0.18" strokeWidth={epaisseur} />
      {/* Arc qui tourne : un quart du cercle environ */}
      <circle
        cx={taille / 2}
        cy={taille / 2}
        r={r}
        fill="none"
        stroke={couleur}
        strokeWidth={epaisseur}
        strokeLinecap="round"
        strokeDasharray={`${circonference * 0.28} ${circonference}`}
      />
    </svg>
  )
}
