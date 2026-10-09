// ============================================================================
// Carte interactive (Leaflet + tuiles OpenStreetMap, gratuites et mondiales)
//   depart / arrivee : {lat, lng}  → marqueurs vert (A) et ambre (B)
//   chauffeur        : {lat, lng}  → voiture qui pulse
//   trace            : [[lat, lng], …] itinéraire routier (lot 2) → trait plein ;
//                      sans trace, simple ligne pointillée départ → arrivée
//   onClic(point)    : appelé quand on touche la carte (choix d'un point)
//   centre           : centre par défaut quand aucun point n'est placé
// La vue s'ajuste automatiquement pour montrer tous les points.
// ============================================================================
import { useEffect, useMemo } from 'react'
import { MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
// --- Correctif connu « icônes de marqueurs invisibles » de Leaflet avec Vite :
// Leaflet cherche ses images par un chemin calculé qui n'existe plus une fois
// le site compilé ; on lui donne explicitement les adresses des images.
import iconeRetina from 'leaflet/dist/images/marker-icon-2x.png'
import icone from 'leaflet/dist/images/marker-icon.png'
import ombre from 'leaflet/dist/images/marker-shadow.png'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({ iconRetinaUrl: iconeRetina, iconUrl: icone, shadowUrl: ombre })

// Centre par défaut : Ouagadougou (remplacé par le premier point connu)
export const CENTRE_DEFAUT = { lat: 12.3714, lng: -1.5197 }

// Marqueur « épingle » dessiné en SVG (couleur + lettre)
function epingle(couleur, lettre) {
  return L.divIcon({
    className: 'bfm-epingle',
    iconSize: [34, 44],
    iconAnchor: [17, 42],
    html: `<svg width="34" height="44" viewBox="0 0 34 44"><path d="M17 43C17 43 3 26 3 16a14 14 0 0 1 28 0c0 10-14 27-14 27z" fill="${couleur}" stroke="#0B1F3A" stroke-width="2"/><text x="17" y="21" text-anchor="middle" font-family="Bricolage Grotesque,system-ui" font-weight="800" font-size="14" fill="#0B1F3A">${lettre}</text></svg>`,
  })
}
const ICONE_DEPART = epingle('#2EE59D', 'A')
const ICONE_ARRIVEE = epingle('#F5A524', 'B')

// Marqueur du chauffeur : voiture dans un rond bleu nuit + halo qui pulse
const ICONE_CHAUFFEUR = L.divIcon({
  className: 'bfm-chauffeur',
  iconSize: [40, 40],
  iconAnchor: [20, 20],
  html: `<span class="bfm-halo"></span><span class="bfm-voiture"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2EE59D" stroke-width="2" stroke-linecap="round"><path d="M5 16h14M6 16l1.5-5.5A2 2 0 0 1 9.4 9h5.2a2 2 0 0 1 1.9 1.5L18 16v3h-2v-1.5H8V19H6z"/></svg></span>`,
})

// Écoute des clics sur la carte
function EcouteClic({ onClic }) {
  useMapEvents({ click: (e) => onClic?.({ lat: e.latlng.lat, lng: e.latlng.lng }) })
  return null
}

// Ajuste la vue pour montrer tous les points (seulement quand la liste change)
function Ajustement({ points }) {
  const carte = useMap()
  const cle = points.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join('|')
  useEffect(() => {
    if (points.length === 1) carte.setView([points[0].lat, points[0].lng], Math.max(carte.getZoom(), 14), { animate: true })
    else if (points.length > 1) carte.fitBounds(points.map((p) => [p.lat, p.lng]), { padding: [48, 48], maxZoom: 16 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle])
  return null
}

// Vrai si l'objet contient des coordonnées valides
const valide = (p) => p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng))

export default function Carte({ depart, arrivee, chauffeur, trace, onClic, centre, hauteur = 'h-80', className = '' }) {
  // Itinéraire routier exploitable (au moins deux points valides)
  const itineraire = useMemo(
    () => (Array.isArray(trace) ? trace.filter((p) => Array.isArray(p) && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1]))) : []),
    [trace],
  )
  // Liste des points à montrer (pour l'ajustement de la vue) : marqueurs + quelques points de l'itinéraire
  const points = useMemo(() => {
    const marqueurs = [depart, arrivee, chauffeur].filter(valide).map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) }))
    const pas = Math.max(1, Math.floor(itineraire.length / 20))
    const route = itineraire.filter((_, i) => i % pas === 0).map(([lat, lng]) => ({ lat: Number(lat), lng: Number(lng) }))
    return [...marqueurs, ...route]
  }, [depart, arrivee, chauffeur, itineraire])
  const c = valide(centre) ? centre : points[0] || CENTRE_DEFAUT

  return (
    <div className={`relative overflow-hidden rounded-3xl ring-1 ring-nuit/10 ${hauteur} ${className}`}>
      <MapContainer center={[c.lat, c.lng]} zoom={13} scrollWheelZoom className="h-full w-full" attributionControl>
        {/* Fond de carte OpenStreetMap */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {onClic && <EcouteClic onClic={onClic} />}
        <Ajustement points={points} />
        {/* Itinéraire routier : trait plein vert bordé de bleu nuit (lisible sur tous les fonds) */}
        {itineraire.length > 1 && (
          <>
            <Polyline positions={itineraire} pathOptions={{ color: '#0B1F3A', weight: 8, opacity: 0.85, lineCap: 'round', lineJoin: 'round' }} />
            <Polyline positions={itineraire} pathOptions={{ color: '#2EE59D', weight: 4.5, lineCap: 'round', lineJoin: 'round' }} />
          </>
        )}
        {/* Sans itinéraire : ligne pointillée départ → arrivée (indicative, à vol d'oiseau) */}
        {itineraire.length < 2 && valide(depart) && valide(arrivee) && (
          <Polyline positions={[[depart.lat, depart.lng], [arrivee.lat, arrivee.lng]]} pathOptions={{ color: '#0B1F3A', weight: 4, dashArray: '2 10', lineCap: 'round' }} />
        )}
        {valide(depart) && <Marker position={[depart.lat, depart.lng]} icon={ICONE_DEPART} />}
        {valide(arrivee) && <Marker position={[arrivee.lat, arrivee.lng]} icon={ICONE_ARRIVEE} />}
        {valide(chauffeur) && <Marker position={[chauffeur.lat, chauffeur.lng]} icon={ICONE_CHAUFFEUR} />}
      </MapContainer>
    </div>
  )
}
