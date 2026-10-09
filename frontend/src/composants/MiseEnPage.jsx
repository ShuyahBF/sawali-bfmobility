// ============================================================================
// Mise en page du site public et de l'espace client :
//   EnTete      : logo, liens, langue, compte
//   PiedDePage  : pays disponibles, service client, version
//   BarreOnglets: barre d'onglets en bas d'écran sur mobile (client connecté)
//   PageSite    : assemble les trois autour du contenu
// ============================================================================
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { accueilDuRole, useAuth } from '@/contexte/Auth.jsx'
import { useConfig } from '@/contexte/Config.jsx'
import { useLangue } from '@/i18n/index.jsx'
import Logo from './Logo.jsx'
import SelecteurLangue from './SelecteurLangue.jsx'
import Version from './Version.jsx'
import SupportSawali from './SupportSawali.jsx'   // SAWALI lot 90 : assistance pour tout utilisateur connecté
import api from '@/lib/api.js'

// Drapeau emoji à partir du code pays ISO (« BF » → 🇧🇫)
export function drapeau(code = '') {
  if (!/^[A-Za-z]{2}$/.test(code)) return '🌍'
  return String.fromCodePoint(...code.toUpperCase().split('').map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
}

export function EnTete({ sombre = false }) {
  const { utilisateur, deconnexion } = useAuth()
  const { t } = useLangue()
  const naviguer = useNavigate()
  const lien = ({ isActive }) =>
    `rounded-lg px-3 py-2 text-sm font-bold transition ${sombre ? (isActive ? 'text-volt-400' : 'text-white/80 hover:text-white') : (isActive ? 'text-volt-700' : 'text-nuit/80 hover:text-nuit')}`

  return (
    <header className={`no-print ${sombre ? 'bg-nuit' : 'bg-white/90 backdrop-blur ring-1 ring-nuit/5'} sticky top-0 z-[500]`}>
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3">
        <Link to="/" aria-label="Accueil bfmobility" className="shrink-0"><Logo clair={sombre} /></Link>
        {/* Liens principaux (cachés sur mobile : barre d'onglets en bas) */}
        <nav className="ml-6 hidden items-center gap-1 md:flex">
          <NavLink to="/commander" className={lien}>{t('nav.commander')}</NavLink>
          <a href="/#tarifs" className={lien({ isActive: false })}>{t('nav.tarifs')}</a>
          {utilisateur?.role === 'client' && <NavLink to="/courses" className={lien}>{t('nav.mesCourses')}</NavLink>}
          {utilisateur && utilisateur.role !== 'client' && (
            <NavLink to={accueilDuRole(utilisateur.role)} className={lien}>
              {utilisateur.role === 'chauffeur' ? t('nav.chauffeur') : t('nav.backoffice')}
            </NavLink>
          )}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {/* Langue : dans l'en-tête sur grand écran (sur mobile, elle est dans le pied de page) */}
          <span className="hidden sm:inline-flex"><SelecteurLangue clair={sombre} /></span>
          {utilisateur ? (
            <>
              {/* Pictogramme d'assistance : le client ou le chauffeur connecté écrit au support SAWALI à tout moment */}
              <SupportSawali api={api} clair={sombre} libelle="" />
              {/* Nom de l'utilisateur = lien vers son profil */}
              <Link to="/profil" className={`hidden text-sm font-bold hover:underline sm:inline ${sombre ? 'text-white/80' : 'text-nuit'}`} title={t('nav.profil')}>{utilisateur.nom}</Link>
              <button type="button" onClick={() => { deconnexion(); naviguer('/') }} className={sombre ? 'rounded-xl px-3 py-2 text-sm font-bold text-white ring-1 ring-white/25 hover:bg-white/10' : 'btn-secondaire py-2 text-sm'}>
                {t('nav.deconnexion')}
              </button>
            </>
          ) : (
            <Link to="/connexion" className={sombre ? 'rounded-xl px-3 py-2 text-sm font-bold text-white ring-1 ring-white/25 hover:bg-white/10' : 'btn-secondaire py-2 text-sm'}>
              {t('nav.connexion')}
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}

export function PiedDePage() {
  const { config } = useConfig()
  const { t } = useLangue()
  const pays = config.pays_disponibles?.length ? config.pays_disponibles : [{ code: config.pays, nom: config.pays, devise: config.devise }]
  return (
    <footer className="no-print bg-nuit text-white/80">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 md:grid-cols-[1.2fr_1fr_1fr]">
        <div>
          <Logo clair />
          <p className="mt-3 max-w-xs text-sm">{config.slogan}</p>
        </div>
        {/* Pays où la plateforme est ouverte */}
        <div>
          <h2 className="mb-3 text-sm font-bold text-white">{t('accueil.pays')}</h2>
          <ul className="flex flex-wrap gap-2">
            {pays.map((p) => (
              <li key={p.code} className="rounded-full bg-white/10 px-3 py-1 text-sm">
                <span aria-hidden="true">{drapeau(p.code)}</span> {p.nom} <span className="text-white/50">{p.devise}</span>
              </li>
            ))}
          </ul>
        </div>
        {/* Service client */}
        <div>
          <h2 className="mb-3 text-sm font-bold text-white">{t('accueil.support')}</h2>
          {config.telephone_support && <a href={`tel:${config.telephone_support}`} className="block text-sm hover:text-volt-400">{config.telephone_support}</a>}
          {config.email_support && <a href={`mailto:${config.email_support}`} className="block text-sm hover:text-volt-400">{config.email_support}</a>}
          <div className="mt-3"><SelecteurLangue clair /></div>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-white/50">
          <span>© {new Date().getFullYear()} {config.nom}. {t('pied.droits')}</span>
          {/* Version et date de déploiement (règle du propriétaire) */}
          <Version className="!text-white/50" />
        </div>
        {/* Limite de la protection anti-capture (règle de sécurité de l'interface) */}
        <div className="mx-auto max-w-6xl px-4 pb-4 text-xs text-white/40">
          {t('secu.note')}
        </div>
      </div>
    </footer>
  )
}

// Barre d'onglets mobile pour le client connecté
export function BarreOnglets() {
  const { utilisateur } = useAuth()
  const { t } = useLangue()
  if (utilisateur?.role !== 'client') return null
  const onglet = ({ isActive }) => `flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-bold ${isActive ? 'text-volt-700' : 'text-ardoise'}`
  return (
    <nav className="no-print fixed inset-x-0 bottom-0 z-[500] flex border-t border-nuit/10 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
      <NavLink to="/" end className={onglet}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M3 11 12 4l9 7v9h-6v-6H9v6H3z" /></svg>
        bfmobility
      </NavLink>
      <NavLink to="/commander" className={onglet}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></svg>
        {t('nav.commander')}
      </NavLink>
      <NavLink to="/profil" className={onglet}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></svg>
        {t('nav.profil')}
      </NavLink>
      <NavLink to="/courses" className={onglet}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10" /></svg>
        {t('nav.mesCourses')}
      </NavLink>
    </nav>
  )
}

// Page complète du site (en-tête + contenu + pied)
export default function PageSite({ children, sombre = false, sansPied = false }) {
  const { utilisateur } = useAuth()
  return (
    <div className="flex min-h-screen flex-col">
      <EnTete sombre={sombre} />
      <main className={`flex-1 ${utilisateur?.role === 'client' ? 'pb-20 md:pb-0' : ''}`}>{children}</main>
      {!sansPied && <PiedDePage />}
      <BarreOnglets />
    </div>
  )
}
