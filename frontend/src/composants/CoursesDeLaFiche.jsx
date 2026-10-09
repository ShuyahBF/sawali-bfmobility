// ============================================================================
// CoursesDeLaFiche (lot 10) — onglet « Courses » d'une fiche : les courses d'un véhicule, d'un chauffeur ou d'un
// client (filtre vehicule_id / chauffeur_id / client_id de /api/admin/courses), avec un bandeau de totaux
// (nombre de courses, terminées, chiffre d'affaires) puis le tableau (date, n°, trajet, client, chauffeur, prix, statut).
// ============================================================================
import { useEffect, useState } from 'react'
import api, { messageErreur } from '@/lib/api.js'
import { useConfig } from '@/contexte/Config.jsx'
import { useLangue } from '@/i18n/index.jsx'
import { formatDateHeure } from '@/lib/format.js'
import { PastilleStatut } from './StatutCourse.jsx'
import Jauge from './Jauge.jsx'
import Totaux from './Totaux.jsx'

export default function CoursesDeLaFiche({ filtre }) {
  const { t, langue } = useLangue()
  const { monnaie } = useConfig()
  const [courses, setCourses] = useState(null)
  const [erreur, setErreur] = useState('')

  // Lecture des courses de l'objet (300 au plus, les plus récentes d'abord)
  useEffect(() => {
    api.get('/admin/courses', { params: { ...filtre, limite: 300 } })
      .then((r) => setCourses(r.data || []))
      .catch((err) => { setErreur(messageErreur(err)); setCourses([]) })
  }, [JSON.stringify(filtre)])   // eslint-disable-line react-hooks/exhaustive-deps

  if (!courses) return <div className="flex justify-center py-8"><Jauge /></div>
  const terminees = courses.filter((c) => c.statut === 'terminee')
  const chiffre = terminees.reduce((s, c) => s + Number(c.prix_final ?? c.prix_estime ?? 0), 0)
  return (
    <div>
      {erreur && <p className="mb-2 text-sm text-red-600">{erreur}</p>}
      <Totaux elements={[
        { libelle: t('fiche.courses.nombre'), valeur: courses.length },
        { libelle: t('fiche.courses.terminees'), valeur: terminees.length },
        { libelle: t('fiche.courses.chiffre'), valeur: monnaie(chiffre), fort: true },
        { libelle: t('fiche.courses.km'), valeur: `${Math.round(terminees.reduce((s, c) => s + Number(c.distance_km || 0), 0)).toLocaleString(langue)} km` },
      ]} />
      <div className="mt-3 overflow-x-auto rounded-2xl bg-white ring-1 ring-nuit/10">
        <table className="tableau">
          <thead>
            <tr>
              <th>{t('adm.c.date')}</th><th>{t('adm.c.numero')}</th><th>{t('fiche.courses.trajet')}</th>
              <th>{t('fiche.courses.client')}</th><th>{t('adm.c.chauffeur')}</th><th className="text-right">{t('suivi.prix')}</th><th>{t('adm.c.statut')}</th>
            </tr>
          </thead>
          <tbody>
            {courses.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-ardoise">{t('fiche.courses.aucune')}</td></tr>}
            {courses.map((c) => (
              <tr key={c.id}>
                <td className="whitespace-nowrap">{formatDateHeure(c.quand || c.cree_le, langue)}</td>
                <td className="font-mono text-xs">{c.numero}</td>
                <td className="max-w-xs"><span className="line-clamp-2">{c.depart?.adresse}{c.arrivee?.adresse ? ` → ${c.arrivee.adresse}` : ''}</span></td>
                <td>{c.client?.nom || '—'}</td>
                <td>{c.chauffeur?.nom || '—'}</td>
                <td className="text-right tabular-nums">{monnaie(c.prix_final ?? c.prix_estime, c.devise)}</td>
                <td><PastilleStatut statut={c.statut} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
