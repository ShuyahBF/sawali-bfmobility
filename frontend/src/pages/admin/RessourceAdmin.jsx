// ============================================================================
// Page générique du back-office : affiche le TableauCrud de la ressource
// indiquée (vehicules, categories, pieces…) avec la configuration du rôle.
// ============================================================================
import TableauCrud from '@/composants/TableauCrud.jsx'
import { useAuth } from '@/contexte/Auth.jsx'
import { useConfig } from '@/contexte/Config.jsx'
import { configRessource } from './ressources.jsx'

export default function RessourceAdmin({ nom }) {
  const { utilisateur } = useAuth()
  const { categories, monnaie } = useConfig()
  const config = configRessource(nom, { role: utilisateur?.role, categories, monnaie })
  if (!config) return <p>Écran inconnu.</p>
  // key={nom} : un écran neuf (liste, formulaire) à chaque changement de ressource
  return <TableauCrud key={nom} config={config} />
}
