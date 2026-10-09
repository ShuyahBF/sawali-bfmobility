// ============================================================================
// Cadre du back-office : barre latérale (menu filtré selon le rôle) + contenu.
// Pages d'administration : libellé de version DÉTAILLÉ (lot + commit).
// Textes traduits (clés adm.menu.*) ; sélecteur de langue en bas du menu.
// ============================================================================
import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import Logo from '@/composants/Logo.jsx'
import Version from '@/composants/Version.jsx'
import SelecteurLangue from '@/composants/SelecteurLangue.jsx'
import { useLangue } from '@/i18n/index.jsx'
import { useAuth } from '@/contexte/Auth.jsx'
import SupportSawali from '@/composants/SupportSawali.jsx'   // SAWALI lot 90 : pictogramme d'assistance
import api from '@/lib/api.js'

// Menu complet ; « roles » = rôles qui voient l'entrée ;
// groupe et libelle sont des clés de traduction (adm.menu.<clé>)
const DIRECTION = ['admin', 'gestionnaire']
const ATELIER = ['admin', 'gestionnaire', 'mecanicien']
export const MENU = [
  { groupe: 'exploitation', liens: [
    { to: '/admin', fin: true, libelle: 'tableauDeBord', roles: DIRECTION },
    { to: '/admin/courses', libelle: 'courses', roles: DIRECTION },
    { to: '/admin/alertes', libelle: 'alertes', roles: ATELIER },
  ] },
  { groupe: 'parc', liens: [
    { to: '/admin/vehicules', libelle: 'vehicules', roles: ATELIER },
    { to: '/admin/categories', libelle: 'categories', roles: DIRECTION },
    { to: '/admin/utilisateurs', libelle: 'utilisateurs', roles: DIRECTION },
    { to: '/admin/energie', libelle: 'energie', roles: DIRECTION },
    { to: '/admin/candidatures', libelle: 'candidatures', roles: DIRECTION },
  ] },
  { groupe: 'atelier', liens: [
    { to: '/admin/interventions', libelle: 'interventions', roles: ATELIER },
    { to: '/admin/plans', libelle: 'plans', roles: ATELIER },
    { to: '/admin/pieces', libelle: 'pieces', roles: ATELIER },
  ] },
  { groupe: 'achats', liens: [
    { to: '/admin/fournisseurs', libelle: 'fournisseurs', roles: DIRECTION },
    { to: '/admin/commandes', libelle: 'commandes', roles: DIRECTION },
    { to: '/admin/paiements-fournisseurs', libelle: 'paiements', roles: DIRECTION },
  ] },
  { groupe: 'societe', liens: [
    { to: '/admin/parametres', libelle: 'parametres', roles: ['admin'] },
  ] },
]

export default function AdminLayout() {
  const { utilisateur, deconnexion } = useAuth()
  const { t } = useLangue()
  const naviguer = useNavigate()
  const [ouvert, setOuvert] = useState(false)
  const role = utilisateur?.role

  // Style d'un lien du menu (actif = fond vert léger)
  const lien = ({ isActive }) =>
    `block rounded-xl px-3 py-2 text-sm font-bold transition ${isActive ? 'bg-volt-500 text-nuit' : 'text-white/75 hover:bg-white/10 hover:text-white'}`

  // Contenu de la barre latérale (réutilisé sur mobile dans le tiroir)
  const barre = (
    <div className="flex h-full flex-col">
      <Link to="/" className="px-2 py-1"><Logo clair taille={28} /></Link>
      <nav className="mt-6 flex-1 space-y-5 overflow-y-auto" aria-label={t('nav.backoffice')}>
        {MENU.map((g) => {
          const visibles = g.liens.filter((l) => l.roles.includes(role))
          if (!visibles.length) return null
          return (
            <div key={g.groupe}>
              <p className="mb-1 px-3 text-xs text-white/40">{t(`adm.menu.${g.groupe}`)}</p>
              {visibles.map((l) => (
                <NavLink key={l.to} to={l.to} end={l.fin} className={lien} onClick={() => setOuvert(false)}>{t(`adm.menu.${l.libelle}`)}</NavLink>
              ))}
            </div>
          )
        })}
      </nav>
      {/* Compte + version détaillée */}
      <div className="mt-4 border-t border-white/10 pt-4">
        <p className="truncate text-sm font-bold text-white">{utilisateur?.nom}</p>
        <p className="text-xs text-white/50">{t(`adm.opt.${role}`)}</p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          <Link to="/profil" className="text-sm font-bold text-white/80 hover:underline">{t('nav.profil')}</Link>
          <button type="button" onClick={() => { deconnexion(); naviguer('/connexion') }} className="text-sm font-bold text-volt-400 hover:underline">{t('nav.deconnexion')}</button>
        </div>
        {/* SAWALI lot 90 — petit pictogramme d'assistance : discussion avec le support SAWALI */}
        <div className="mt-2 -mx-3"><SupportSawali api={api} clair /></div>
        <div className="mt-2"><SelecteurLangue clair /></div>
        <Version detaille className="mt-3 !text-white/45" />
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-brume lg:grid lg:grid-cols-[250px_1fr]">
      {/* Barre latérale fixe (grand écran) */}
      <aside className="sticky top-0 hidden h-screen bg-nuit p-4 lg:block">{barre}</aside>

      {/* En-tête mobile + tiroir */}
      <header className="sticky top-0 z-[500] flex items-center gap-3 bg-nuit px-4 py-3 lg:hidden">
        <button type="button" onClick={() => setOuvert(true)} className="grid h-10 w-10 place-items-center rounded-xl text-white ring-1 ring-white/20" aria-label={t('adm.menu.ouvrir')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        <Logo clair taille={24} />
      </header>
      {ouvert && (
        <div className="fixed inset-0 z-[900] bg-nuit/60 lg:hidden" onClick={() => setOuvert(false)}>
          <aside className="h-full w-72 bg-nuit p-4" onClick={(e) => e.stopPropagation()}>{barre}</aside>
        </div>
      )}

      {/* Contenu de la page */}
      <main className="min-w-0 p-4 sm:p-6 lg:p-8">
        <Outlet />
      </main>
    </div>
  )
}
