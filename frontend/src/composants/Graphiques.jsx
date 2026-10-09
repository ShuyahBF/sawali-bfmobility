// ============================================================================
// Petits graphiques en SVG maison (aucune bibliothèque) pour le tableau de bord
//   Histogramme        : barres verticales (ex. courses des 7 derniers jours)
//   BarresHorizontales : comparaison de valeurs nommées (ex. chiffre par catégorie)
//   BarreRepartition   : une barre découpée en segments (ex. état du parc)
// Chaque barre affiche une bulle d'information au survol (ou au toucher).
// ============================================================================
import { useState } from 'react'
import { useLangue } from '@/i18n/index.jsx'

// --- Histogramme vertical. donnees = [{libelle, valeur, info?}]
export function Histogramme({ donnees = [], hauteur = 160, couleur = '#FFC629', formatValeur = (v) => v }) {
  const { t } = useLangue()
  const [survol, setSurvol] = useState(null)
  const max = Math.max(1, ...donnees.map((d) => Number(d.valeur) || 0))
  const largeur = 320
  const marge = { haut: 18, bas: 22 }
  const zone = hauteur - marge.haut - marge.bas
  const pas = largeur / Math.max(1, donnees.length)
  const epaisseur = Math.min(28, pas * 0.6)

  if (!donnees.length) return <p className="text-sm text-ardoise">{t('adm.tb.pasDeDonnees')}</p>
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${largeur} ${hauteur}`} className="w-full" role="img" aria-label={t('adm.tb.histogramme')}>
        {/* Ligne de base, discrète */}
        <line x1="0" x2={largeur} y1={hauteur - marge.bas} y2={hauteur - marge.bas} stroke="#1A1650" strokeOpacity="0.12" />
        {donnees.map((d, i) => {
          const v = Number(d.valeur) || 0
          const h = Math.max(v ? 3 : 0, (v / max) * zone)
          const x = i * pas + (pas - epaisseur) / 2
          const y = hauteur - marge.bas - h
          return (
            <g key={d.libelle + i} onMouseEnter={() => setSurvol(i)} onMouseLeave={() => setSurvol(null)} onClick={() => setSurvol(i)}>
              {/* Zone de survol plus large que la barre */}
              <rect x={i * pas} y={0} width={pas} height={hauteur} fill="transparent" />
              {/* Barre arrondie en haut, ancrée sur la ligne de base */}
              <path d={barreArrondie(x, y, epaisseur, h, 4)} fill={couleur} fillOpacity={survol === null || survol === i ? 1 : 0.45} />
              <text x={i * pas + pas / 2} y={hauteur - 6} textAnchor="middle" fontSize="10" fill="#52617A">{d.libelle}</text>
            </g>
          )
        })}
      </svg>
      {/* Bulle d'information */}
      {survol !== null && donnees[survol] && (
        <div className="pointer-events-none absolute -top-2 rounded-lg bg-nuit px-2 py-1 text-xs text-white shadow-lg" style={{ left: `${((survol + 0.5) / donnees.length) * 100}%`, transform: 'translate(-50%, -100%)' }}>
          <b>{donnees[survol].libelle}</b> : {formatValeur(donnees[survol].valeur)}
          {donnees[survol].info && <span className="block text-white/70">{donnees[survol].info}</span>}
        </div>
      )}
    </div>
  )
}

// Chemin SVG d'une barre dont seul le haut est arrondi
function barreArrondie(x, y, l, h, r) {
  if (h <= 0) return ''
  const rr = Math.min(r, h, l / 2)
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + l - rr} Q${x + l},${y} ${x + l},${y + rr} V${y + h} Z`
}

// --- Barres horizontales. donnees = [{libelle, valeur, info?}]
export function BarresHorizontales({ donnees = [], couleur = '#1A1650', formatValeur = (v) => v }) {
  const { t } = useLangue()
  const max = Math.max(1, ...donnees.map((d) => Number(d.valeur) || 0))
  if (!donnees.length) return <p className="text-sm text-ardoise">{t('adm.tb.pasDeDonnees')}</p>
  return (
    <ul className="space-y-3">
      {donnees.map((d) => (
        <li key={d.libelle} title={d.info || ''}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
            <span className="text-nuit">{d.libelle}</span>
            <span className="font-bold tabular-nums text-nuit">{formatValeur(d.valeur)}</span>
          </div>
          <div className="h-2 rounded-full bg-brume">
            <div className="h-2 rounded-full" style={{ width: `${((Number(d.valeur) || 0) / max) * 100}%`, background: couleur }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

// --- Barre de répartition. segments = [{libelle, valeur, couleur}]
export function BarreRepartition({ segments = [] }) {
  const total = segments.reduce((s, x) => s + (Number(x.valeur) || 0), 0)
  return (
    <div>
      <div className="flex h-4 gap-0.5 overflow-hidden rounded-full bg-brume" role="img" aria-label={segments.map((s) => `${s.libelle} ${s.valeur}`).join(', ')}>
        {total > 0 && segments.map((s) => (Number(s.valeur) > 0) && (
          <div key={s.libelle} title={`${s.libelle} : ${s.valeur}`} style={{ width: `${(s.valeur / total) * 100}%`, background: s.couleur }} />
        ))}
      </div>
      {/* Légende avec valeurs : l'information ne passe jamais par la couleur seule */}
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        {segments.map((s) => (
          <li key={s.libelle} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.couleur }} aria-hidden="true" />
            <span className="text-ardoise">{s.libelle}</span>
            <span className="ml-auto font-bold tabular-nums text-nuit">{s.valeur}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
