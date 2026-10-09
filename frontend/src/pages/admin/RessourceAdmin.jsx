// ============================================================================
// Page générique du back-office : affiche le TableauCrud de la ressource
// indiquée (vehicules, categories, pieces…) avec la configuration du rôle.
// ============================================================================
import TableauCrud from '@/composants/TableauCrud.jsx'
import { useAuth } from '@/contexte/Auth.jsx'
import { useConfig } from '@/contexte/Config.jsx'
import { useLangue } from '@/i18n/index.jsx'
import { configRessource } from './ressources.jsx'

export default function RessourceAdmin({ nom }) {
  const { utilisateur } = useAuth()
  const { categories, monnaie } = useConfig()
  const { t, langue } = useLangue()
  const config = configRessource(nom, { role: utilisateur?.role, categories, monnaie, t, langue })
  if (!config) return <p>{t('adm.inconnu')}</p>
  // key : un écran neuf (liste, formulaire) à chaque changement de ressource ou de langue
  return <TableauCrud key={`${nom}-${langue}`} config={config} />
}
