// ============================================================================
// Page introuvable (adresse inconnue)
// ============================================================================
import { Link } from 'react-router-dom'
import PageSite from '@/composants/MiseEnPage.jsx'

export default function NonTrouve() {
  return (
    <PageSite>
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <p className="font-display text-7xl font-extrabold text-volt-500">404</p>
        <h1 className="mt-4 text-2xl font-bold">Cette page n’existe pas.</h1>
        <p className="mt-2 text-ardoise">Vérifiez l’adresse ou repartez de l’accueil.</p>
        <Link to="/" className="btn-principal mt-6">Retour à l’accueil</Link>
      </div>
    </PageSite>
  )
}
