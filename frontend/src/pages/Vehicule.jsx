// ============================================================================
// Page publique d'un véhicule (lot 16) — adresse « /vehicule/:id ».
// Demande du propriétaire (10/10/2026) : « les photos des véhicules à côté des tarifs ; l'utilisateur peut cliquer
// sur un lien ou pictogramme pour afficher la page du véhicule (photos, descriptions, classe, etc.) ».
//
//   - grande photo + vignettes ; clic → visionneuse plein écran (zoom, glisser, flèches), la même que la galerie ;
//   - nom, énergie, disponibilité, description saisie dans le back-office (fiche véhicule → « Description ») ;
//   - caractéristiques (couleur, places, autonomie, confort) ;
//   - classe (catégorie) du véhicule avec ses tarifs, bouton « Commander dans cette classe » ;
//   - retour au tableau des tarifs.
// Aucune immatriculation ni aucun document n'est affiché (le serveur ne les envoie pas).
// ============================================================================
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import PageSite from '@/composants/MiseEnPage.jsx'
import Jauge from '@/composants/Jauge.jsx'
import BadgeEnergie from '@/composants/BadgeEnergie.jsx'
import GalerieVehicules, { Visionneuse } from '@/composants/GalerieVehicules.jsx'
import { urlImage } from '@/composants/PhotosVehicule.jsx'
import { useConfig } from '@/contexte/Config.jsx'
import { useLangue } from '@/i18n/index.jsx'
import api from '@/lib/api.js'

export default function Vehicule() {
  const { id } = useParams()
  const { t } = useLangue()
  const { monnaie } = useConfig()
  const [v, setV] = useState(null)              // fiche du véhicule (null = lecture en cours)
  const [introuvable, setIntrouvable] = useState(false)
  const [photo, setPhoto] = useState(0)         // photo affichée en grand
  const [zoom, setZoom] = useState(false)       // visionneuse plein écran ouverte
  const [galerie, setGalerie] = useState(false) // autres véhicules de la classe

  // Lecture de la fiche à l'ouverture (et quand on passe d'un véhicule à un autre)
  useEffect(() => {
    setV(null); setIntrouvable(false); setPhoto(0)
    window.scrollTo(0, 0)   // la page s'ouvre en haut (on arrive souvent du bas de l'accueil)
    api.get(`/public/vehicules/${encodeURIComponent(id)}`)
      .then((r) => setV(r.data))
      .catch(() => setIntrouvable(true))
  }, [id])

  // Lien de retour vers le tableau des tarifs de l'accueil
  const retour = <Link to="/#tarifs" className="lien-action text-sm">{t('vehicule.retourTarifs')}</Link>

  if (introuvable) {
    return (
      <PageSite>
        <section className="mx-auto max-w-3xl px-4 py-20 text-center">
          <p className="text-lg text-ardoise">{t('vehicule.introuvable')}</p>
          <div className="mt-6">{retour}</div>
        </section>
      </PageSite>
    )
  }
  if (!v) {
    // Attente : jauge circulaire (règle « Patientez… »)
    return <PageSite><div className="flex justify-center py-24"><Jauge taille={48} /></div></PageSite>
  }

  const nom = `${v.marque} ${v.modele}${v.annee ? ` (${v.annee})` : ''}`
  const classe = v.classe
  const enGrand = v.photos[photo]
  // Caractéristiques affichées seulement si elles sont renseignées
  const caracteristiques = [
    [t('vehicule.energie'), <BadgeEnergie key="e" energie={v.energie} />],
    v.couleur && [t('vehicule.couleur'), v.couleur],
    v.places && [t('vehicule.places'), v.places],
    v.autonomie_km && v.energie !== 'thermique' && [t('vehicule.autonomie'), `${v.autonomie_km} km`],
    v.confort?.length > 0 && [t('vehicule.confort'), v.confort.join(', ')],
  ].filter(Boolean)

  return (
    <PageSite>
      <section className="mx-auto max-w-6xl px-4 pb-20 pt-8">
        {retour}
        <div className="mt-6 grid gap-10 lg:grid-cols-[1.4fr_1fr]">
          {/* ---------- Photos ---------- */}
          <div>
            {enGrand ? (
              <button type="button" onClick={() => setZoom(true)}
                      className="block w-full overflow-hidden rounded-3xl ring-1 ring-nuit/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-nuit"
                      aria-label={`${nom} — ${t(`photos.vue.${enGrand.vue}`)}`}>
                <img src={urlImage(enGrand.url)} alt={t(`photos.vue.${enGrand.vue}`)} className="aspect-[4/3] w-full cursor-zoom-in object-cover" />
              </button>
            ) : (
              <div className="grid aspect-[4/3] place-items-center rounded-3xl bg-brume text-ardoise">{t('vehicule.sansPhoto')}</div>
            )}
            {/* Vignettes : changer la photo affichée en grand */}
            {v.photos.length > 1 && (
              <div className="mt-3 grid grid-cols-4 gap-2">
                {v.photos.map((p, i) => (
                  <button key={p.vue} type="button" onClick={() => setPhoto(i)}
                          className={`overflow-hidden rounded-xl ring-2 ${i === photo ? 'ring-nuit' : 'ring-transparent opacity-75 hover:opacity-100'}`}
                          aria-label={t(`photos.vue.${p.vue}`)}>
                    <img src={urlImage(p.url)} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ---------- Fiche ---------- */}
          <div>
            {classe && <p className="text-sm font-bold text-ardoise">{t('vehicule.classe', { classe: classe.nom })}</p>}
            <h1 className="mt-1 text-3xl font-bold sm:text-4xl">{nom}</h1>
            <span className={`mt-3 inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${v.disponible ? 'bg-volt-100 text-nuit' : 'bg-brume text-ardoise'}`}>
              {v.disponible ? t('photos.disponible') : t('photos.occupe')}
            </span>
            {v.description && <p className="mt-5 whitespace-pre-line leading-relaxed text-nuit/85">{v.description}</p>}

            {/* Caractéristiques */}
            <h2 className="mt-8 text-lg font-bold">{t('vehicule.caracteristiques')}</h2>
            <dl className="mt-2 divide-y divide-nuit/10 border-y border-nuit/10 text-sm">
              {caracteristiques.map(([libelle, valeur]) => (
                <div key={libelle} className="flex items-center justify-between gap-4 py-2">
                  <dt className="text-ardoise">{libelle}</dt><dd className="text-right font-bold">{valeur}</dd>
                </div>
              ))}
            </dl>

            {/* Classe et tarifs */}
            {classe && (
              <>
                <h2 className="mt-8 text-lg font-bold">{t('vehicule.tarifs')}</h2>
                <p className="mt-2 font-display text-3xl font-bold tabular-nums">
                  {monnaie(classe.prix_km)}<span className="ml-1 font-sans text-base font-normal text-ardoise">/ {t('accueil.parKm')}</span>
                </p>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-0.5 text-sm">
                  <dt className="text-ardoise">{t('accueil.parHeure')}</dt><dd className="text-right font-bold tabular-nums">{monnaie(classe.prix_heure)}</dd>
                  <dt className="text-ardoise">{t('accueil.parJour')}</dt><dd className="text-right font-bold tabular-nums">{monnaie(classe.prix_jour)}</dd>
                  <dt className="text-ardoise">{t('accueil.priseEnCharge')}</dt><dd className="text-right tabular-nums">{monnaie(classe.prise_en_charge)}</dd>
                </dl>
              </>
            )}

            {/* Actions : commander dans la classe, voir les autres véhicules */}
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/commander" state={{ categorie: v.categorie }} className="btn-principal">{t('vehicule.commander')}</Link>
              {classe && <button type="button" onClick={() => setGalerie(true)} className="btn-secondaire">{t('vehicule.autres')}</button>}
            </div>
          </div>
        </div>
      </section>

      {zoom && enGrand && <Visionneuse titre={nom} photos={v.photos} indexDepart={photo} onFermer={() => setZoom(false)} />}
      {classe && <GalerieVehicules categorie={classe} ouverte={galerie} onFermer={() => setGalerie(false)} />}
    </PageSite>
  )
}
