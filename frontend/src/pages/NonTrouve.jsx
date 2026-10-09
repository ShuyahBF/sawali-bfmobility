// ============================================================================
// Page introuvable (adresse inconnue)
// ============================================================================
import { Link } from 'react-router-dom'
import PageSite from '@/composants/MiseEnPage.jsx'
import { useLangue } from '@/i18n/index.jsx'

export default function NonTrouve() {
  const { t } = useLangue()
  return (
    <PageSite>
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <p className="font-display text-7xl font-extrabold text-volt-500">404</p>
        <h1 className="mt-4 text-2xl font-bold">{t('nt.titre')}</h1>
        <p className="mt-2 text-ardoise">{t('nt.texte')}</p>
        <Link to="/" className="btn-principal mt-6">{t('nt.retour')}</Link>
      </div>
    </PageSite>
  )
}
