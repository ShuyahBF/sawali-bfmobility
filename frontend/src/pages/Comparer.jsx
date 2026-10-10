// ============================================================================
// Page « Comparer les véhicules » (lot 20) — adresse « /comparer?ids=a,b,c ».
// Modèle fourni par le propriétaire : jusqu'à 3 véhicules côte à côte, une rubrique par thème (Intérieur, Sièges,
// Écran, Audio, Climatisation, Énergie, Sécurité). En tête de chaque colonne : photo, nom, classe et une liste
// déroulante pour changer de véhicule ; liens « Découvrir » et « Commander ».
// Sans paramètre, les 3 premiers véhicules de la vitrine sont comparés.
// ============================================================================
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import PageSite from '@/composants/MiseEnPage.jsx'
import Jauge from '@/composants/Jauge.jsx'
import FicheTechnique from '@/composants/FicheTechnique.jsx'
import { urlImage } from '@/composants/PhotosVehicule.jsx'
import { useLangue } from '@/i18n/index.jsx'
import api from '@/lib/api.js'

const MAX = 3

export default function Comparer() {
  const { t } = useLangue()
  const [params, setParams] = useSearchParams()
  const [vitrine, setVitrine] = useState(null)     // tous les véhicules photographiés (listes déroulantes)
  const [fiches, setFiches] = useState({})          // fiches complètes déjà lues, par identifiant

  // Véhicules choisis : ceux de l'adresse, sinon les 3 premiers de la vitrine
  const ids = useMemo(() => {
    const demandes = (params.get('ids') || '').split(',').filter(Boolean).slice(0, MAX)
    return demandes.length ? demandes : (vitrine || []).slice(0, MAX).map((v) => v.id)
  }, [params, vitrine])

  // Lecture de la vitrine une seule fois
  useEffect(() => {
    window.scrollTo(0, 0)
    api.get('/public/vehicules').then((r) => setVitrine(r.data || [])).catch(() => setVitrine([]))
  }, [])

  // Lecture des fiches manquantes (une requête par véhicule nouvellement choisi)
  useEffect(() => {
    ids.filter((id) => !fiches[id]).forEach((id) => {
      api.get(`/public/vehicules/${encodeURIComponent(id)}`)
        .then((r) => setFiches((f) => ({ ...f, [id]: r.data })))
        .catch(() => setFiches((f) => ({ ...f, [id]: { introuvable: true } })))
    })
  }, [ids, fiches])

  // Changer le véhicule d'une colonne (ou en ajouter un) : l'adresse est mise à jour (partageable)
  const choisir = (index, id) => {
    const suite = [...ids]
    suite[index] = id
    setParams({ ids: [...new Set(suite.filter(Boolean))].join(',') })
  }

  const prets = ids.map((id) => fiches[id]).filter((f) => f && !f.introuvable)
  const enAttente = !vitrine || ids.some((id) => !fiches[id])

  return (
    <PageSite>
      <section className="mx-auto max-w-6xl px-4 pb-20 pt-8">
        <Link to="/#vehicules" className="lien-action text-sm">{t('fiche.retourVehicules')}</Link>
        <h1 className="mt-4 text-3xl font-bold sm:text-4xl">{t('fiche.comparer')}</h1>

        {enAttente && <div className="flex justify-center py-16"><Jauge taille={44} /></div>}
        {!enAttente && vitrine.length === 0 && <p className="mt-6 text-ardoise">{t('photos.aucune')}</p>}

        {!enAttente && prets.length > 0 && (
          <>
            {/* En-têtes des colonnes : photo, nom, classe, liste de choix, liens */}
            <div className={`mt-8 grid gap-8 ${prets.length === 1 ? 'grid-cols-1' : prets.length === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
              {prets.map((v, i) => {
                const face = v.photos?.[0]
                return (
                  <div key={v.id} className="text-center">
                    {face && <img src={urlImage(face.url)} alt="" className="aspect-[16/10] w-full rounded-3xl object-cover" />}
                    <h2 className="mt-4 text-xl font-bold">{v.marque} {v.modele}</h2>
                    {v.classe && <p className="text-sm text-ardoise">{t('vehicule.classe', { classe: v.classe.nom })}</p>}
                    <select value={v.id} onChange={(e) => choisir(i, e.target.value)} aria-label={t('fiche.changer')}
                            className="mt-2 rounded-full border border-nuit/15 px-3 py-1 text-sm">
                      {vitrine.map((x) => <option key={x.id} value={x.id}>{x.nom}</option>)}
                    </select>
                    <div className="mt-2 flex justify-center gap-6 text-sm">
                      <Link to={`/vehicule/${v.id}`} className="text-nuit/80 underline underline-offset-4 hover:text-nuit">{t('vitrine.decouvrir')}</Link>
                      <Link to="/commander" state={{ categorie: v.categorie }} className="text-nuit/80 underline underline-offset-4 hover:text-nuit">{t('vitrine.commander')}</Link>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Ajouter un véhicule à la comparaison (3 au plus) */}
            {prets.length < MAX && vitrine.length > prets.length && (
              <div className="mt-6 text-center">
                <select value="" onChange={(e) => e.target.value && choisir(prets.length, e.target.value)}
                        className="rounded-full border border-nuit/15 px-3 py-1.5 text-sm">
                  <option value="">{t('fiche.ajouter')}</option>
                  {vitrine.filter((x) => !ids.includes(x.id)).map((x) => <option key={x.id} value={x.id}>{x.nom}</option>)}
                </select>
              </div>
            )}

            <div className="mt-12"><FicheTechnique vehicules={prets} /></div>
          </>
        )}
      </section>
    </PageSite>
  )
}
