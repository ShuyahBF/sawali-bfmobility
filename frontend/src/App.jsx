// ============================================================================
// Routes (adresses) du site
//   Public   : /  /connexion  /inscription  /commander
//   Client   : /courses  /courses/:id  /recu/:id
//   Chauffeur: /chauffeur
//   Back-office (admin, gestionnaire, mécanicien) : /admin/...
// Les espaces chauffeur et back-office sont chargés à la demande (site plus léger).
// ============================================================================
import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import RouteProtegee from '@/composants/Gardes.jsx'
import Jauge from '@/composants/Jauge.jsx'
import { useAuth } from '@/contexte/Auth.jsx'
import Accueil from '@/pages/Accueil.jsx'
import Connexion from '@/pages/Connexion.jsx'
import Inscription from '@/pages/Inscription.jsx'
import Commander from '@/pages/Commander.jsx'
import MesCourses from '@/pages/MesCourses.jsx'
import SuiviCourse from '@/pages/SuiviCourse.jsx'
import Recu from '@/pages/Recu.jsx'
import NonTrouve from '@/pages/NonTrouve.jsx'

// Chargement à la demande
const Chauffeur = lazy(() => import('@/pages/Chauffeur.jsx'))
const AdminLayout = lazy(() => import('@/pages/admin/AdminLayout.jsx'))
const TableauDeBord = lazy(() => import('@/pages/admin/TableauDeBord.jsx'))
const CoursesAdmin = lazy(() => import('@/pages/admin/CoursesAdmin.jsx'))
const Alertes = lazy(() => import('@/pages/admin/Alertes.jsx'))
const Parametres = lazy(() => import('@/pages/admin/Parametres.jsx'))
const RessourceAdmin = lazy(() => import('@/pages/admin/RessourceAdmin.jsx'))

// Rôles autorisés par espace
const ROLES_COURSE = ['client', 'chauffeur', 'admin', 'gestionnaire']
const ROLES_ADMIN = ['admin', 'gestionnaire', 'mecanicien']
const DIRECTION = ['admin', 'gestionnaire']

// Écrans génériques du back-office (TableauCrud) et rôles qui y ont accès
const RESSOURCES = [
  ['vehicules', ROLES_ADMIN],
  ['categories', DIRECTION],
  ['utilisateurs', DIRECTION],
  ['energie', DIRECTION],
  ['plans', ROLES_ADMIN],
  ['interventions', ROLES_ADMIN],
  ['pieces', ROLES_ADMIN],
  ['fournisseurs', DIRECTION],
  ['commandes', DIRECTION],
  ['paiements-fournisseurs', DIRECTION],
]

// Accueil du back-office : le mécanicien arrive sur ses interventions
function AccueilAdmin() {
  const { utilisateur } = useAuth()
  if (utilisateur?.role === 'mecanicien') return <Navigate to="/admin/interventions" replace />
  return <TableauDeBord />
}

// Attente pendant le chargement d'un espace
const attente = <div className="grid min-h-screen place-items-center"><Jauge taille={56} /></div>

export default function App() {
  return (
    <Suspense fallback={attente}>
      <Routes>
        {/* Public */}
        <Route path="/" element={<Accueil />} />
        <Route path="/connexion" element={<Connexion />} />
        <Route path="/inscription" element={<Inscription />} />
        <Route path="/commander" element={<Commander />} />

        {/* Client (et suivi accessible au chauffeur / à la direction) */}
        <Route path="/courses" element={<RouteProtegee roles={['client']}><MesCourses /></RouteProtegee>} />
        <Route path="/courses/:id" element={<RouteProtegee roles={ROLES_COURSE}><SuiviCourse /></RouteProtegee>} />
        <Route path="/recu/:id" element={<RouteProtegee roles={ROLES_COURSE}><Recu /></RouteProtegee>} />

        {/* Chauffeur */}
        <Route path="/chauffeur" element={<RouteProtegee roles={['chauffeur']}><Chauffeur /></RouteProtegee>} />

        {/* Back-office */}
        <Route path="/admin" element={<RouteProtegee roles={ROLES_ADMIN}><AdminLayout /></RouteProtegee>}>
          <Route index element={<AccueilAdmin />} />
          <Route path="courses" element={<RouteProtegee roles={DIRECTION}><CoursesAdmin /></RouteProtegee>} />
          <Route path="alertes" element={<Alertes />} />
          <Route path="parametres" element={<RouteProtegee roles={['admin']}><Parametres /></RouteProtegee>} />
          {RESSOURCES.map(([nom, roles]) => (
            <Route key={nom} path={nom} element={<RouteProtegee roles={roles}><RessourceAdmin nom={nom} /></RouteProtegee>} />
          ))}
        </Route>

        <Route path="*" element={<NonTrouve />} />
      </Routes>
    </Suspense>
  )
}
