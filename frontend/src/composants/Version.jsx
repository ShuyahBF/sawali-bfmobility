// ============================================================================
// Affichage de la version (règle du propriétaire)
//   detaille = false → « Version X · déployée le JJ/MM/AAAA HH:MM »
//   detaille = true  → « Version X · Lot N · commit · déployée le … » (administration)
// ============================================================================
import { libelleVersion } from '@/version.js'

export default function Version({ detaille = false, className = '' }) {
  return <p className={`text-xs tabular-nums text-ardoise ${className}`}>{libelleVersion(detaille)}</p>
}
