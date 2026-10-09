// ============================================================================
// Courses (back-office) : liste filtrée par statut, détail de la course
// sélectionnée et affectation manuelle d'un chauffeur. Rafraîchi toutes les 15 s.
// ============================================================================
import { useCallback, useEffect, useState } from 'react'
import Carte from '@/composants/Carte.jsx'
import Modale from '@/composants/Modale.jsx'
import Jauge from '@/composants/Jauge.jsx'
import { FriseStatuts, PastilleStatut } from '@/composants/StatutCourse.jsx'
import { useToasts } from '@/composants/Toasts.jsx'
import { useConfig } from '@/contexte/Config.jsx'
import { useLangue } from '@/i18n/index.jsx'
import api, { messageErreur } from '@/lib/api.js'
import { formatDateHeure } from '@/lib/format.js'

const STATUTS = ['planifiee', 'recherche', 'acceptee', 'en_approche', 'arrivee', 'en_cours', 'terminee', 'annulee']
// Statuts où une (ré)affectation a encore du sens
const AFFECTABLES = ['planifiee', 'recherche', 'acceptee']

export default function CoursesAdmin() {
  const { t } = useLangue()
  const { monnaie, distance } = useConfig()
  const toast = useToasts()
  const [statut, setStatut] = useState('')
  const [courses, setCourses] = useState(null)
  const [selection, setSelection] = useState(null)
  const [chauffeurs, setChauffeurs] = useState([])
  const [affecter, setAffecter] = useState(false)
  const [chauffeurId, setChauffeurId] = useState('')

  // Lecture de la liste
  const charger = useCallback(async (silencieux) => {
    try {
      const appel = api.get('/admin/courses', { params: statut ? { statut } : {} })
      const { data } = silencieux ? await appel : await toast.attente(appel)
      setCourses(Array.isArray(data) ? data : [])
    } catch (err) {
      if (!silencieux) { toast.erreur(messageErreur(err)); setCourses([]) }
    }
  }, [statut, toast])

  useEffect(() => {
    charger(false)
    const m = setInterval(() => charger(true), 15000)
    return () => clearInterval(m)
  }, [charger])

  // Ouverture de la fenêtre d'affectation : liste des chauffeurs actifs
  const ouvrirAffectation = async () => {
    try {
      const { data } = await toast.attente(api.get('/admin/utilisateurs', { params: { role: 'chauffeur', limite: 500 } }))
      setChauffeurs((Array.isArray(data) ? data : []).filter((u) => u.role === 'chauffeur' && u.actif !== false))
      setChauffeurId('')
      setAffecter(true)
    } catch (err) {
      toast.erreur(messageErreur(err))
    }
  }

  // Affectation du chauffeur choisi
  const validerAffectation = async () => {
    try {
      await toast.attente(api.post(`/admin/courses/${selection.id}/affecter`, { chauffeur_id: Number.isNaN(Number(chauffeurId)) ? chauffeurId : Number(chauffeurId) }))
      toast.succes('Chauffeur affecté.')
      setAffecter(false)
      charger(true)
    } catch (err) {
      toast.erreur(messageErreur(err))
    }
  }

  // La course sélectionnée, à jour avec la dernière liste
  const c = courses?.find((x) => x.id === selection?.id) || null

  return (
    <div>
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Courses</h1>
          <p className="text-sm text-ardoise">Cliquez sur une course pour voir le détail et affecter un chauffeur.</p>
        </div>
        <select value={statut} onChange={(e) => setStatut(e.target.value)} className="champ w-auto" aria-label="Statut">
          <option value="">Tous les statuts</option>
          {STATUTS.map((s) => <option key={s} value={s}>{t(`statut.${s}`)}</option>)}
        </select>
      </header>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        {/* Liste */}
        <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-nuit/10">
          <table className="tableau">
            <thead>
              <tr><th>N°</th><th>Date</th><th>Client</th><th>Catégorie</th><th>Chauffeur</th><th className="text-right">Prix</th><th>Statut</th></tr>
            </thead>
            <tbody>
              {courses === null && <tr><td colSpan={7} className="py-10 text-center"><span className="inline-block"><Jauge /></span></td></tr>}
              {courses?.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-ardoise">Aucune course.</td></tr>}
              {courses?.map((x) => (
                <tr key={x.id} aria-selected={x.id === c?.id} onClick={() => setSelection(x)} className="cursor-pointer">
                  <td className="font-mono font-bold">{x.numero}</td>
                  <td className="whitespace-nowrap">{formatDateHeure(x.quand || x.cree_le)}</td>
                  <td>{x.client?.nom}</td>
                  <td>{x.categorie}</td>
                  <td>{x.chauffeur?.nom || <span className="text-ardoise">—</span>}</td>
                  <td className="text-right tabular-nums">{monnaie(x.prix_final ?? x.prix_estime, x.devise)}</td>
                  <td><PastilleStatut statut={x.statut} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Détail */}
        <aside className="surface h-fit space-y-4 xl:sticky xl:top-6">
          {!c && <p className="text-ardoise">Sélectionnez une course dans la liste.</p>}
          {c && (
            <>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xl font-bold">{c.numero}</h2>
                <PastilleStatut statut={c.statut} />
              </div>
              <Carte depart={c.depart} arrivee={c.arrivee} chauffeur={c.chauffeur?.position} hauteur="h-56" />
              <div className="space-y-1 text-sm">
                <p className="truncate"><b className="text-volt-700">A</b> {c.depart?.adresse}</p>
                {c.arrivee && <p className="truncate"><b className="text-ambre-600">B</b> {c.arrivee.adresse}</p>}
                <p className="text-ardoise">{t(`cmd.mode.${c.mode}`)}{c.distance_km ? ` — ${distance(c.distance_km)}` : ''} — {t(`cmd.${c.paiement?.moyen}`)} ({t(`paiement.${c.paiement?.statut || 'non_paye'}`)})</p>
                <p>Client : <b>{c.client?.nom}</b> {c.client?.telephone && <a href={`tel:${c.client.telephone}`} className="text-nuit-600 underline">{c.client.telephone}</a>}</p>
                {c.chauffeur && <p>Chauffeur : <b>{c.chauffeur.nom}</b> {c.chauffeur.telephone && <a href={`tel:${c.chauffeur.telephone}`} className="text-nuit-600 underline">{c.chauffeur.telephone}</a>}</p>}
                {c.vehicule && <p>Véhicule : {c.vehicule.marque} {c.vehicule.modele} <span className="font-mono">{c.vehicule.immatriculation}</span></p>}
                {c.note_client && <p className="rounded-xl bg-ambre-50 p-2">« {c.note_client} »</p>}
              </div>
              <FriseStatuts course={c} />
              {AFFECTABLES.includes(c.statut) && (
                <button type="button" onClick={ouvrirAffectation} className="btn-principal w-full">{c.chauffeur ? 'Changer de chauffeur' : 'Affecter un chauffeur'}</button>
              )}
            </>
          )}
        </aside>
      </div>

      {/* Choix du chauffeur */}
      <Modale titre="Affecter un chauffeur" ouverte={affecter} onFermer={() => setAffecter(false)}>
        <ul className="max-h-80 space-y-1 overflow-y-auto">
          {chauffeurs.length === 0 && <li className="text-ardoise">Aucun chauffeur actif.</li>}
          {chauffeurs.map((u) => (
            <li key={u.id}>
              <label className={`flex cursor-pointer items-center gap-3 rounded-xl p-3 ring-1 ${String(chauffeurId) === String(u.id) ? 'bg-volt-50 ring-volt-500' : 'ring-nuit/10'}`}>
                <input type="radio" name="chauffeur" value={u.id} checked={String(chauffeurId) === String(u.id)} onChange={() => setChauffeurId(u.id)} className="accent-volt-600" />
                <span className="flex-1 font-bold">{u.nom}</span>
                <span className={`text-xs font-bold ${u.chauffeur?.en_ligne ? 'text-volt-700' : 'text-ardoise'}`}>{u.chauffeur?.en_ligne ? 'En ligne' : 'Hors ligne'}</span>
              </label>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={() => setAffecter(false)} className="btn-secondaire">Annuler</button>
          <button type="button" disabled={!chauffeurId} onClick={validerAffectation} className="btn-principal">Affecter</button>
        </div>
      </Modale>
    </div>
  )
}
