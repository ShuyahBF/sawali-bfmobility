// ============================================================================
// Alertes de la flotte (GET /admin/alertes) : maintenance, stock, documents,
// autonomie — classées de la plus urgente à la moins urgente.
// Textes traduits (clés adm.alertes.*).
// ============================================================================
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Jauge from '@/composants/Jauge.jsx'
import { useToasts } from '@/composants/Toasts.jsx'
import api, { messageErreur } from '@/lib/api.js'
import { useLangue } from '@/i18n/index.jsx'

// Présentation par gravité (icône + libellé : jamais la couleur seule)
const GRAVITES = {
  urgent: { rang: 0, libelle: 'urgent', icone: '⛔', classe: 'border-red-500 bg-red-50' },
  attention: { rang: 1, libelle: 'attention', icone: '⚠', classe: 'border-ambre-500 bg-ambre-50' },
  info: { rang: 2, libelle: 'info', icone: 'ℹ', classe: 'border-sky-500 bg-sky-50' },
}
// Types d'alerte (libellé traduit : adm.alertes.<type>)
const TYPES = ['maintenance', 'stock', 'document', 'autonomie']
// Écran où traiter chaque type d'alerte
const LIENS = { maintenance: '/admin/interventions', stock: '/admin/pieces', document: '/admin/vehicules', autonomie: '/admin/vehicules' }

export default function Alertes() {
  const toast = useToasts()
  const { t } = useLangue()
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
          <h1 className="font-display text-2xl font-bold">{t('adm.menu.alertes')}</h1>
          <p className="text-sm text-ardoise">{t('adm.alertes.description')}</p>
        </div>
        <select value={type} onChange={(e) => setType(e.target.value)} className="champ w-auto" aria-label={t('adm.alertes.type')}>
          <option value="">{t('adm.alertes.tousTypes')}</option>
          {TYPES.map((k) => <option key={k} value={k}>{t(`adm.alertes.${k}`)}</option>)}
        </select>
      </header>
      {alertes === null && <div className="flex justify-center py-10"><Jauge /></div>}
      {alertes && liste.length === 0 && <p className="surface text-ardoise">{t('adm.alertes.aucune')}</p>}
      <ul className="space-y-2">
        {liste.map((a, i) => {
          const g = GRAVITES[a.gravite] || GRAVITES.info
          return (
            <li key={i} className={`flex items-start gap-3 rounded-2xl border-l-4 p-4 ${g.classe}`}>
              <span aria-hidden="true" className="text-lg">{g.icone}</span>
              <div className="flex-1">
                <p className="text-xs font-bold text-ardoise">{t(`adm.alertes.${g.libelle}`)} — {TYPES.includes(a.type) ? t(`adm.alertes.${a.type}`) : a.type}</p>
                <p className="text-nuit">{a.message}</p>
              </div>
              {LIENS[a.type] && <Link to={LIENS[a.type]} className="whitespace-nowrap text-sm font-bold text-nuit-600 hover:underline">{t('adm.alertes.traiter')}</Link>}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
