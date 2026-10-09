// ============================================================================
// Page d'accueil (vitrine) : héros + simulateur de prix, catégories et tarifs,
// location avec chauffeur, avantages, « Devenez chauffeur ».
// ============================================================================
import { Link } from 'react-router-dom'
import PageSite from '@/composants/MiseEnPage.jsx'
import Simulateur from '@/composants/Simulateur.jsx'
import BadgeEnergie from '@/composants/BadgeEnergie.jsx'
import { useConfig } from '@/contexte/Config.jsx'
import { useLangue } from '@/i18n/index.jsx'

// Fond du héros : plan de ville stylisé + trajet A → B tracé une seule fois au chargement
function PlanVille() {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {/* Rues : quadrillage irrégulier très discret */}
      <g stroke="#ffffff" strokeOpacity="0.06" strokeWidth="10" fill="none" strokeLinecap="round">
        <path d="M-20 120 C300 90 520 160 1220 110" />
        <path d="M-20 330 C260 300 640 380 1220 300" />
        <path d="M-20 560 C400 520 700 600 1220 540" />
        <path d="M180 -20 C150 250 240 450 200 720" />
        <path d="M520 -20 C560 220 470 470 540 720" />
        <path d="M880 -20 C840 260 930 420 900 720" />
      </g>
      <g stroke="#ffffff" strokeOpacity="0.035" strokeWidth="4" fill="none">
        <path d="M-20 220 L1220 240" /><path d="M-20 450 L1220 430" /><path d="M360 -20 L330 720" /><path d="M720 -20 L760 720" /><path d="M1060 -20 L1040 720" />
      </g>
      {/* Trajet : ruban vert qui se dessine (une seule animation sur la page),
          tracé à droite, derrière le simulateur, pour ne jamais couvrir le texte */}
      <path
        d="M640 690 C700 600 640 520 760 470 S1020 420 1060 300 S1080 160 1100 120"
        fill="none" stroke="#2EE59D" strokeWidth="6" strokeLinecap="round"
        pathLength="1" strokeDasharray="1" className="animate-trace motion-reduce:animate-none"
        style={{ strokeDashoffset: 1 }}
      />
      {/* Points A et B */}
      <circle cx="640" cy="690" r="14" fill="#2EE59D" /><circle cx="640" cy="690" r="5" fill="#0B1F3A" />
      <circle cx="1100" cy="120" r="14" fill="#F5A524" /><circle cx="1100" cy="120" r="5" fill="#0B1F3A" />
    </svg>
  )
}

// Carte d'une catégorie (tarifs publics)
function CarteCategorie({ cat }) {
  const { t } = useLangue()
  const { monnaie } = useConfig()
  return (
    <article className="relative flex flex-col rounded-3xl bg-white p-5 ring-1 ring-nuit/10">
      {/* Ruban promo */}
      {cat.promo_active && cat.promo && (
        <span className="absolute -top-3 right-4 rounded-full bg-ambre-500 px-3 py-1 text-xs font-bold text-nuit shadow">
          −{cat.promo.pourcentage} % {cat.promo.libelle || ''}
        </span>
      )}
      <div className="flex flex-wrap gap-1">{(cat.energies || []).map((e) => <BadgeEnergie key={e} energie={e} />)}</div>
      <h3 className="mt-3 text-2xl font-bold">{cat.nom}</h3>
      <p className="mt-1 text-sm text-ardoise">{cat.description}</p>
      {/* Prix principal : au km */}
      <p className="mt-4 font-display text-3xl font-extrabold tabular-nums">
        {monnaie(cat.prix_km)} <span className="text-base font-medium text-ardoise">/ {t('accueil.parKm')}</span>
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        <dt className="text-ardoise">{t('accueil.parHeure')}</dt><dd className="text-right font-bold tabular-nums">{monnaie(cat.prix_heure)}</dd>
        <dt className="text-ardoise">{t('accueil.parJour')}</dt><dd className="text-right font-bold tabular-nums">{monnaie(cat.prix_jour)}</dd>
        <dt className="text-ardoise">{t('accueil.priseEnCharge')}</dt><dd className="text-right tabular-nums">{monnaie(cat.prise_en_charge)}</dd>
        <dt className="text-ardoise">{t('accueil.minimum')}</dt><dd className="text-right tabular-nums">{monnaie(cat.minimum)}</dd>
      </dl>
      <div className="mt-auto flex items-center justify-between gap-2 pt-4 text-sm">
        <span className="text-ardoise">{t('accueil.places', { n: cat.places })}{cat.confort?.length ? ` · ${cat.confort.slice(0, 2).join(', ')}` : ''}</span>
        <span className={`font-bold ${cat.vehicules_disponibles ? 'text-volt-700' : 'text-ardoise'}`}>
          {cat.vehicules_disponibles ? t('accueil.dispo', { n: cat.vehicules_disponibles }) : t('accueil.aucunDispo')}
        </span>
      </div>
    </article>
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
  const { categories, config } = useConfig()
  const avantages = [
    ['prix', 'av1'], ['carte', 'av2'], ['feuille', 'av3'], ['paiement', 'av4'],
  ]

  return (
    <PageSite sombre>
      {/* ---------- Héros ---------- */}
      <section className="relative overflow-hidden bg-nuit text-white">
        <PlanVille />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-10 lg:grid-cols-[1.15fr_1fr] lg:pb-24 lg:pt-16">
          <div>
            <h1 className="max-w-xl text-[2.6rem] font-extrabold leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
              {t('accueil.titre')}
            </h1>
            <p className="mt-6 max-w-lg text-lg text-white/75">{t('accueil.sousTitre')}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/commander" className="btn-principal px-6 py-3 text-base">{t('accueil.cta')}</Link>
              <a href="#tarifs" className="inline-flex items-center rounded-xl px-6 py-3 font-bold text-white ring-1 ring-white/25 hover:bg-white/10">{t('accueil.ctaTarifs')}</a>
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

      {/* ---------- Catégories et tarifs ---------- */}
      <section id="tarifs" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16">
        <h2 className="text-3xl font-bold sm:text-4xl">{t('accueil.categories')}</h2>
        <p className="mt-2 max-w-prose text-ardoise">{t('accueil.categoriesTexte')}</p>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((c) => <CarteCategorie key={c.code} cat={c} />)}
          {categories.length === 0 && <p className="text-ardoise">{t('commun.chargement')}</p>}
        </div>
      </section>

      {/* ---------- Location avec chauffeur ---------- */}
      <section className="mx-auto max-w-6xl px-4">
        <div className="flex flex-col items-start gap-6 rounded-[32px] bg-ambre-500 p-8 text-nuit sm:p-10 md:flex-row md:items-center">
          <div className="flex-1">
            <h2 className="text-3xl font-bold">{t('accueil.location')}</h2>
            <p className="mt-2 max-w-prose">{t('accueil.locationTexte')}</p>
          </div>
          <Link to="/commander" state={{ mode: 'heure' }} className="btn-nuit px-6 py-3">{t('accueil.locationCta')}</Link>
        </div>
      </section>

      {/* ---------- Avantages ---------- */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-3xl font-bold sm:text-4xl">{t('accueil.avantages')}</h2>
        <div className="mt-8 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {avantages.map(([icone, cle]) => (
            <div key={cle}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#0E9E62" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONES[icone]}</svg>
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
          <a
            href={config.email_support ? `mailto:${config.email_support}?subject=${encodeURIComponent('Candidature chauffeur')}` : '/inscription'}
            className="btn-nuit px-6 py-3"
          >
            {t('accueil.chauffeurCta')}
          </a>
        </div>
      </section>
    </PageSite>
  )
}
