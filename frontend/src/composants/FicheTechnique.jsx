// ============================================================================
// FicheTechnique (lot 20) — fiche technique des véhicules, présentée comme un comparateur (modèle fourni par le
// propriétaire) : une rubrique par thème (Intérieur, Sièges, Écran, Audio, Climatisation, Énergie, Sécurité),
// titre + filet, puis UNE COLONNE PAR VÉHICULE (1 sur la page du véhicule, jusqu'à 3 sur la page « Comparer »).
//   - Intérieur : photos de la cabine (avant / arrière) puis les équipements ;
//   - Écran et Audio : un grand chiffre (10,1″ / 6) avec son libellé dessous ;
//   - une valeur absente s'affiche « — » pour garder les colonnes alignées.
// Les données viennent de la fiche du véhicule (back-office → Fiche technique) : rien n'est inventé.
// ============================================================================
import { urlImage } from './PhotosVehicule.jsx'
import { useLangue } from '@/i18n/index.jsx'

// Une ligne d'équipement (texte simple, petite taille)
const Ligne = ({ children }) => <li className="py-0.5 text-sm text-nuit/80">{children}</li>
const Vide = () => <p className="text-sm text-ardoise">—</p>

// Liste d'équipements d'un véhicule (ou « — »)
function Liste({ valeurs }) {
  if (!valeurs || valeurs.length === 0) return <Vide />
  return <ul>{valeurs.map((x) => <Ligne key={x}>{x}</Ligne>)}</ul>
}

// Grand chiffre + libellé (écran, haut-parleurs), comme sur le modèle
function Chiffre({ valeur, unite = '', libelle }) {
  if (valeur === null || valeur === undefined || valeur === '') return <Vide />
  return (
    <div>
      <p className="font-display text-2xl font-bold tabular-nums">{String(valeur).replace('.', ',')}{unite}</p>
      {libelle && <p className="text-sm text-nuit/80">{libelle}</p>}
    </div>
  )
}

export default function FicheTechnique({ vehicules }) {
  const { t } = useLangue()
  const tech = (v) => v.technique || {}
  // Grille : autant de colonnes que de véhicules (1 à 3), empilées sur téléphone
  const grille = vehicules.length === 1 ? 'grid-cols-1' : vehicules.length === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3'

  // Rubriques : [clé de titre, pictogramme, rendu d'une colonne]
  const rubriques = [
    ['interieur', '🛞', (v) => {
      const cabine = (v.photos || []).filter((p) => p.vue === 'cabine_avant' || p.vue === 'cabine_arriere')
      return (
        <>
          {cabine.length > 0 && (
            <div className="mb-3 flex flex-col gap-2">
              {cabine.map((p) => (
                <img key={p.vue} src={urlImage(p.url)} alt={t(`photos.vue.${p.vue}`)} loading="lazy"
                     className="aspect-[3/2] w-full max-w-[220px] rounded-lg object-cover" />
              ))}
            </div>
          )}
          <Liste valeurs={tech(v).interieur} />
        </>
      )
    }],
    ['sieges', '💺', (v) => (
      <>
        {v.places && <p className="py-0.5 text-sm font-bold text-nuit">{t('fiche.places', { n: v.places })}</p>}
        <Liste valeurs={tech(v).sieges} />
      </>
    )],
    ['ecran', '🖥️', (v) => <Chiffre valeur={tech(v).ecran_pouces} unite="″" libelle={tech(v).ecran || t('fiche.ecranDefaut')} />],
    ['audio', '🔊', (v) => <Chiffre valeur={tech(v).audio_hp} libelle={t('fiche.hautParleurs')} />],
    ['climatisation', '❄️', (v) => <Liste valeurs={tech(v).climatisation} />],
    ['energie', '⚡', (v) => {
      const x = tech(v)
      const lignes = [
        v.energie && t(`energie.${v.energie}`),
        v.autonomie_km && v.energie !== 'thermique' && t('fiche.autonomie', { n: v.autonomie_km }),
        x.capacite_batterie_kwh && v.energie !== 'thermique' && t('fiche.batterie', { n: x.capacite_batterie_kwh }),
        x.reservoir_l && v.energie !== 'electrique' && t('fiche.reservoir', { n: x.reservoir_l }),
        x.boite && t(`fiche.boite.${x.boite}`),
        x.puissance_ch && t('fiche.puissance', { n: x.puissance_ch }),
      ].filter(Boolean)
      return <Liste valeurs={lignes} />
    }],
    ['securite', '🛡️', (v) => <Liste valeurs={tech(v).securite} />],
  ]

  return (
    <div className="space-y-10">
      {rubriques.map(([cle, icone, rendu]) => (
        <section key={cle}>
          {/* Titre de rubrique + filet, comme sur le modèle */}
          <h3 className="border-b border-nuit/15 pb-2 text-base font-bold">
            <span aria-hidden="true" className="mr-2">{icone}</span>{t(`fiche.${cle}`)}
          </h3>
          <div className={`mt-4 grid gap-8 ${grille}`}>
            {vehicules.map((v) => <div key={v.id}>{rendu(v)}</div>)}
          </div>
        </section>
      ))}
    </div>
  )
}
