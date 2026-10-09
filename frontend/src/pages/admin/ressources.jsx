// ============================================================================
// Configurations des écrans de gestion du back-office (utilisées par TableauCrud)
// Une entrée par ressource de l'API /admin/<ressource>.
// configRessource(nom, contexte) renvoie la configuration adaptée au rôle.
//   contexte = { role, categories, monnaie, t, langue }
// Tous les textes passent par t('adm.…') (traductions dans src/i18n/admin/).
// ============================================================================
import BadgeEnergie from '@/composants/BadgeEnergie.jsx'
import PhotosVehicule from '@/composants/PhotosVehicule.jsx'   // lot 9 : 4 photos par véhicule
import TableauCrud from '@/composants/TableauCrud.jsx'             // lot 10 : listes liées dans les onglets des fiches
import CoursesDeLaFiche from '@/composants/CoursesDeLaFiche.jsx'   // lot 10 : onglet « Courses »
import Totaux from '@/composants/Totaux.jsx'                       // lot 10 : bandeaux de totaux
import { formatDate, formatDateHeure } from '@/lib/format.js'

// --- Listes de choix : valeurs de l'API ; le libellé est traduit (clé adm.opt.<valeur>)
const VALEURS = {
  energies: ['electrique', 'hybride', 'thermique'],
  statutsVehicule: ['disponible', 'en_service', 'maintenance', 'hors_service'],
  roles: ['gestionnaire', 'chauffeur', 'mecanicien', 'client'],
  typesEnergie: ['recharge', 'carburant'],
  typesIntervention: ['entretien', 'reparation', 'controle'],
  statutsIntervention: ['planifiee', 'en_cours', 'terminee'],
  statutsCommande: ['brouillon', 'envoyee', 'recue', 'annulee'],
  moyens: ['virement', 'especes', 'mobile_money', 'cheque', 'carte'],
  statutsCandidature: ['nouvelle', 'contactee', 'acceptee', 'refusee'],
}
// Icônes devant les énergies dans les menus
const ICONES_ENERGIE = { electrique: '⚡ ', hybride: '🔋 ', thermique: '⛽ ' }

// --- Pastille colorée générique (statuts) : le texte accompagne toujours la couleur
function Pastille({ texte, ton = 'gris' }) {
  const tons = {
    vert: 'bg-volt-100 text-volt-700',
    ambre: 'bg-ambre-100 text-ambre-600',
    rouge: 'bg-red-100 text-red-700',
    bleu: 'bg-sky-100 text-sky-800',
    nuit: 'bg-nuit text-white',
    gris: 'bg-slate-100 text-slate-700',
  }
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold ${tons[ton]}`}>{texte}</span>
}

// Date d'échéance colorée : rouge si dépassée, ambre si < 30 jours
function Echeance({ iso, langue }) {
  if (!iso) return <span className="text-ardoise">—</span>
  const jours = (new Date(iso) - Date.now()) / 86400000
  const classe = jours < 0 ? 'font-bold text-red-600' : jours < 30 ? 'font-bold text-ambre-600' : ''
  return <span className={classe}>{formatDate(iso, langue)}</span>
}

// --- Libellés des objets référencés (menus déroulants et colonnes)
const REF = {
  vehicules: (v) => `${v.immatriculation} — ${v.marque} ${v.modele}`,
  utilisateurs: (u) => `${u.nom} (${u.role})`,
  pieces: (p) => `${p.reference} — ${p.nom}`,
  fournisseurs: (f) => f.nom,
  plans: (p) => p.libelle,
  commandes: (c) => `${c.numero || `#${c.id}`}`,
}
const refs = (...noms) => Object.fromEntries(noms.map((n) => [n, REF[n]]))

// ============================================================================
// Construction de la configuration d'une ressource
// ============================================================================
export function configRessource(nom, contexte = {}) {
  const { role, categories = [], monnaie = (n) => n, t = (k) => k, langue = 'fr' } = contexte
  const direction = role === 'admin' || role === 'gestionnaire'
  // Raccourcis de traduction : colonne / champ (adm.c.*), option (adm.opt.*)
  const c = (cle) => t(`adm.c.${cle}`)
  const opts = (liste, icones = {}) => VALEURS[liste].map((v) => ({ valeur: v, libelle: `${icones[v] || ''}${t(`adm.opt.${v}`)}` }))
  const libelleOpt = (v) => (v ? t(`adm.opt.${v}`) : '—')
  const optionsCategories = categories.map((x) => ({ valeur: x.code, libelle: x.nom }))
  const libelleCategorie = (code) => optionsCategories.find((o) => o.valeur === code)?.libelle || code || '—'
  const argent = (cle) => (l) => <span className="tabular-nums">{monnaie(l[cle])}</span>
  const ENERGIES = opts('energies', ICONES_ENERGIE)
  const ROLES = role === 'admin' ? [{ valeur: 'admin', libelle: t('adm.opt.admin') }, ...opts('roles')] : opts('roles')
  const titre = (cle) => ({ titre: t(`adm.${cle}.titre`), description: t(`adm.${cle}.description`) })
  // Lot 10 — sections des formulaires : { cle, titre, icone } (titres traduits : adm.section.<cle>)
  const section = (cle, icone) => ({ cle, titre: t(`adm.section.${cle}`), icone })
  // Lot 10 — onglet d'une fiche montrant une liste liée (ex. pleins d'énergie DU véhicule), avec ajout direct
  const ongletListe = (cle, icone, ressourceLiee, filtre) => ({
    cle, icone, libelle: t(`adm.onglet.${cle}`),
    rendu: (ligne) => <TableauCrud config={configRessource(ressourceLiee, contexte)} filtreFixe={filtre(ligne)} compact />,
  })
  // Lot 10 — onglet « Courses » (véhicule, chauffeur ou client)
  const ongletCourses = (filtre) => ({ cle: 'courses', icone: '🚕', libelle: t('adm.onglet.courses'), rendu: (ligne) => <CoursesDeLaFiche filtre={filtre(ligne)} /> })
  const somme = (lignes, cle) => lignes.reduce((x, l) => x + Number(l[cle] || 0), 0)

  switch (nom) {
    // ------------------------------------------------------------------ Parc
    case 'vehicules':
      return {
        ressource: 'vehicules',
        ...titre('vehicules'),
        ecriture: direction,
        refs: refs('utilisateurs'),
        filtres: [{ cle: 'statut', libelle: c('statut'), options: opts('statutsVehicule') }],
        defaut: { statut: 'disponible', energie: 'electrique', places: 4, kilometrage: 0, confort: [] },
        // Lot 10 — fiche claire : sections + onglets de la « vie » du véhicule
        sections: [section('identite', '🚗'), section('technique', '⚙️'), section('exploitation', '🧭'), section('documents', '📄')],
        titreFiche: (l) => `${l.marque || ''} ${l.modele || ''} — ${l.immatriculation || ''}`,
        onglets: [
          { cle: 'photos', icone: '📷', libelle: t('adm.onglet.photos'), rendu: (l) => <PhotosVehicule vehicule={l} peutModifier={direction} /> },
          ongletListe('energie', '⛽', 'energie', (l) => ({ vehicule_id: l.id })),
          ongletListe('interventions', '🔧', 'interventions', (l) => ({ vehicule_id: l.id })),
          ongletListe('plans', '🗓️', 'plans', (l) => ({ vehicule_id: l.id })),
          ongletCourses((l) => ({ vehicule_id: l.id })),
        ],
        // Lot 9 — 4 photos par véhicule (face, cabine avant, cabine arrière, coffre), visibles sur le portail public
        actions: [{
          libelle: t('photos.admin.action'),
          panneau: {
            titre: (l) => t('photos.admin.titre', { vehicule: `${l.marque || ''} ${l.modele || ''} — ${l.immatriculation || ''}` }),
            rendu: (l) => <PhotosVehicule vehicule={l} peutModifier={direction} />,
          },
        }],
        colonnes: [
          { cle: 'immatriculation', libelle: c('immatriculation'), rendu: (l) => <span className="font-mono font-bold">{l.immatriculation}</span> },
          { cle: 'modele', libelle: c('vehicule'), rendu: (l) => `${l.marque || ''} ${l.modele || ''}${l.annee ? ` (${l.annee})` : ''}` },
          { cle: 'energie', libelle: c('energie'), rendu: (l) => <BadgeEnergie energie={l.energie} /> },
          { cle: 'categorie', libelle: c('categorie'), rendu: (l) => libelleCategorie(l.categorie) },
          { cle: 'kilometrage', libelle: c('km'), classe: 'text-right tabular-nums', rendu: (l) => Number(l.kilometrage || 0).toLocaleString(langue) },
          { cle: 'photos', libelle: t('photos.admin.colonne'), classe: 'text-center tabular-nums', rendu: (l) => `${Object.keys(l.photos || {}).length} / 4` },
          {
            cle: 'statut', libelle: c('statut'),
            rendu: (l) => <Pastille texte={libelleOpt(l.statut)} ton={{ disponible: 'vert', en_service: 'nuit', maintenance: 'ambre', hors_service: 'rouge' }[l.statut]} />,
          },
          { cle: 'chauffeur_id', libelle: c('chauffeur'), rendu: (l, a) => a.ref('utilisateurs', l.chauffeur_id) },
          { cle: 'assurance_expire', libelle: c('assurance'), rendu: (l) => <Echeance iso={l.assurance_expire} langue={langue} /> },
          { cle: 'controle_technique_expire', libelle: c('controleTech'), rendu: (l) => <Echeance iso={l.controle_technique_expire} langue={langue} /> },
        ],
        champs: [
          { cle: 'immatriculation', section: 'identite', libelle: c('immatriculation'), requis: true },
          { cle: 'energie', section: 'technique', libelle: c('energie'), type: 'select', options: ENERGIES, requis: true },
          { cle: 'marque', section: 'identite', libelle: c('marque'), requis: true },
          { cle: 'modele', section: 'identite', libelle: c('modele'), requis: true },
          { cle: 'annee', section: 'identite', libelle: c('annee'), type: 'nombre' },
          { cle: 'couleur', section: 'identite', libelle: c('couleur') },
          { cle: 'categorie', section: 'identite', libelle: c('categorie'), type: 'select', options: optionsCategories, requis: true },
          { cle: 'places', section: 'identite', libelle: c('places'), type: 'nombre' },
          { cle: 'confort', section: 'identite', libelle: c('confort'), type: 'liste', aide: t('adm.aide.confort'), large: true },
          { cle: 'autonomie_km', section: 'technique', libelle: c('autonomie'), type: 'nombre', visible: (f) => f.energie !== 'thermique' },
          { cle: 'capacite_batterie_kwh', section: 'technique', libelle: c('batterie'), type: 'nombre', visible: (f) => f.energie !== 'thermique' },
          { cle: 'reservoir_l', section: 'technique', libelle: c('reservoir'), type: 'nombre', visible: (f) => f.energie !== 'electrique' },
          { cle: 'kilometrage', section: 'technique', libelle: c('kilometrage'), type: 'nombre' },
          { cle: 'statut', section: 'exploitation', libelle: c('statut'), type: 'select', options: opts('statutsVehicule') },
          { cle: 'chauffeur_id', section: 'exploitation', libelle: c('chauffeurAttitre'), type: 'ref', ref: 'utilisateurs' },
          { cle: 'assurance_expire', section: 'documents', libelle: c('assuranceJusquau'), type: 'date' },
          { cle: 'controle_technique_expire', section: 'documents', libelle: c('controleJusquau'), type: 'date' },
        ],
      }

    // ------------------------------------------------------------------ Tarifs
    case 'categories':
      return {
        ressource: 'categories',
        ...titre('categories'),
        ecriture: direction,
        defaut: { actif: true, energies: ['electrique'], places: 4, ordre: 1 },
        sections: [section('presentation', '🏷️'), section('tarifs', '💰'), section('promo', '🎉')],
        titreFiche: (l) => l.nom,
        onglets: [ongletListe('vehicules', '🚗', 'vehicules', (l) => ({ categorie: l.code }))],
        // Promotion : sans pourcentage, on envoie « pas de promo »
        avantEnvoi: (x) => ({ ...x, promo: x.promo?.pourcentage ? x.promo : null }),
        colonnes: [
          { cle: 'ordre', libelle: c('ordre'), classe: 'tabular-nums' },
          { cle: 'nom', libelle: c('categorie'), rendu: (l) => <><b>{l.nom}</b> <span className="text-ardoise">({l.code})</span></> },
          { cle: 'energies', libelle: c('energies'), rendu: (l) => <span className="flex flex-wrap gap-1">{(l.energies || []).map((e) => <BadgeEnergie key={e} energie={e} />)}</span> },
          { cle: 'prix_km', libelle: c('km'), classe: 'text-right', rendu: argent('prix_km') },
          { cle: 'prix_minute', libelle: c('minute'), classe: 'text-right', rendu: argent('prix_minute') },
          { cle: 'prix_heure', libelle: c('heure'), classe: 'text-right', rendu: argent('prix_heure') },
          { cle: 'prix_jour', libelle: c('jour'), classe: 'text-right', rendu: argent('prix_jour') },
          { cle: 'minimum', libelle: c('minimum'), classe: 'text-right', rendu: argent('minimum') },
          { cle: 'promo', libelle: c('promo'), rendu: (l) => (l.promo?.pourcentage ? <Pastille texte={`−${l.promo.pourcentage} %`} ton="ambre" /> : '—') },
          { cle: 'actif', libelle: c('active'), rendu: (l) => (l.actif ? <Pastille texte={t('commun.oui')} ton="vert" /> : <Pastille texte={t('commun.non')} />) },
        ],
        champs: [
          { cle: 'code', section: 'presentation', libelle: c('code'), requis: true, aide: t('adm.aide.code') },
          { cle: 'nom', section: 'presentation', libelle: c('nomAffiche'), requis: true },
          { cle: 'description', section: 'presentation', libelle: c('description'), type: 'zone' },
          { cle: 'energies', section: 'presentation', libelle: c('energies'), type: 'liste', aide: 'electrique, hybride, thermique' },
          { cle: 'confort', section: 'presentation', libelle: c('confort'), type: 'liste' },
          { cle: 'places', section: 'presentation', libelle: c('places'), type: 'nombre' },
          { cle: 'ordre', section: 'presentation', libelle: c('ordreAffichage'), type: 'nombre' },
          { cle: 'prise_en_charge', section: 'tarifs', libelle: c('priseEnCharge'), type: 'nombre' },
          { cle: 'minimum', section: 'tarifs', libelle: c('prixMinimum'), type: 'nombre' },
          { cle: 'prix_km', section: 'tarifs', libelle: c('prixKm'), type: 'nombre', requis: true },
          { cle: 'prix_minute', section: 'tarifs', libelle: c('prixMinute'), type: 'nombre' },
          { cle: 'prix_heure', section: 'tarifs', libelle: c('prixHeure'), type: 'nombre' },
          { cle: 'prix_jour', section: 'tarifs', libelle: c('prixJour'), type: 'nombre' },
          { cle: 'promo.pourcentage', section: 'promo', libelle: c('promoPct'), type: 'nombre' },
          { cle: 'promo.libelle', section: 'promo', libelle: c('promoLibelle') },
          { cle: 'promo.debut', section: 'promo', libelle: c('promoDebut'), type: 'date' },
          { cle: 'promo.fin', section: 'promo', libelle: c('promoFin'), type: 'date' },
          { cle: 'actif', section: 'presentation', libelle: c('categorieProposee'), type: 'case' },
        ],
      }

    // ------------------------------------------------------------------ Utilisateurs
    case 'utilisateurs':
      return {
        ressource: 'utilisateurs',
        ...titre('utilisateurs'),
        ecriture: direction,
        refs: refs('vehicules'),
        filtres: [{ cle: 'role', libelle: c('role'), options: ROLES }],
        defaut: { role: 'chauffeur', actif: true },
        sections: [section('identite', '👤'), section('compte', '🔐'), section('chauffeur', '🪪')],
        titreFiche: (l) => `${l.nom} — ${libelleOpt(l.role)}`,
        onglets: [
          { ...ongletCourses((l) => (l.role === 'chauffeur' ? { chauffeur_id: l.id } : { client_id: l.id })) },
          ongletListe('interventionsMeca', '🔧', 'interventions', (l) => ({ mecanicien_id: l.id })),
        ],
        // Les informations « chauffeur » ne sont envoyées que pour un chauffeur
        avantEnvoi: (x) => { const r = { ...x }; if (r.role !== 'chauffeur') delete r.chauffeur; return r },
        colonnes: [
          { cle: 'nom', libelle: c('nom'), rendu: (l) => <b>{l.nom}</b> },
          { cle: 'telephone', libelle: c('telephone') },
          { cle: 'email', libelle: c('email') },
          { cle: 'role', libelle: c('role'), rendu: (l) => <Pastille texte={libelleOpt(l.role)} ton={{ admin: 'nuit', gestionnaire: 'bleu', chauffeur: 'vert', mecanicien: 'ambre' }[l.role] || 'gris'} /> },
          { cle: 'en_ligne', libelle: c('enLigne'), rendu: (l) => (l.role === 'chauffeur' ? (l.chauffeur?.en_ligne ? <Pastille texte={t('chf.enLigne')} ton="vert" /> : <Pastille texte={t('chf.horsLigne')} />) : '—') },
          { cle: 'note', libelle: c('note'), rendu: (l) => (l.chauffeur?.note_moyenne != null ? `★ ${Number(l.chauffeur.note_moyenne).toFixed(1)} (${l.chauffeur.nb_notes || 0})` : '—') },
          { cle: 'permis', libelle: c('permis'), rendu: (l) => (l.chauffeur ? <Echeance iso={l.chauffeur.permis_expire} langue={langue} /> : '—') },
          { cle: 'actif', libelle: c('actif'), rendu: (l) => (l.actif ? t('commun.oui') : <Pastille texte={t('adm.opt.desactive')} ton="rouge" />) },
        ],
        champs: [
          { cle: 'nom', section: 'identite', libelle: c('nomComplet'), requis: true },
          { cle: 'telephone', section: 'identite', libelle: c('telephone'), requis: true },
          { cle: 'email', section: 'identite', libelle: c('email') },
          { cle: 'role', section: 'compte', libelle: c('role'), type: 'select', requis: true, options: ROLES },
          { cle: 'mot_de_passe', section: 'compte', libelle: c('motDePasse'), type: 'motdepasse', aide: t('adm.aide.motDePasse') },
          { cle: 'actif', section: 'compte', libelle: c('compteActif'), type: 'case' },
          { cle: 'chauffeur.permis_numero', section: 'chauffeur', libelle: c('permisNumero'), visible: (f) => f.role === 'chauffeur' },
          { cle: 'chauffeur.permis_expire', section: 'chauffeur', libelle: c('permisJusquau'), type: 'date', visible: (f) => f.role === 'chauffeur' },
          { cle: 'chauffeur.vehicule_id', section: 'chauffeur', libelle: c('vehicule'), type: 'ref', ref: 'vehicules', visible: (f) => f.role === 'chauffeur' },
        ],
      }

    // ------------------------------------------------------------------ Énergie
    case 'energie':
      return {
        ressource: 'energie',
        ...titre('energie'),
        ecriture: direction,
        refs: refs('vehicules'),
        filtres: [{ cle: 'type', libelle: c('type'), options: opts('typesEnergie') }],
        defaut: { type: 'recharge' },
        sections: [section('quoi', '⛽'), section('mesures', '📏')],
        // Lot 10 — totaux : coût, kWh, litres, nombre de pleins
        resume: (lignes) => <Totaux elements={[
          { libelle: t('adm.total.pleins'), valeur: lignes.length },
          { libelle: t('adm.total.kwh'), valeur: `${somme(lignes.filter((l) => l.type === 'recharge'), 'quantite').toLocaleString(langue)} kWh` },
          { libelle: t('adm.total.litres'), valeur: `${somme(lignes.filter((l) => l.type === 'carburant'), 'quantite').toLocaleString(langue)} L` },
          { libelle: t('adm.total.cout'), valeur: monnaie(somme(lignes, 'cout')), fort: true },
        ]} />,
        colonnes: [
          { cle: 'le', libelle: c('date'), rendu: (l) => formatDateHeure(l.le, langue) },
          { cle: 'vehicule_id', libelle: c('vehicule'), rendu: (l, a) => a.ref('vehicules', l.vehicule_id) },
          { cle: 'type', libelle: c('type'), rendu: (l) => `${l.type === 'recharge' ? '⚡' : '⛽'} ${libelleOpt(l.type)}` },
          { cle: 'quantite', libelle: c('quantite'), classe: 'text-right tabular-nums', rendu: (l) => `${l.quantite} ${l.type === 'recharge' ? 'kWh' : 'L'}` },
          { cle: 'cout', libelle: c('cout'), classe: 'text-right', rendu: argent('cout') },
          { cle: 'kilometrage', libelle: c('kmCompteur'), classe: 'text-right tabular-nums' },
          { cle: 'station', libelle: c('station') },
        ],
        champs: [
          { cle: 'vehicule_id', section: 'quoi', libelle: c('vehicule'), type: 'ref', ref: 'vehicules', requis: true, large: true },
          { cle: 'type', section: 'quoi', libelle: c('type'), type: 'select', options: opts('typesEnergie'), requis: true },
          { cle: 'le', section: 'quoi', libelle: c('dateHeure'), type: 'dateheure' },
          { cle: 'quantite', section: 'mesures', libelle: c('quantiteUnite'), type: 'nombre', requis: true },
          { cle: 'cout', section: 'mesures', libelle: c('cout'), type: 'nombre', requis: true },
          { cle: 'kilometrage', section: 'mesures', libelle: c('kilometrage'), type: 'nombre', requis: true },
          { cle: 'station', section: 'quoi', libelle: c('station') },
        ],
      }

    // ------------------------------------------------------------------ Plans de maintenance
    case 'plans':
      return {
        ressource: 'plans',
        ...titre('plans'),
        ecriture: true,
        refs: refs('vehicules', 'pieces'),
        sections: [section('plan', '🗓️'), section('echeances', '⏱️')],
        colonnes: [
          { cle: 'libelle', libelle: c('plan'), rendu: (l) => <b>{l.libelle}</b> },
          { cle: 'vehicule_id', libelle: c('vehicule'), rendu: (l, a) => (l.vehicule_id ? a.ref('vehicules', l.vehicule_id) : t('adm.opt.tous')) },
          { cle: 'energie', libelle: c('energie'), rendu: (l) => (l.energie ? <BadgeEnergie energie={l.energie} /> : '—') },
          { cle: 'intervalle', libelle: c('intervalle'), rendu: (l) => [l.intervalle_km && `${l.intervalle_km} km`, l.intervalle_jours && t('adm.jours', { n: l.intervalle_jours })].filter(Boolean).join(` ${t('adm.ou')} `) || '—' },
          { cle: 'dernier', libelle: c('derniereFois'), rendu: (l) => [l.dernier_km != null && `${l.dernier_km} km`, l.derniere_date && formatDate(l.derniere_date, langue)].filter(Boolean).join(', ') || '—' },
          { cle: 'piece_id', libelle: c('piece'), rendu: (l, a) => (l.piece_id ? a.ref('pieces', l.piece_id) : '—') },
        ],
        champs: [
          { cle: 'libelle', section: 'plan', libelle: c('libelle'), requis: true, large: true },
          { cle: 'vehicule_id', section: 'plan', libelle: c('vehiculeTous'), type: 'ref', ref: 'vehicules' },
          { cle: 'energie', section: 'plan', libelle: c('energieConcernee'), type: 'select', options: ENERGIES },
          { cle: 'intervalle_km', section: 'echeances', libelle: c('intervalleKm'), type: 'nombre' },
          { cle: 'intervalle_jours', section: 'echeances', libelle: c('intervalleJours'), type: 'nombre' },
          { cle: 'dernier_km', section: 'echeances', libelle: c('dernierKm'), type: 'nombre' },
          { cle: 'derniere_date', section: 'echeances', libelle: c('derniereDate'), type: 'date' },
          { cle: 'piece_id', section: 'plan', libelle: c('pieceHabituelle'), type: 'ref', ref: 'pieces' },
        ],
      }

    // ------------------------------------------------------------------ Interventions
    case 'interventions':
      return {
        ressource: 'interventions',
        ...titre('interventions'),
        ecriture: true,
        refs: refs('vehicules', 'pieces', 'utilisateurs', 'plans'),
        filtres: [{ cle: 'statut', libelle: c('statut'), options: opts('statutsIntervention') }],
        defaut: { type: 'entretien', statut: 'planifiee', pieces: [], main_oeuvre: 0 },
        sections: [section('intervention', '🔧'), section('suivi', '🧑‍🔧'), section('couts', '💰')],
        resume: (lignes) => <Totaux elements={[
          { libelle: t('adm.total.interventions'), valeur: lignes.length },
          { libelle: t('adm.total.enCours'), valeur: lignes.filter((l) => l.statut !== 'terminee').length },
          { libelle: t('adm.total.pieces'), valeur: lignes.reduce((x, l) => x + (l.pieces?.length || 0), 0) },
          { libelle: t('adm.total.mainOeuvre'), valeur: monnaie(somme(lignes, 'main_oeuvre')), fort: true },
        ]} />,
        actions: [
          {
            libelle: t('adm.action.terminer'),
            visible: (l) => l.statut !== 'terminee',
            executer: async (l, { api, toast, recharger, attente }) => {
              if (!window.confirm(t('adm.action.terminerConfirmer'))) return
              await attente(api.patch(`/admin/interventions/${l.id}`, { statut: 'terminee' }))
              toast.succes(t('adm.action.termineeOk'))
              recharger()
            },
          },
        ],
        colonnes: [
          { cle: 'le', libelle: c('date'), rendu: (l) => formatDate(l.le, langue) },
          { cle: 'vehicule_id', libelle: c('vehicule'), rendu: (l, a) => a.ref('vehicules', l.vehicule_id) },
          { cle: 'type', libelle: c('type'), rendu: (l) => libelleOpt(l.type) },
          { cle: 'description', libelle: c('description'), rendu: (l) => <span className="line-clamp-2 max-w-xs">{l.description}</span> },
          { cle: 'pieces', libelle: c('pieces'), rendu: (l) => (l.pieces?.length ? t('adm.references', { n: l.pieces.length }) : '—') },
          { cle: 'main_oeuvre', libelle: c('mainOeuvre'), classe: 'text-right', rendu: argent('main_oeuvre') },
          { cle: 'mecanicien_id', libelle: c('mecanicien'), rendu: (l, a) => a.ref('utilisateurs', l.mecanicien_id) },
          { cle: 'statut', libelle: c('statut'), rendu: (l) => <Pastille texte={libelleOpt(l.statut)} ton={{ planifiee: 'bleu', en_cours: 'ambre', terminee: 'vert' }[l.statut]} /> },
        ],
        champs: [
          { cle: 'vehicule_id', section: 'intervention', libelle: c('vehicule'), type: 'ref', ref: 'vehicules', requis: true },
          { cle: 'type', section: 'intervention', libelle: c('type'), type: 'select', options: opts('typesIntervention'), requis: true },
          { cle: 'description', section: 'intervention', libelle: c('description'), type: 'zone', requis: true },
          { cle: 'kilometrage', section: 'suivi', libelle: c('kilometrage'), type: 'nombre' },
          { cle: 'le', section: 'suivi', libelle: c('date'), type: 'dateheure' },
          { cle: 'mecanicien_id', section: 'suivi', libelle: c('mecanicien'), type: 'ref', ref: 'utilisateurs' },
          { cle: 'plan_id', section: 'suivi', libelle: c('planMaintenance'), type: 'ref', ref: 'plans' },
          { cle: 'main_oeuvre', section: 'couts', libelle: c('mainOeuvre'), type: 'nombre' },
          { cle: 'statut', section: 'intervention', libelle: c('statut'), type: 'select', options: opts('statutsIntervention') },
          {
            cle: 'pieces', section: 'couts', libelle: c('piecesUtilisees'), type: 'lignes',
            sousChamps: [
              { cle: 'piece_id', libelle: c('piece'), type: 'ref', ref: 'pieces', requis: true },
              { cle: 'quantite', libelle: c('qte'), type: 'nombre', requis: true },
            ],
          },
        ],
      }

    // ------------------------------------------------------------------ Pièces
    case 'pieces':
      return {
        ressource: 'pieces',
        ...titre('pieces'),
        ecriture: true,
        refs: refs('fournisseurs'),
        defaut: { quantite: 0, seuil_alerte: 1, compatibilites: [] },
        sections: [section('identitePiece', '🔩'), section('stock', '📦'), section('achat', '🛒')],
        titreFiche: (l) => `${l.reference} — ${l.nom}`,
        onglets: [ongletListe('plansPiece', '🗓️', 'plans', (l) => ({ piece_id: l.id }))],
        actions: [
          {
            // Mouvement de stock : vraie modale (quantité ± et motif), plus de window.prompt
            libelle: t('adm.action.mouvement'),
            formulaire: {
              titre: (l) => t('adm.mouvement.titre', { nom: l.nom }),
              defaut: () => ({ quantite: 1, motif: '' }),
              champs: [
                { cle: 'quantite', libelle: t('adm.mouvement.quantite'), type: 'nombre', requis: true, pas: 1, aide: t('adm.mouvement.aide') },
                { cle: 'motif', libelle: t('adm.mouvement.motif'), requis: true },
              ],
              envoyer: async (l, valeurs, { api, toast, recharger, attente }) => {
                // Quantité nulle : message et la modale reste ouverte (renvoi de false)
                if (!valeurs.quantite) { toast.erreur(t('adm.mouvement.zero')); return false }
                await attente(api.post(`/admin/pieces/${l.id}/mouvement`, { quantite: valeurs.quantite, motif: valeurs.motif }))
                toast.succes(t('adm.mouvement.ok'))
                recharger()
              },
            },
          },
        ],
        colonnes: [
          { cle: 'reference', libelle: c('reference'), rendu: (l) => <span className="font-mono">{l.reference}</span> },
          { cle: 'nom', libelle: c('piece'), rendu: (l) => <b>{l.nom}</b> },
          { cle: 'categorie', libelle: c('categorie') },
          {
            cle: 'quantite', libelle: c('stock'), classe: 'text-right tabular-nums',
            rendu: (l) => <span className={Number(l.quantite) <= Number(l.seuil_alerte) ? 'font-bold text-red-600' : ''}>{l.quantite}</span>,
          },
          { cle: 'seuil_alerte', libelle: c('seuil'), classe: 'text-right tabular-nums' },
          { cle: 'prix_unitaire', libelle: c('prixUnitaire'), classe: 'text-right', rendu: argent('prix_unitaire') },
          { cle: 'fournisseur_id', libelle: c('fournisseur'), rendu: (l, a) => a.ref('fournisseurs', l.fournisseur_id) },
          { cle: 'emplacement', libelle: c('emplacement') },
        ],
        champs: [
          { cle: 'reference', section: 'identitePiece', libelle: c('reference'), requis: true },
          { cle: 'nom', section: 'identitePiece', libelle: c('nom'), requis: true },
          { cle: 'categorie', section: 'identitePiece', libelle: c('categorie') },
          { cle: 'emplacement', section: 'stock', libelle: c('emplacement') },
          { cle: 'compatibilites', section: 'identitePiece', libelle: c('compatibilites'), type: 'liste', large: true, aide: t('adm.aide.compatibilites') },
          { cle: 'quantite', section: 'stock', libelle: c('quantiteStock'), type: 'nombre' },
          { cle: 'seuil_alerte', section: 'stock', libelle: c('seuilAlerte'), type: 'nombre' },
          { cle: 'prix_unitaire', section: 'achat', libelle: c('prixUnitaire'), type: 'nombre' },
          { cle: 'fournisseur_id', section: 'achat', libelle: c('fournisseur'), type: 'ref', ref: 'fournisseurs' },
        ],
      }

    // ------------------------------------------------------------------ Fournisseurs
    case 'fournisseurs':
      return {
        ressource: 'fournisseurs',
        ...titre('fournisseurs'),
        ecriture: direction,
        sections: [section('coordonnees', '🏢'), section('conditions', '🤝')],
        titreFiche: (l) => l.nom,
        onglets: [
          ongletListe('commandes', '🧾', 'commandes', (l) => ({ fournisseur_id: l.id })),
          ongletListe('paiements', '💳', 'paiements-fournisseurs', (l) => ({ fournisseur_id: l.id })),
          ongletListe('piecesFournies', '🔩', 'pieces', (l) => ({ fournisseur_id: l.id })),
        ],
        colonnes: [
          { cle: 'nom', libelle: c('fournisseur'), rendu: (l) => <b>{l.nom}</b> },
          { cle: 'contact', libelle: c('contact') },
          { cle: 'telephone', libelle: c('telephone') },
          { cle: 'pays', libelle: c('pays') },
          { cle: 'total_commandes', libelle: c('commandes'), classe: 'text-right', rendu: argent('total_commandes') },
          { cle: 'total_paye', libelle: c('paye'), classe: 'text-right', rendu: argent('total_paye') },
          { cle: 'solde', libelle: c('solde'), classe: 'text-right', rendu: (l) => <b className={Number(l.solde) > 0 ? 'text-ambre-600' : ''}>{monnaie(l.solde)}</b> },
        ],
        champs: [
          { cle: 'nom', section: 'coordonnees', libelle: c('nom'), requis: true },
          { cle: 'contact', section: 'coordonnees', libelle: c('personneContact') },
          { cle: 'telephone', section: 'coordonnees', libelle: c('telephone') },
          { cle: 'email', section: 'coordonnees', libelle: c('email') },
          { cle: 'adresse', section: 'coordonnees', libelle: c('adresse'), large: true },
          { cle: 'pays', section: 'coordonnees', libelle: c('pays') },
          { cle: 'conditions_paiement', section: 'conditions', libelle: c('conditionsPaiement') },
        ],
      }

    // ------------------------------------------------------------------ Commandes fournisseurs
    case 'commandes':
      return {
        ressource: 'commandes',
        ...titre('commandes'),
        ecriture: direction,
        refs: refs('fournisseurs', 'pieces'),
        filtres: [{ cle: 'statut', libelle: c('statut'), options: opts('statutsCommande') }],
        defaut: { statut: 'brouillon', lignes: [] },
        sections: [section('commande', '🧾'), section('lignes', '📦')],
        titreFiche: (l) => l.numero || `#${l.id}`,
        onglets: [ongletListe('paiements', '💳', 'paiements-fournisseurs', (l) => ({ commande_id: l.id }))],
        actions: direction ? [
          {
            libelle: t('adm.action.recevoir'),
            visible: (l) => l.statut === 'envoyee' || l.statut === 'brouillon',
            executer: async (l, { api, toast, recharger, attente }) => {
              if (!window.confirm(t('adm.action.recevoirConfirmer', { numero: l.numero || '' }))) return
              await attente(api.post(`/admin/commandes/${l.id}/recevoir`))
              toast.succes(t('adm.action.recueOk'))
              recharger()
            },
          },
        ] : [],
        colonnes: [
          { cle: 'numero', libelle: c('numero'), rendu: (l) => <span className="font-mono font-bold">{l.numero || `#${l.id}`}</span> },
          { cle: 'fournisseur_id', libelle: c('fournisseur'), rendu: (l, a) => a.ref('fournisseurs', l.fournisseur_id) },
          { cle: 'lignes', libelle: c('lignes'), rendu: (l) => l.lignes?.length || 0 },
          { cle: 'total', libelle: c('total'), classe: 'text-right', rendu: argent('total') },
          { cle: 'statut', libelle: c('statut'), rendu: (l) => <Pastille texte={libelleOpt(l.statut)} ton={{ brouillon: 'gris', envoyee: 'bleu', recue: 'vert', annulee: 'rouge' }[l.statut]} /> },
          { cle: 'note', libelle: c('note') },
        ],
        champs: [
          { cle: 'fournisseur_id', section: 'commande', libelle: c('fournisseur'), type: 'ref', ref: 'fournisseurs', requis: true },
          { cle: 'statut', section: 'commande', libelle: c('statut'), type: 'select', options: opts('statutsCommande').filter((o) => o.valeur !== 'recue') },
          {
            cle: 'lignes', section: 'lignes', libelle: c('lignesCommande'), type: 'lignes',
            sousChamps: [
              { cle: 'piece_id', libelle: c('piece'), type: 'ref', ref: 'pieces', requis: true },
              { cle: 'quantite', libelle: c('qte'), type: 'nombre', requis: true },
              { cle: 'prix_unitaire', libelle: c('prixU'), type: 'nombre' },
            ],
          },
          { cle: 'note', section: 'commande', libelle: c('note'), type: 'zone' },
        ],
      }

    // ------------------------------------------------------------------ Paiements fournisseurs
    case 'paiements-fournisseurs':
      return {
        ressource: 'paiements-fournisseurs',
        ...titre('paiements'),
        ecriture: direction,
        refs: refs('fournisseurs', 'commandes'),
        defaut: { moyen: 'virement' },
        sections: [section('paiement', '💳')],
        resume: (lignes) => <Totaux elements={[
          { libelle: t('adm.total.paiements'), valeur: lignes.length },
          { libelle: t('adm.total.montant'), valeur: monnaie(somme(lignes, 'montant')), fort: true },
        ]} />,
        colonnes: [
          { cle: 'le', libelle: c('date'), rendu: (l) => formatDate(l.le, langue) },
          { cle: 'fournisseur_id', libelle: c('fournisseur'), rendu: (l, a) => a.ref('fournisseurs', l.fournisseur_id) },
          { cle: 'commande_id', libelle: c('commande'), rendu: (l, a) => (l.commande_id ? a.ref('commandes', l.commande_id) : '—') },
          { cle: 'montant', libelle: c('montant'), classe: 'text-right', rendu: argent('montant') },
          { cle: 'moyen', libelle: c('moyen'), rendu: (l) => libelleOpt(l.moyen) },
          { cle: 'reference', libelle: c('reference') },
        ],
        champs: [
          { cle: 'fournisseur_id', section: 'paiement', libelle: c('fournisseur'), type: 'ref', ref: 'fournisseurs', requis: true },
          { cle: 'commande_id', section: 'paiement', libelle: c('commandeFacultatif'), type: 'ref', ref: 'commandes' },
          { cle: 'montant', section: 'paiement', libelle: c('montant'), type: 'nombre', requis: true },
          { cle: 'moyen', section: 'paiement', libelle: c('moyen'), type: 'select', options: opts('moyens'), requis: true },
          { cle: 'reference', section: 'paiement', libelle: c('reference') },
          { cle: 'le', section: 'paiement', libelle: c('date'), type: 'date' },
        ],
      }

    // ------------------------------------------------------------------ Candidatures (lot 2)
    case 'candidatures':
      return {
        ressource: 'candidatures',
        ...titre('candidatures'),
        ecriture: direction,
        filtres: [{ cle: 'statut', libelle: c('statut'), options: opts('statutsCandidature') }],
        defaut: { statut: 'nouvelle' },
        sections: [section('candidat', '🙋'), section('traitement', '📋')],
        colonnes: [
          { cle: 'cree_le', libelle: c('recueLe'), rendu: (l) => formatDateHeure(l.cree_le, langue) },
          { cle: 'nom', libelle: c('nom'), rendu: (l) => <b>{l.nom}</b> },
          { cle: 'telephone', libelle: c('telephone'), rendu: (l) => <a href={`tel:${l.telephone}`} onClick={(e) => e.stopPropagation()} className="text-nuit-600 underline">{l.telephone}</a> },
          { cle: 'ville', libelle: c('ville') },
          { cle: 'experience_annees', libelle: c('experience'), classe: 'text-right tabular-nums', rendu: (l) => (l.experience_annees != null ? t('adm.ans', { n: l.experience_annees }) : '—') },
          { cle: 'vehicule_personnel', libelle: c('vehiculePerso') },
          {
            cle: 'statut', libelle: c('statut'),
            rendu: (l) => <Pastille texte={libelleOpt(l.statut)} ton={{ nouvelle: 'ambre', contactee: 'bleu', acceptee: 'vert', refusee: 'rouge' }[l.statut]} />,
          },
          { cle: 'note_interne', libelle: c('noteInterne'), rendu: (l) => <span className="line-clamp-2 max-w-xs">{l.note_interne || '—'}</span> },
        ],
        champs: [
          { cle: 'nom', section: 'candidat', libelle: c('nom'), requis: true },
          { cle: 'telephone', section: 'candidat', libelle: c('telephone'), requis: true },
          { cle: 'ville', section: 'candidat', libelle: c('ville') },
          { cle: 'experience_annees', section: 'candidat', libelle: c('experienceAns'), type: 'nombre', min: 0, pas: 1 },
          { cle: 'permis_numero', section: 'candidat', libelle: c('permisNumero') },
          { cle: 'vehicule_personnel', section: 'candidat', libelle: c('vehiculePerso') },
          { cle: 'message', section: 'candidat', libelle: c('messageCandidat'), type: 'zone' },
          { cle: 'statut', section: 'traitement', libelle: c('statut'), type: 'select', options: opts('statutsCandidature'), requis: true },
          { cle: 'note_interne', section: 'traitement', libelle: c('noteInterne'), type: 'zone', aide: t('adm.aide.noteInterne') },
        ],
      }

    default:
      return null
  }
}
