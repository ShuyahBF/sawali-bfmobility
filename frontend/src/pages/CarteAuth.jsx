// ============================================================================
// Cadre commun des pages Connexion / Inscription : carte centrée avec logo,
// état du serveur et version (règles du propriétaire).
// ============================================================================
import { Link } from 'react-router-dom'
import Logo from '@/composants/Logo.jsx'
import EtatServeur from '@/composants/EtatServeur.jsx'
import SelecteurLangue from '@/composants/SelecteurLangue.jsx'
import Version from '@/composants/Version.jsx'
import { useLangue } from '@/i18n/index.jsx'

export default function CarteAuth({ titre, sousTitre, children, pied }) {
  const { t } = useLangue()
  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-nuit px-4 pb-10 pt-20">
      {/* Halo vert discret derrière la carte */}
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[480px] -translate-x-1/2 rounded-full bg-volt-500/20 blur-3xl" aria-hidden="true" />
      {/* Lot 17 — lien visible de retour au site public (en face du choix de la langue) */}
      <Link to="/" className="absolute left-4 top-4 inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-bold text-white/85 ring-1 ring-white/25 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-volt-400">
        <span aria-hidden="true">←</span> {t('cnx.retourSite')}
      </Link>
      <div className="absolute right-4 top-4"><SelecteurLangue clair /></div>
      <main className="relative w-full max-w-md rounded-[28px] bg-white p-6 shadow-2xl sm:p-8">
        <div className="flex justify-center"><Link to="/" aria-label="Accueil"><Logo taille={40} /></Link></div>
        <h1 className="mt-6 text-center text-2xl font-bold">{titre}</h1>
        {sousTitre && <p className="mt-1 text-center text-ardoise">{sousTitre}</p>}
        <div className="mt-6">{children}</div>
        {pied && <div className="mt-6 text-center text-sm text-ardoise">{pied}</div>}
        {/* État du serveur + version */}
        <div className="mt-6 flex flex-col items-center gap-1 border-t border-nuit/10 pt-4">
          <EtatServeur />
          <Version />
        </div>
      </main>
    </div>
  )
}
