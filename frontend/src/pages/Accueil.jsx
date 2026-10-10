// ============================================================================
// Page d'accueil (vitrine) : héros + simulateur de prix, catégories et tarifs,
// location avec chauffeur, avantages, « Devenez chauffeur ».
// ============================================================================
import { useEffect, useState } from 'react'   // lot 9 : ouverture de la galerie ; lot 16 : retour sur « #tarifs »
import { Link, useLocation } from 'react-router-dom'
import PageSite from '@/composants/MiseEnPage.jsx'
import Simulateur from '@/composants/Simulateur.jsx'
import BadgeEnergie from '@/composants/BadgeEnergie.jsx'
import { useConfig } from '@/contexte/Config.jsx'
import api from '@/lib/api.js'   // lot 19 : galerie « Nos véhicules »
import GalerieVehicules from '@/composants/GalerieVehicules.jsx'   // lot 9 : photos des véhicules
import { urlImage } from '@/composants/PhotosVehicule.jsx'          // lot 16 : vignettes à côté des tarifs
import { useLangue } from '@/i18n/index.jsx'

// Fond du héros : plan de ville stylisé (rues de Ouaga vues d'en haut) + trajet A → B tracé une seule fois
// au chargement. Refonte 09/10/2026 : trajet jaune soleil, arrivée fuchsia, halo de lumière derrière le billet.
function PlanVille() {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        {/* Halo chaud derrière le simulateur (lumière de fin de journée) */}
        <radialGradient id="halo" cx="0.78" cy="0.45" r="0.5">
          <stop offset="0" stopColor="#3D3690" stopOpacity="0.9" />
          <stop offset="1" stopColor="#1A1650" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1200" height="700" fill="url(#halo)" />
      {/* Grandes avenues (traits épais) et rues (traits fins), très discrètes */}
      <g stroke="#ffffff" strokeOpacity="0.07" strokeWidth="14" fill="none" strokeLinecap="round">
        <path d="M-20 120 C300 90 520 160 1220 110" />
        <path d="M-20 330 C260 300 640 380 1220 300" />
        <path d="M-20 560 C400 520 700 600 1220 540" />
        <path d="M180 -20 C150 250 240 450 200 720" />
        <path d="M520 -20 C560 220 470 470 540 720" />
        <path d="M880 -20 C840 260 930 420 900 720" />
      </g>
      <g stroke="#ffffff" strokeOpacity="0.04" strokeWidth="3" fill="none">
        <path d="M-20 220 L1220 240" /><path d="M-20 450 L1220 430" /><path d="M360 -20 L330 720" /><path d="M720 -20 L760 720" /><path d="M1060 -20 L1040 720" />
        <path d="M-20 40 L1220 60" /><path d="M-20 650 L1220 630" /><path d="M60 -20 L90 720" />
      </g>
      {/* Trajet : ruban jaune qui se dessine (la seule animation de la page), à droite derrière le billet */}
      <path
        d="M640 690 C700 600 640 520 760 470 S1020 420 1060 300 S1080 160 1100 120"
        fill="none" stroke="#FFC629" strokeWidth="7" strokeLinecap="round"
        pathLength="1" strokeDasharray="1" className="animate-trace motion-reduce:animate-none"
        style={{ strokeDashoffset: 1 }}
      />
      {/* Points A (départ, jaune) et B (arrivée, fuchsia) */}
      <circle cx="640" cy="690" r="15" fill="#FFC629" /><circle cx="640" cy="690" r="5" fill="#1A1650" />
      <circle cx="1100" cy="120" r="15" fill="#D62B63" /><circle cx="1100" cy="120" r="5" fill="#ffffff" />
    </svg>
  )
}

// Lot 16 — vignettes des véhicules d'une catégorie (au plus 3, disponibles d'abord), chacune liée à la page du véhicule
function VignettesVehicules({ apercu }) {
  const { t } = useLangue()
  if (!apercu || apercu.length === 0) return <div className="hidden md:block" aria-hidden="true" />
  return (
    <ul className="flex gap-2">
      {apercu.map((v) => (
        <li key={v.id}>
          <Link
            to={`/vehicule/${v.id}`}
            title={`${v.nom} — ${t('vehicule.voirPage')}`}
            aria-label={`${v.nom} — ${t('vehicule.voirPage')}`}
            className="relative block h-16 w-20 overflow-hidden rounded-xl ring-1 ring-nuit/10 transition hover:ring-2 hover:ring-nuit focus-visible:outline focus-visible:outline-2 focus-visible:outline-nuit"
          >
            <img src={urlImage(v.photo_url)} alt="" loading="lazy" className="h-full w-full object-cover" />
            {/* Pictogramme « ouvrir la page » dans le coin */}
            <span aria-hidden="true" className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-white/90 text-[11px] font-bold text-nuit shadow">↗</span>
            {/* Petit point vert : véhicule disponible maintenant */}
            {v.disponible && <span aria-hidden="true" className="absolute bottom-1 left-1 h-2.5 w-2.5 rounded-full bg-volt-500 ring-2 ring-white" />}
          </Link>
        </li>
      ))}
    </ul>
  )
}

// Ligne d'une catégorie (tarifs publics) — refonte 09/10/2026 : une LIGNE par catégorie pour comparer d'un coup d'œil
// (nom et énergies | prix au km en grand | heure, jour, prise en charge | disponibilité et bouton « Choisir »)
function LigneCategorie({ cat }) {
  const { t } = useLangue()
  const { monnaie } = useConfig()
  const [galerie, setGalerie] = useState(false)   // lot 9 : photos des véhicules de la catégorie
  return (
    <li className="group grid gap-4 py-6 md:grid-cols-[1.2fr_auto_1fr_1.1fr_auto] md:items-center md:gap-6 lg:gap-8">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-xl font-bold sm:text-2xl">{cat.nom}</h3>
          {/* Promotion en cours */}
          {cat.promo_active && cat.promo && (
            <span className="rounded-full bg-ambre-500 px-2.5 py-0.5 text-xs font-bold text-white">
              −{cat.promo.pourcentage} % {cat.promo.libelle || ''}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-ardoise">{cat.description}</p>
        <div className="mt-2 flex flex-wrap gap-1">{(cat.energies || []).map((e) => <BadgeEnergie key={e} energie={e} />)}</div>
      </div>
      {/* Lot 16 — photos des véhicules À CÔTÉ des tarifs : chaque vignette (avec le pictogramme ↗) ouvre la page du
          véhicule (photos, description, classe, caractéristiques). Sans photo : la colonne reste vide. */}
      <VignettesVehicules apercu={cat.apercu_vehicules} />
      {/* Prix principal : au km */}
      <p className="font-display text-3xl font-bold tabular-nums sm:text-4xl">
        {monnaie(cat.prix_km)}<span className="ml-1 font-sans text-base font-normal text-ardoise">/ {t('accueil.parKm')}</span>
      </p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-sm">
        <dt className="text-ardoise">{t('accueil.parHeure')}</dt><dd className="text-right font-bold tabular-nums">{monnaie(cat.prix_heure)}</dd>
        <dt className="text-ardoise">{t('accueil.parJour')}</dt><dd className="text-right font-bold tabular-nums">{monnaie(cat.prix_jour)}</dd>
        <dt className="text-ardoise">{t('accueil.priseEnCharge')}</dt><dd className="text-right tabular-nums">{monnaie(cat.prise_en_charge)}</dd>
        <dt className="text-ardoise">{t('accueil.places', { n: cat.places })}</dt>
        <dd className={`text-right font-bold ${cat.vehicules_disponibles ? 'text-nuit' : 'text-ardoise'}`}>
          {cat.vehicules_disponibles ? t('accueil.dispo', { n: cat.vehicules_disponibles }) : t('accueil.aucunDispo')}
        </dd>
      </dl>
      <div className="flex flex-wrap gap-2 justify-self-start md:flex-col md:items-end md:justify-self-end">
        <Link to="/commander" state={{ categorie: cat.code }} className="btn-secondaire">
          {t('accueil.cta')}
        </Link>
        {/* Lot 9 — photos des véhicules (zoom), puis retour au choix */}
        <button type="button" onClick={() => setGalerie(true)} className="lien-action text-sm">📷 {t('photos.voir')}</button>
      </div>
      <GalerieVehicules categorie={cat} ouverte={galerie} onFermer={() => setGalerie(false)} />
    </li>
  )
}

// Lot 19 — galerie « Nos véhicules » façon vitrine (modèle fourni par le propriétaire) : une carte par véhicule,
// grande photo, nom centré, puis deux liens « Découvrir » (page du véhicule) et « Commander » (dans sa classe).
// La section n'apparaît que si au moins un véhicule a une photo.
function NosVehicules() {
  const { t } = useLangue()
  const [vehicules, setVehicules] = useState([])
  useEffect(() => {
    api.get('/public/vehicules').then((r) => setVehicules(r.data || [])).catch(() => setVehicules([]))
  }, [])
  if (vehicules.length === 0) return null
  return (
    <section id="vehicules" className="mx-auto max-w-6xl scroll-mt-20 px-4 pt-20">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-3xl font-bold sm:text-[2.6rem]">{t('vitrine.titre')}</h2>
        {/* Lot 20 — comparaison des fiches techniques */}
        {vehicules.length > 1 && <Link to="/comparer" className="text-sm text-nuit/80 underline underline-offset-4 hover:text-nuit">{t('fiche.comparer')}</Link>}
      </div>
      <ul className="mt-10 grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
        {vehicules.map((v) => (
          <li key={v.id} className="group text-center">
            {/* Photo : cliquable vers la page du véhicule */}
            <Link to={`/vehicule/${v.id}`} className="block overflow-hidden rounded-3xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-nuit" tabIndex={-1} aria-hidden="true">
              <img src={urlImage(v.photo_url)} alt="" loading="lazy"
                   className="aspect-[16/10] w-full object-cover transition duration-500 group-hover:scale-[1.04] motion-reduce:transition-none" />
            </Link>
            <h3 className="mt-5 text-xl font-bold">{v.nom}</h3>
            <p className="mt-0.5 text-sm text-ardoise">
              {t('vehicule.classe', { classe: v.classe })}{v.disponible ? ` · ${t('photos.disponible')}` : ''}
            </p>
            {/* Deux liens soulignés, comme sur le modèle */}
            <div className="mt-2 flex justify-center gap-6 text-sm">
              <Link to={`/vehicule/${v.id}`} className="text-nuit/80 underline underline-offset-4 hover:text-nuit">{t('vitrine.decouvrir')}</Link>
              <Link to="/commander" state={{ categorie: v.categorie }} className="text-nuit/80 underline underline-offset-4 hover:text-nuit">{t('vitrine.commander')}</Link>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

// Icônes simples des avantages
const ICONES = {
  prix: <path d="M4 7h16v10H4zM8 12h.01M16 12h.01M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z" />,
  carte: <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" />,
  feuille: <path d="M5 19C5 9 11 5 20 4c-1 9-5 15-15 15zM5 19l7-7" />,
  paiement: <path d="M3 6h18v12H3zM3 10h18M7 15h3" />,
}

export default function Accueil() {
  const { t } = useLangue()
  const { categories } = useConfig()
  const { hash } = useLocation()
  // Lot 16 / lot 20 : « ← Retour aux tarifs » ou « ← Retour aux véhicules » ouvre l'accueil sur la bonne section ;
  // la section peut arriver après le chargement (véhicules lus en différé) : quelques essais espacés
  useEffect(() => {
    if (!hash) return
    let essais = 0
    const minuteur = setInterval(() => {
      const cible = document.getElementById(hash.slice(1))
      if (cible || ++essais > 15) { clearInterval(minuteur); cible?.scrollIntoView({ block: 'start' }) }
    }, 150)
    return () => clearInterval(minuteur)
  }, [hash, categories.length])
  const avantages = [
    ['prix', 'av1'], ['carte', 'av2'], ['feuille', 'av3'], ['paiement', 'av4'],
  ]

  return (
    <PageSite sombre>
      {/* ---------- Héros ---------- */}
      <section className="relative overflow-hidden bg-nuit text-white">
        <PlanVille />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-12 lg:grid-cols-[1.1fr_1fr] lg:pb-28 lg:pt-20">
          <div>
            {/* Titre en Unbounded, large et serré : la signature typographique du site */}
            <h1 className="max-w-xl text-[2.4rem] font-extrabold sm:text-6xl lg:text-[4.4rem]">
              {t('accueil.titre')}
            </h1>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-white/75">{t('accueil.sousTitre')}</p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link to="/commander" className="btn-principal px-7 py-3.5 text-base">{t('accueil.cta')}</Link>
              <a href="#tarifs" className="inline-flex items-center rounded-full px-6 py-3 font-bold text-white ring-1 ring-white/30 transition hover:bg-white/10">{t('accueil.ctaTarifs')}</a>
            </div>
            {/* Les trois énergies proposées */}
            <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/70">
              <li><span aria-hidden="true">⚡</span> {t('energie.electrique')}</li>
              <li><span aria-hidden="true">🔋</span> {t('energie.hybride')}</li>
              <li><span aria-hidden="true">⛽</span> {t('energie.thermique')}</li>
            </ul>
          </div>
          <Simulateur />
        </div>
      </section>

      {/* ---------- Lot 19 : Nos véhicules (vitrine) ---------- */}
      <NosVehicules />

      {/* ---------- Catégories et tarifs ---------- */}
      <section id="tarifs" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20">
        <h2 className="text-3xl font-bold sm:text-[2.6rem]">{t('accueil.categories')}</h2>
        <p className="mt-3 max-w-prose text-ardoise">{t('accueil.categoriesTexte')}</p>
        {/* Liste comparative : une ligne par catégorie, séparées par un filet */}
        <ul className="mt-8 divide-y divide-nuit/10 border-y border-nuit/10">
          {categories.map((c) => <LigneCategorie key={c.code} cat={c} />)}
          {categories.length === 0 && <li className="py-6 text-ardoise">{t('commun.chargement')}</li>}
        </ul>
      </section>

      {/* ---------- Location avec chauffeur ---------- */}
      <section className="mx-auto max-w-6xl px-4">
        {/* Location avec chauffeur : bandeau indigo, bouton jaune */}
        <div className="flex flex-col items-start gap-6 rounded-[36px] bg-nuit-700 p-8 text-white sm:p-12 md:flex-row md:items-center">
          <div className="flex-1">
            <h2 className="text-3xl font-bold">{t('accueil.location')}</h2>
            <p className="mt-3 max-w-prose text-white/75">{t('accueil.locationTexte')}</p>
          </div>
          <Link to="/commander" state={{ mode: 'heure' }} className="btn-principal px-7 py-3.5">{t('accueil.locationCta')}</Link>
        </div>
      </section>

      {/* ---------- Avantages ---------- */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <h2 className="text-3xl font-bold sm:text-[2.6rem]">{t('accueil.avantages')}</h2>
        <div className="mt-8 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {avantages.map(([icone, cle]) => (
            <div key={cle}>
              {/* Pictogramme dans une pastille jaune */}
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-volt-500">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#1A1650" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONES[icone]}</svg>
              </span>
              <h3 className="mt-3 text-lg font-bold">{t(`accueil.${cle}.titre`)}</h3>
              <p className="mt-1 text-ardoise">{t(`accueil.${cle}.texte`)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Devenez chauffeur ---------- */}
      <section className="bg-volt-500">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-14 md:flex-row md:items-center">
          <div className="flex-1">
            <h2 className="text-3xl font-bold text-nuit sm:text-4xl">{t('accueil.chauffeurTitre')}</h2>
            <p className="mt-2 max-w-prose text-nuit/80">{t('accueil.chauffeurTexte')}</p>
          </div>
          <Link to="/devenir-chauffeur" className="btn-nuit px-6 py-3">{t('accueil.chauffeurCta')}</Link>
        </div>
      </section>
    </PageSite>
  )
}
