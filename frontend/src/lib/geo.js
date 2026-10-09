// ============================================================================
// Outils géographiques : recherche d'adresse (Nominatim / OpenStreetMap),
// adresse d'un point cliqué, position du navigateur, distance à vol d'oiseau
// ============================================================================

const NOMINATIM = 'https://nominatim.openstreetmap.org'

// Recherche d'adresses (texte libre). `signal` permet d'annuler une recherche
// devenue inutile (l'utilisateur a continué à taper).
export async function chercherAdresse(texte, { signal, langue = 'fr', pays } = {}) {
  const q = (texte || '').trim()
  if (q.length < 3) return []
  const params = new URLSearchParams({ format: 'json', q, limit: '6', addressdetails: '0', 'accept-language': langue })
  if (pays) params.set('countrycodes', pays.toLowerCase())
  const rep = await fetch(`${NOMINATIM}/search?${params}`, { signal })
  if (!rep.ok) return []
  const liste = await rep.json()
  return liste.map((r) => ({ lat: Number(r.lat), lng: Number(r.lon), adresse: r.display_name }))
}

// Adresse lisible d'un point (géocodage inverse) ; renvoie les coordonnées en texte si échec
export async function adresseDuPoint(lat, lng, langue = 'fr') {
  const secours = `${lat.toFixed(5)}, ${lng.toFixed(5)}`
  try {
    const params = new URLSearchParams({ format: 'json', lat, lon: lng, zoom: '18', 'accept-language': langue })
    const rep = await fetch(`${NOMINATIM}/reverse?${params}`)
    if (!rep.ok) return secours
    const r = await rep.json()
    // On raccourcit : les 3 premiers éléments suffisent (rue, quartier, ville)
    return r.display_name ? r.display_name.split(',').slice(0, 3).join(',').trim() : secours
  } catch {
    return secours
  }
}

// Position actuelle du navigateur (promesse) — demande l'autorisation à l'utilisateur
export function maPosition() {
  return new Promise((resoudre, rejeter) => {
    if (!navigator.geolocation) return rejeter(new Error('Géolocalisation non disponible sur cet appareil.'))
    navigator.geolocation.getCurrentPosition(
      (p) => resoudre({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => rejeter(new Error('Position refusée ou introuvable.')),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 10000 },
    )
  })
}

// Distance à vol d'oiseau entre deux points (formule de haversine), en km
export function distanceKm(a, b) {
  if (!a || !b) return 0
  const R = 6371
  const rad = (x) => (x * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
