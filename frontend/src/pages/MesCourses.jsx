// ============================================================================
// Liste des courses du client connecté (GET /courses/mes)
// ============================================================================
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PageSite from '@/composants/MiseEnPage.jsx'
import { PastilleStatut } from '@/composants/StatutCourse.jsx'
import Jauge from '@/composants/Jauge.jsx'
import { useToasts } from '@/composants/Toasts.jsx'
import { useConfig } from '@/contexte/Config.jsx'
import { useLangue } from '@/i18n/index.jsx'
import api, { messageErreur } from '@/lib/api.js'
import { formatDateHeure } from '@/lib/format.js'

export default function MesCourses() {
  const { t, langue } = useLangue()
  const { monnaie } = useConfig()
  const toast = useToasts()
  const [courses, setCourses] = useState(null)

  // Chargement de la liste sous « Patientez… »
  useEffect(() => {
    toast.attente(api.get('/courses/mes'))
      .then(({ data }) => setCourses(Array.isArray(data) ? data : []))
      .catch((err) => { toast.erreur(messageErreur(err)); setCourses([]) })
  }, [toast])

  return (
    <PageSite>
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-3xl font-bold">{t('courses.titre')}</h1>
          <Link to="/commander" className="btn-principal">{t('nav.commander')}</Link>
        </div>
        {courses === null && <div className="mt-10 flex justify-center"><Jauge taille={48} /></div>}
        {courses?.length === 0 && (
          <div className="surface mt-6 text-center">
            <p className="text-ardoise">{t('courses.vide')}</p>
          </div>
        )}
        <ul className="mt-6 space-y-3">
          {courses?.map((c) => (
            <li key={c.id}>
              <Link to={`/courses/${c.id}`} className="block rounded-2xl bg-white p-4 ring-1 ring-nuit/10 transition hover:ring-nuit/30">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-display font-bold">{c.numero}</span>
                  <PastilleStatut statut={c.statut} />
                </div>
                <p className="mt-2 truncate text-sm"><b className="text-volt-700">A</b> {c.depart?.adresse || '—'}</p>
                {c.arrivee && <p className="truncate text-sm"><b className="text-ambre-600">B</b> {c.arrivee.adresse}</p>}
                <div className="mt-2 flex justify-between text-sm text-ardoise">
                  <span>{formatDateHeure(c.quand || c.cree_le, langue)}</span>
                  <span className="font-bold tabular-nums text-nuit">{monnaie(c.prix_final ?? c.prix_estime, c.devise)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </PageSite>
  )
}
