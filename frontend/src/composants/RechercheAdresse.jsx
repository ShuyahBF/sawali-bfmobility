// ============================================================================
// Champ de recherche d'adresse avec suggestions (Nominatim / OpenStreetMap).
// Délai anti-rafale : la recherche ne part que 600 ms après la dernière frappe,
// et une recherche devenue inutile est annulée (règle d'usage de Nominatim).
//   valeur   : {lat, lng, adresse} | null
//   onChoix  : appelé avec {lat, lng, adresse}
//   pastille : couleur de la pastille à gauche (vert départ, ambre arrivée)
// ============================================================================
import { useEffect, useRef, useState } from 'react'
import { chercherAdresse } from '@/lib/geo.js'
import { useLangue } from '@/i18n/index.jsx'
import { useConfig } from '@/contexte/Config.jsx'
import Jauge from './Jauge.jsx'

export default function RechercheAdresse({ valeur, onChoix, placeholder, pastille = 'bg-volt-400', lettre = 'A', id }) {
  const { langue } = useLangue()
  const { config } = useConfig()
  const [texte, setTexte] = useState(valeur?.adresse || '')
  const [resultats, setResultats] = useState([])
  const [ouvert, setOuvert] = useState(false)
  const [cherche, setCherche] = useState(false)
  // Vrai quand le texte a été tapé par l'utilisateur (sinon pas de recherche)
  const tape = useRef(false)

  // Quand la valeur change de l'extérieur (clic sur la carte, « Ma position »), on recopie l'adresse
  useEffect(() => {
    tape.current = false
    setTexte(valeur?.adresse || '')
  }, [valeur?.adresse])

  // Recherche différée (600 ms) avec annulation de la précédente
  useEffect(() => {
    if (!tape.current || texte.trim().length < 3) { setResultats([]); return }
    const controle = new AbortController()
    const minuterie = setTimeout(async () => {
      setCherche(true)
      try {
        // On privilégie le pays de la plateforme, sinon recherche mondiale
        let liste = await chercherAdresse(texte, { signal: controle.signal, langue, pays: config.pays })
        if (!liste.length) liste = await chercherAdresse(texte, { signal: controle.signal, langue })
        setResultats(liste)
        setOuvert(true)
      } catch { /* annulée ou réseau : on ignore */ }
      finally { setCherche(false) }
    }, 600)
    return () => { clearTimeout(minuterie); controle.abort() }
  }, [texte, langue, config.pays])

  return (
    <div className="relative">
      <div className="flex items-center gap-3 rounded-2xl bg-white px-3 ring-1 ring-nuit/15 focus-within:ring-2 focus-within:ring-volt-500">
        {/* Pastille A / B */}
        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full font-display text-sm font-extrabold text-nuit ${pastille}`} aria-hidden="true">{lettre}</span>
        <input
          id={id}
          value={texte}
          onChange={(e) => { tape.current = true; setTexte(e.target.value) }}
          onFocus={() => resultats.length && setOuvert(true)}
          onBlur={() => setTimeout(() => setOuvert(false), 150)}
          placeholder={placeholder}
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent py-3 text-nuit outline-none placeholder:text-ardoise/70"
        />
        {cherche && <Jauge taille={18} epaisseur={2.5} />}
      </div>
      {/* Liste des suggestions */}
      {ouvert && resultats.length > 0 && (
        <ul className="absolute z-[600] mt-1 max-h-64 w-full overflow-y-auto rounded-2xl bg-white py-1 shadow-xl ring-1 ring-nuit/10" role="listbox">
          {resultats.map((r, i) => (
            <li key={`${r.lat}-${r.lng}-${i}`}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onChoix(r); setOuvert(false); setResultats([]) }}
                className="block w-full px-4 py-2 text-left text-sm text-nuit hover:bg-volt-50"
              >
                {r.adresse}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
