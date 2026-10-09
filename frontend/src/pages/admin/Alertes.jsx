// ============================================================================
// Alertes de la flotte (GET /admin/alertes) : maintenance, stock, documents,
// autonomie — classées de la plus urgente à la moins urgente.
// ============================================================================
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Jauge from '@/composants/Jauge.jsx'
import { useToasts } from '@/composants/Toasts.jsx'
import api, { messageErreur } from '@/lib/api.js'

// Présentation par gravité (icône + libellé : jamais la couleur seule)
const GRAVITES = {
  urgent: { rang: 0, libelle: 'Urgent', icone: '⛔', classe: 'border-red-500 bg-red-50' },
  attention: { rang: 1, libelle: 'Attention', icone: '⚠', classe: 'border-ambre-500 bg-ambre-50' },
  info: { rang: 2, libelle: 'Info', icone: 'ℹ', classe: 'border-sky-500 bg-sky-50' },
}
const TYPES = { maintenance: 'Maintenance', stock: 'Stock', document: 'Document', autonomie: 'Autonomie' }
// Écran où traiter chaque type d'alerte
const LIENS = { maintenance: '/admin/interventions', stock: '/admin/pieces', document: '/admin/vehicules', autonomie: '/admin/vehicules' }

export default function Alertes() {
  const toast = useToasts()
  const [alertes, setAlertes] = useState(null)
  const [type, setType] = useState('')

  useEffect(() => {
    toast.attente(api.get('/admin/alertes'))
      .then(({ data }) => setAlertes(Array.isArray(data) ? data : []))
      .catch((err) => { toast.erreur(messageErreur(err)); setAlertes([]) })
  }, [toast])

  const liste = (alertes || [])
    .filter((a) => !type || a.type === type)
    .sort((a, b) => (GRAVITES[a.gravite]?.rang ?? 3) - (GRAVITES[b.gravite]?.rang ?? 3))

  return (
    <div>
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Alertes</h1>
          <p className="text-sm text-ardoise">Entretiens à prévoir, pièces sous le seuil, documents qui expirent, autonomie faible.</p>
        </div>
        <select value={type} onChange={(e) => setType(e.target.value)} className="champ w-auto" aria-label="Type d'alerte">
          <option value="">Tous les types</option>
          {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </header>
      {alertes === null && <div className="flex justify-center py-10"><Jauge /></div>}
      {alertes && liste.length === 0 && <p className="surface text-ardoise">Aucune alerte. Tout est en ordre.</p>}
      <ul className="space-y-2">
        {liste.map((a, i) => {
          const g = GRAVITES[a.gravite] || GRAVITES.info
          return (
            <li key={i} className={`flex items-start gap-3 rounded-2xl border-l-4 p-4 ${g.classe}`}>
              <span aria-hidden="true" className="text-lg">{g.icone}</span>
              <div className="flex-1">
                <p className="text-xs font-bold text-ardoise">{g.libelle} — {TYPES[a.type] || a.type}</p>
                <p className="text-nuit">{a.message}</p>
              </div>
              {LIENS[a.type] && <Link to={LIENS[a.type]} className="whitespace-nowrap text-sm font-bold text-nuit-600 hover:underline">Traiter</Link>}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
