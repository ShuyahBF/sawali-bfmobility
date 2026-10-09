// ============================================================================
// Mise en forme des montants, distances, dates et durées
// (dépend de la langue choisie et des paramètres de la plateforme)
// ============================================================================

// Facteur de conversion kilomètres → miles
const KM_EN_MILES = 0.621371

// Montant dans la devise de la plateforme. Les devises sans centimes (XOF, XAF…)
// sont gérées automatiquement par Intl.NumberFormat.
export function formatMonnaie(montant, devise = 'XOF', langue = 'fr') {
  const n = Number(montant)
  if (montant === null || montant === undefined || Number.isNaN(n)) return '—'
  try {
    return new Intl.NumberFormat(langue, { style: 'currency', currency: devise || 'XOF' }).format(n)
  } catch {
    // Devise inconnue du navigateur : affichage simple
    return `${n.toLocaleString(langue)} ${devise}`
  }
}

// Distance : le serveur parle toujours en km ; on convertit si l'unité est « mi »
export function formatDistance(km, unite = 'km', langue = 'fr') {
  const n = Number(km)
  if (km === null || km === undefined || Number.isNaN(n)) return '—'
  const valeur = unite === 'mi' ? n * KM_EN_MILES : n
  const texte = valeur.toLocaleString(langue, { maximumFractionDigits: valeur < 10 ? 1 : 0 })
  return `${texte} ${unite === 'mi' ? 'mi' : 'km'}`
}

// Durée en minutes → « 25 min » ou « 1 h 05 »
export function formatDuree(minutes) {
  const m = Math.round(Number(minutes) || 0)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  return `${h} h ${String(m % 60).padStart(2, '0')}`
}

// Date + heure courte (« 09/10/2026 14:05 » en français)
export function formatDateHeure(iso, langue = 'fr') {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(langue, { dateStyle: 'short', timeStyle: 'short' })
}

// Date seule
export function formatDate(iso, langue = 'fr') {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(langue, { dateStyle: 'medium' })
}

// Heure seule (« 14:05 »)
export function formatHeure(iso, langue = 'fr') {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString(langue, { hour: '2-digit', minute: '2-digit' })
}

// CO₂ évité estimé pour une course électrique : ≈ 0,12 kg par km
// par rapport au même trajet en véhicule thermique.
export const CO2_KG_PAR_KM = 0.12
export function co2Evite(km) {
  return Math.max(0, (Number(km) || 0) * CO2_KG_PAR_KM)
}
