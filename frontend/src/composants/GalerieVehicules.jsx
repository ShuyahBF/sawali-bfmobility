// ============================================================================
// GalerieVehicules (lot 9) — portail public : photos des véhicules d'une catégorie.
// Demande du propriétaire : « un utilisateur peut visionner les photos, zoomer et revenir faire sa sélection ».
//
//   - fenêtre « Véhicules <catégorie> » : une fiche par véhicule (marque, modèle, couleur, énergie, places,
//     confort, disponible ou en course) avec ses vignettes (vue de face, cabine avant, cabine arrière, coffre) ;
//   - clic sur une vignette → VISIONNEUSE plein écran : zoom (boutons + / −, molette, double-clic, pincement à deux
//     doigts), déplacement de l'image zoomée en la faisant glisser, photo précédente / suivante (flèches du
//     clavier aussi), « ← Retour à la sélection » (ou Échap) ;
//   - la galerie se ferme sur la page d'où elle a été ouverte (accueil ou commande) : le choix en cours est gardé.
// Aucune immatriculation n'est affichée (le serveur ne l'envoie pas).
// ============================================================================
import { useCallback, useEffect, useRef, useState } from 'react'
import api, { messageErreur } from '@/lib/api.js'
import { urlImage } from './PhotosVehicule.jsx'
import Modale from './Modale.jsx'
import Jauge from './Jauge.jsx'
import BadgeEnergie from './BadgeEnergie.jsx'
import { useLangue } from '@/i18n/index.jsx'

const ZOOM_MIN = 1
const ZOOM_MAX = 5

// ---------------------------------------------------------------------------- Visionneuse plein écran
export function Visionneuse(   // lot 16 : réutilisée par la page du véhicule
{ titre, photos, indexDepart, onFermer }) {
  const { t } = useLangue()
  const [index, setIndex] = useState(indexDepart)
  const [zoom, setZoom] = useState(1)
  const [decalage, setDecalage] = useState({ x: 0, y: 0 })
  const glisse = useRef(null)            // départ d'un glisser (souris ou doigt)
  const doigts = useRef(new Map())       // pointeurs actifs (pincement à deux doigts)
  const ecartDepart = useRef(null)
  const boutonRetour = useRef(null)

  const photo = photos[index]
  // Nouveau zoom borné ; revenir à 1 recentre l'image
  const changerZoom = useCallback((z) => {
    const borne = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z))
    setZoom(borne)
    if (borne === 1) setDecalage({ x: 0, y: 0 })
  }, [])
  const aller = useCallback((pas) => {
    setIndex((i) => (i + pas + photos.length) % photos.length)
    setZoom(1); setDecalage({ x: 0, y: 0 })
  }, [photos.length])

  // Clavier : Échap = retour, flèches = photo précédente / suivante, + / − = zoom
  useEffect(() => {
    const surTouche = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onFermer() }
      else if (e.key === 'ArrowRight') aller(1)
      else if (e.key === 'ArrowLeft') aller(-1)
      else if (e.key === '+' || e.key === '=') changerZoom(zoom + 0.5)
      else if (e.key === '-') changerZoom(zoom - 0.5)
    }
    window.addEventListener('keydown', surTouche, true)
    return () => window.removeEventListener('keydown', surTouche, true)
  }, [aller, changerZoom, onFermer, zoom])
  useEffect(() => { boutonRetour.current?.focus() }, [])

  // Molette : zoom progressif
  const surMolette = (e) => changerZoom(zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15))

  // Pointeurs : glisser (image zoomée) et pincement à deux doigts
  const surPointeurBas = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId)
    doigts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (doigts.current.size === 2) {
      const [a, b] = [...doigts.current.values()]
      ecartDepart.current = { ecart: Math.hypot(a.x - b.x, a.y - b.y), zoom }
      glisse.current = null
    } else {
      glisse.current = { x: e.clientX - decalage.x, y: e.clientY - decalage.y }
    }
  }
  const surPointeurDeplace = (e) => {
    if (!doigts.current.has(e.pointerId)) return
    doigts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (doigts.current.size === 2 && ecartDepart.current) {
      const [a, b] = [...doigts.current.values()]
      changerZoom(ecartDepart.current.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / ecartDepart.current.ecart))
    } else if (glisse.current && zoom > 1) {
      setDecalage({ x: e.clientX - glisse.current.x, y: e.clientY - glisse.current.y })
    }
  }
  const surPointeurHaut = (e) => {
    doigts.current.delete(e.pointerId)
    if (doigts.current.size < 2) ecartDepart.current = null
    if (doigts.current.size === 0) glisse.current = null
  }

  const bouton = 'grid h-11 w-11 place-items-center rounded-full bg-white/10 text-xl font-bold text-white hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-volt-400'
  return (
    <div className="fixed inset-0 z-[1100] flex flex-col bg-nuit-900/95 text-white" role="dialog" aria-modal="true" aria-label={titre}>
      {/* Barre du haut : retour, titre, vue */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button ref={boutonRetour} type="button" onClick={onFermer} className="btn-principal px-4 py-2 text-sm">{t('photos.retour')}</button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display font-bold">{titre}</p>
          <p className="text-sm text-white/70">{photo.libelle ? t(`photos.vue.${photo.vue}`) : ''} · {index + 1} / {photos.length}</p>
        </div>
      </div>

      {/* Image (zoom + déplacement) */}
      <div
        className="relative flex-1 touch-none select-none overflow-hidden"
        onWheel={surMolette}
        onDoubleClick={() => changerZoom(zoom > 1 ? 1 : 2.5)}
        onPointerDown={surPointeurBas}
        onPointerMove={surPointeurDeplace}
        onPointerUp={surPointeurHaut}
        onPointerCancel={surPointeurHaut}
        style={{ cursor: zoom > 1 ? 'grab' : 'zoom-in' }}
      >
        <img
          src={urlImage(photo.url)}
          alt={t(`photos.vue.${photo.vue}`)}
          draggable={false}
          className="absolute left-1/2 top-1/2 max-h-full max-w-full transition-transform duration-75"
          style={{ transform: `translate(calc(-50% + ${decalage.x}px), calc(-50% + ${decalage.y}px)) scale(${zoom})` }}
        />
        {photos.length > 1 && (
          <>
            <button type="button" onClick={() => aller(-1)} className={`${bouton} absolute left-3 top-1/2 -translate-y-1/2`} aria-label={t('photos.precedente')}>‹</button>
            <button type="button" onClick={() => aller(1)} className={`${bouton} absolute right-3 top-1/2 -translate-y-1/2`} aria-label={t('photos.suivante')}>›</button>
          </>
        )}
      </div>

      {/* Barre du bas : zoom et vignettes */}
      <div className="flex flex-wrap items-center justify-center gap-3 px-4 py-3">
        <button type="button" onClick={() => changerZoom(zoom - 0.5)} className={bouton} aria-label={t('photos.zoomMoins')}>−</button>
        <span className="w-14 text-center text-sm tabular-nums">{Math.round(zoom * 100)} %</span>
        <button type="button" onClick={() => changerZoom(zoom + 0.5)} className={bouton} aria-label={t('photos.zoomPlus')}>+</button>
        <div className="mx-2 flex gap-2">
          {photos.map((p, i) => (
            <button key={p.vue} type="button" onClick={() => { setIndex(i); changerZoom(1) }}
                    className={`h-12 w-16 overflow-hidden rounded-lg ring-2 ${i === index ? 'ring-volt-400' : 'ring-transparent opacity-70 hover:opacity-100'}`}
                    aria-label={t(`photos.vue.${p.vue}`)}>
              <img src={urlImage(p.url)} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
        <p className="w-full text-center text-xs text-white/60">{t('photos.aide')}</p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------- Galerie d'une catégorie
export default function GalerieVehicules({ categorie, ouverte, onFermer }) {
  const { t } = useLangue()
  const [vehicules, setVehicules] = useState(null)
  const [erreur, setErreur] = useState('')
  const [visionneuse, setVisionneuse] = useState(null)   // { vehicule, index }

  // Lecture des véhicules de la catégorie à l'ouverture
  useEffect(() => {
    if (!ouverte || !categorie) return
    setVehicules(null); setErreur('')
    api.get(`/public/categories/${encodeURIComponent(categorie.code)}/vehicules`)
      .then((r) => setVehicules(r.data || []))
      .catch((err) => { setErreur(messageErreur(err)); setVehicules([]) })
  }, [ouverte, categorie])

  const nom = (v) => `${v.marque} ${v.modele}${v.annee ? ` (${v.annee})` : ''}`
  return (
    <>
      <Modale titre={t('photos.titre', { categorie: categorie?.nom || '' })} ouverte={ouverte && !visionneuse} onFermer={onFermer} large>
        {!vehicules && <div className="flex justify-center py-8"><Jauge taille={44} /></div>}
        {erreur && <p className="text-sm text-red-600">{erreur}</p>}
        {vehicules && vehicules.length === 0 && !erreur && <p className="py-6 text-center text-ardoise">{t('photos.aucune')}</p>}
        <ul className="space-y-6">
          {(vehicules || []).map((v) => (
            <li key={v.id}>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h3 className="font-display text-lg font-bold text-nuit">{nom(v)}</h3>
                <BadgeEnergie energie={v.energie} />
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${v.disponible ? 'bg-volt-100 text-nuit' : 'bg-brume text-ardoise'}`}>
                  {v.disponible ? t('photos.disponible') : t('photos.occupe')}
                </span>
              </div>
              <p className="mb-2 text-sm text-ardoise">
                {[v.couleur, v.places ? t('accueil.places', { n: v.places }) : '', (v.confort || []).join(', ')].filter(Boolean).join(' · ')}
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {v.photos.map((p, i) => (
                  <button key={p.vue} type="button" onClick={() => setVisionneuse({ vehicule: v, index: i })}
                          className="group overflow-hidden rounded-2xl text-left ring-1 ring-nuit/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-nuit">
                    <img src={urlImage(p.url)} alt={t(`photos.vue.${p.vue}`)} loading="lazy"
                         className="aspect-[4/3] w-full object-cover transition group-hover:scale-[1.03]" />
                    <span className="block px-2 py-1.5 text-xs font-bold text-nuit">{t(`photos.vue.${p.vue}`)}</span>
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-6 flex justify-end">
          <button type="button" onClick={onFermer} className="btn-principal">{t('photos.retourChoix')}</button>
        </div>
      </Modale>
      {visionneuse && (
        <Visionneuse
          titre={nom(visionneuse.vehicule)}
          photos={visionneuse.vehicule.photos}
          indexDepart={visionneuse.index}
          onFermer={() => setVisionneuse(null)}
        />
      )}
    </>
  )
}
