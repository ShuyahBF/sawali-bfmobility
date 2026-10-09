// ============================================================================
// Cadre commun des pages Connexion / Inscription : carte centrée avec logo,
// état du serveur et version (règles du propriétaire).
// ============================================================================
import { Link } from 'react-router-dom'
import Logo from '@/composants/Logo.jsx'
import EtatServeur from '@/composants/EtatServeur.jsx'
import SelecteurLangue from '@/composants/SelecteurLangue.jsx'
import Version from '@/composants/Version.jsx'

export default function CarteAuth({ titre, sousTitre, children, pied }) {
  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-nuit px-4 py-10">
      {/* Halo vert discret derrière la carte */}
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[480px] -translate-x-1/2 rounded-full bg-volt-500/20 blur-3xl" aria-hidden="true" />
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
