// ============================================================================
// Configurations des écrans de gestion du back-office (utilisées par TableauCrud)
// Une entrée par ressource de l'API /admin/<ressource>.
// configRessource(nom, contexte) renvoie la configuration adaptée au rôle.
//   contexte = { role, categories, monnaie }
// ============================================================================
import BadgeEnergie from '@/composants/BadgeEnergie.jsx'
import { formatDate, formatDateHeure } from '@/lib/format.js'

// --- Listes de choix réutilisées
const opts = (paires) => paires.map(([valeur, libelle]) => ({ valeur, libelle }))
export const ENERGIES = opts([['electrique', '⚡ Électrique'], ['hybride', '🔋 Hybride'], ['thermique', '⛽ Thermique']])
const STATUTS_VEHICULE = opts([['disponible', 'Disponible'], ['en_service', 'En service'], ['maintenance', 'Maintenance'], ['hors_service', 'Hors service']])
const ROLES = opts([['gestionnaire', 'Gestionnaire'], ['chauffeur', 'Chauffeur'], ['mecanicien', 'Mécanicien'], ['client', 'Client']])
const TYPES_ENERGIE = opts([['recharge', 'Recharge électrique'], ['carburant', 'Plein de carburant']])
const TYPES_INTERVENTION = opts([['entretien', 'Entretien'], ['reparation', 'Réparation'], ['controle', 'Contrôle']])
const STATUTS_INTERVENTION = opts([['planifiee', 'Planifiée'], ['en_cours', 'En cours'], ['terminee', 'Terminée']])
const STATUTS_COMMANDE = opts([['brouillon', 'Brouillon'], ['envoyee', 'Envoyée'], ['recue', 'Reçue'], ['annulee', 'Annulée']])
const MOYENS = opts([['virement', 'Virement'], ['especes', 'Espèces'], ['mobile_money', 'Mobile money'], ['cheque', 'Chèque'], ['carte', 'Carte']])

// Libellé d'une option à partir de sa valeur
const libelleDe = (liste, v) => liste.find((o) => o.valeur === v)?.libelle || v || '—'

// --- Pastille colorée générique (statuts)
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
function Echeance({ iso }) {
  if (!iso) return <span className="text-ardoise">—</span>
  const jours = (new Date(iso) - Date.now()) / 86400000
  const classe = jours < 0 ? 'font-bold text-red-600' : jours < 30 ? 'font-bold text-ambre-600' : ''
  return <span className={classe}>{formatDate(iso)}</span>
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
export function configRessource(nom, { role, categories = [], monnaie = (n) => n }) {
  const direction = role === 'admin' || role === 'gestionnaire'
  const optionsCategories = categories.map((c) => ({ valeur: c.code, libelle: c.nom }))
  const argent = (cle) => (l) => <span className="tabular-nums">{monnaie(l[cle])}</span>

  switch (nom) {
    // ------------------------------------------------------------------ Parc
    case 'vehicules':
      return {
        ressource: 'vehicules',
        titre: 'Parc de véhicules',
        description: 'Énergie, immatriculation, confort, kilométrage, statut et échéances des documents.',
        ecriture: direction,
        refs: refs('utilisateurs'),
        filtres: [{ cle: 'statut', libelle: 'Statut', options: STATUTS_VEHICULE }],
        defaut: { statut: 'disponible', energie: 'electrique', places: 4, kilometrage: 0, confort: [] },
        colonnes: [
          { cle: 'immatriculation', libelle: 'Immatriculation', rendu: (l) => <span className="font-mono font-bold">{l.immatriculation}</span> },
          { cle: 'modele', libelle: 'Véhicule', rendu: (l) => `${l.marque || ''} ${l.modele || ''}${l.annee ? ` (${l.annee})` : ''}` },
          { cle: 'energie', libelle: 'Énergie', rendu: (l) => <BadgeEnergie energie={l.energie} /> },
          { cle: 'categorie', libelle: 'Catégorie', rendu: (l) => libelleDe(optionsCategories, l.categorie) },
          { cle: 'kilometrage', libelle: 'Km', classe: 'text-right tabular-nums', rendu: (l) => Number(l.kilometrage || 0).toLocaleString('fr') },
          {
            cle: 'statut', libelle: 'Statut',
            rendu: (l) => <Pastille texte={libelleDe(STATUTS_VEHICULE, l.statut)} ton={{ disponible: 'vert', en_service: 'nuit', maintenance: 'ambre', hors_service: 'rouge' }[l.statut]} />,
          },
          { cle: 'chauffeur_id', libelle: 'Chauffeur', rendu: (l, a) => a.ref('utilisateurs', l.chauffeur_id) },
          { cle: 'assurance_expire', libelle: 'Assurance', rendu: (l) => <Echeance iso={l.assurance_expire} /> },
          { cle: 'controle_technique_expire', libelle: 'Contrôle tech.', rendu: (l) => <Echeance iso={l.controle_technique_expire} /> },
        ],
        champs: [
          { cle: 'immatriculation', libelle: 'Immatriculation', requis: true },
          { cle: 'energie', libelle: 'Énergie', type: 'select', options: ENERGIES, requis: true },
          { cle: 'marque', libelle: 'Marque', requis: true },
          { cle: 'modele', libelle: 'Modèle', requis: true },
          { cle: 'annee', libelle: 'Année', type: 'nombre' },
          { cle: 'couleur', libelle: 'Couleur' },
          { cle: 'categorie', libelle: 'Catégorie', type: 'select', options: optionsCategories, requis: true },
          { cle: 'places', libelle: 'Places', type: 'nombre' },
          { cle: 'confort', libelle: 'Confort', type: 'liste', aide: 'Séparés par des virgules : climatisation, wifi, chargeur…', large: true },
          { cle: 'autonomie_km', libelle: 'Autonomie (km)', type: 'nombre', visible: (f) => f.energie !== 'thermique' },
          { cle: 'capacite_batterie_kwh', libelle: 'Batterie (kWh)', type: 'nombre', visible: (f) => f.energie !== 'thermique' },
          { cle: 'reservoir_l', libelle: 'Réservoir (L)', type: 'nombre', visible: (f) => f.energie !== 'electrique' },
          { cle: 'kilometrage', libelle: 'Kilométrage', type: 'nombre' },
          { cle: 'statut', libelle: 'Statut', type: 'select', options: STATUTS_VEHICULE },
          { cle: 'chauffeur_id', libelle: 'Chauffeur attitré', type: 'ref', ref: 'utilisateurs' },
          { cle: 'assurance_expire', libelle: 'Assurance valable jusqu’au', type: 'date' },
          { cle: 'controle_technique_expire', libelle: 'Contrôle technique jusqu’au', type: 'date' },
          { cle: 'photo_url', libelle: 'Adresse de la photo', large: true },
        ],
      }

    // ------------------------------------------------------------------ Tarifs
    case 'categories':
      return {
        ressource: 'categories',
        titre: 'Catégories et tarifs',
        description: 'Prix au km, à la minute, à l’heure et à la journée ; prise en charge, minimum et promotion.',
        ecriture: direction,
        defaut: { actif: true, energies: ['electrique'], places: 4, ordre: 1 },
        // Promotion : sans pourcentage, on envoie « pas de promo »
        avantEnvoi: (c) => ({ ...c, promo: c.promo?.pourcentage ? c.promo : null }),
        colonnes: [
          { cle: 'ordre', libelle: 'Ordre', classe: 'tabular-nums' },
          { cle: 'nom', libelle: 'Catégorie', rendu: (l) => <><b>{l.nom}</b> <span className="text-ardoise">({l.code})</span></> },
          { cle: 'energies', libelle: 'Énergies', rendu: (l) => <span className="flex flex-wrap gap-1">{(l.energies || []).map((e) => <BadgeEnergie key={e} energie={e} />)}</span> },
          { cle: 'prix_km', libelle: 'Km', classe: 'text-right', rendu: argent('prix_km') },
          { cle: 'prix_minute', libelle: 'Minute', classe: 'text-right', rendu: argent('prix_minute') },
          { cle: 'prix_heure', libelle: 'Heure', classe: 'text-right', rendu: argent('prix_heure') },
          { cle: 'prix_jour', libelle: 'Jour', classe: 'text-right', rendu: argent('prix_jour') },
          { cle: 'minimum', libelle: 'Minimum', classe: 'text-right', rendu: argent('minimum') },
          { cle: 'promo', libelle: 'Promo', rendu: (l) => (l.promo?.pourcentage ? <Pastille texte={`−${l.promo.pourcentage} %`} ton="ambre" /> : '—') },
          { cle: 'actif', libelle: 'Active', rendu: (l) => (l.actif ? <Pastille texte="Oui" ton="vert" /> : <Pastille texte="Non" />) },
        ],
        champs: [
          { cle: 'code', libelle: 'Code', requis: true, aide: 'Court et sans espace (ex. eco, confort, van).' },
          { cle: 'nom', libelle: 'Nom affiché', requis: true },
          { cle: 'description', libelle: 'Description', type: 'zone' },
          { cle: 'energies', libelle: 'Énergies', type: 'liste', aide: 'electrique, hybride, thermique' },
          { cle: 'confort', libelle: 'Confort', type: 'liste' },
          { cle: 'places', libelle: 'Places', type: 'nombre' },
          { cle: 'ordre', libelle: 'Ordre d’affichage', type: 'nombre' },
          { cle: 'prise_en_charge', libelle: 'Prise en charge', type: 'nombre' },
          { cle: 'minimum', libelle: 'Prix minimum', type: 'nombre' },
          { cle: 'prix_km', libelle: 'Prix au km', type: 'nombre', requis: true },
          { cle: 'prix_minute', libelle: 'Prix à la minute', type: 'nombre' },
          { cle: 'prix_heure', libelle: 'Prix à l’heure', type: 'nombre' },
          { cle: 'prix_jour', libelle: 'Prix à la journée', type: 'nombre' },
          { cle: 'promo.pourcentage', libelle: 'Promo : réduction (%)', type: 'nombre' },
          { cle: 'promo.libelle', libelle: 'Promo : libellé' },
          { cle: 'promo.debut', libelle: 'Promo : début', type: 'date' },
          { cle: 'promo.fin', libelle: 'Promo : fin', type: 'date' },
          { cle: 'actif', libelle: 'Catégorie proposée aux clients', type: 'case' },
        ],
      }

    // ------------------------------------------------------------------ Utilisateurs
    case 'utilisateurs':
      return {
        ressource: 'utilisateurs',
        titre: 'Utilisateurs',
        description: 'Chauffeurs, mécaniciens, gestionnaires et clients.',
        ecriture: direction,
        refs: refs('vehicules'),
        filtres: [{ cle: 'role', libelle: 'Rôle', options: role === 'admin' ? [{ valeur: 'admin', libelle: 'Admin' }, ...ROLES] : ROLES }],
        defaut: { role: 'chauffeur', actif: true },
        // Les informations « chauffeur » ne sont envoyées que pour un chauffeur
        avantEnvoi: (c) => { const r = { ...c }; if (r.role !== 'chauffeur') delete r.chauffeur; return r },
        colonnes: [
          { cle: 'nom', libelle: 'Nom', rendu: (l) => <b>{l.nom}</b> },
          { cle: 'telephone', libelle: 'Téléphone' },
          { cle: 'email', libelle: 'E-mail' },
          { cle: 'role', libelle: 'Rôle', rendu: (l) => <Pastille texte={l.role} ton={{ admin: 'nuit', gestionnaire: 'bleu', chauffeur: 'vert', mecanicien: 'ambre' }[l.role] || 'gris'} /> },
          { cle: 'en_ligne', libelle: 'En ligne', rendu: (l) => (l.role === 'chauffeur' ? (l.chauffeur?.en_ligne ? <Pastille texte="En ligne" ton="vert" /> : <Pastille texte="Hors ligne" />) : '—') },
          { cle: 'note', libelle: 'Note', rendu: (l) => (l.chauffeur?.note_moyenne != null ? `★ ${Number(l.chauffeur.note_moyenne).toFixed(1)} (${l.chauffeur.nb_notes || 0})` : '—') },
          { cle: 'permis', libelle: 'Permis', rendu: (l) => (l.chauffeur ? <Echeance iso={l.chauffeur.permis_expire} /> : '—') },
          { cle: 'actif', libelle: 'Actif', rendu: (l) => (l.actif ? 'Oui' : <Pastille texte="Désactivé" ton="rouge" />) },
        ],
        champs: [
          { cle: 'nom', libelle: 'Nom complet', requis: true },
          { cle: 'telephone', libelle: 'Téléphone', requis: true },
          { cle: 'email', libelle: 'E-mail' },
          { cle: 'role', libelle: 'Rôle', type: 'select', requis: true, options: role === 'admin' ? [{ valeur: 'admin', libelle: 'Admin' }, ...ROLES] : ROLES },
          { cle: 'mot_de_passe', libelle: 'Mot de passe', type: 'motdepasse', aide: 'Obligatoire à la création ; vide = inchangé en modification.' },
          { cle: 'actif', libelle: 'Compte actif', type: 'case' },
          { cle: 'chauffeur.permis_numero', libelle: 'N° de permis', visible: (f) => f.role === 'chauffeur' },
          { cle: 'chauffeur.permis_expire', libelle: 'Permis valable jusqu’au', type: 'date', visible: (f) => f.role === 'chauffeur' },
          { cle: 'chauffeur.vehicule_id', libelle: 'Véhicule', type: 'ref', ref: 'vehicules', visible: (f) => f.role === 'chauffeur' },
        ],
      }

    // ------------------------------------------------------------------ Énergie
    case 'energie':
      return {
        ressource: 'energie',
        titre: 'Énergie',
        description: 'Recharges électriques et pleins de carburant. Chaque saisie met à jour le kilométrage du véhicule.',
        ecriture: direction,
        refs: refs('vehicules'),
        filtres: [{ cle: 'type', libelle: 'Type', options: TYPES_ENERGIE }],
        defaut: { type: 'recharge' },
        colonnes: [
          { cle: 'le', libelle: 'Date', rendu: (l) => formatDateHeure(l.le) },
          { cle: 'vehicule_id', libelle: 'Véhicule', rendu: (l, a) => a.ref('vehicules', l.vehicule_id) },
          { cle: 'type', libelle: 'Type', rendu: (l) => (l.type === 'recharge' ? '⚡ Recharge' : '⛽ Carburant') },
          { cle: 'quantite', libelle: 'Quantité', classe: 'text-right tabular-nums', rendu: (l) => `${l.quantite} ${l.type === 'recharge' ? 'kWh' : 'L'}` },
          { cle: 'cout', libelle: 'Coût', classe: 'text-right', rendu: argent('cout') },
          { cle: 'kilometrage', libelle: 'Km compteur', classe: 'text-right tabular-nums' },
          { cle: 'station', libelle: 'Station' },
        ],
        champs: [
          { cle: 'vehicule_id', libelle: 'Véhicule', type: 'ref', ref: 'vehicules', requis: true, large: true },
          { cle: 'type', libelle: 'Type', type: 'select', options: TYPES_ENERGIE, requis: true },
          { cle: 'le', libelle: 'Date et heure', type: 'dateheure' },
          { cle: 'quantite', libelle: 'Quantité (kWh ou L)', type: 'nombre', requis: true },
          { cle: 'cout', libelle: 'Coût', type: 'nombre', requis: true },
          { cle: 'kilometrage', libelle: 'Kilométrage', type: 'nombre', requis: true },
          { cle: 'station', libelle: 'Station' },
        ],
      }

    // ------------------------------------------------------------------ Plans de maintenance
    case 'plans':
      return {
        ressource: 'plans',
        titre: 'Plans de maintenance',
        description: 'Entretiens périodiques par véhicule ou par énergie : tous les X km ou tous les X jours.',
        ecriture: true,
        refs: refs('vehicules', 'pieces'),
        colonnes: [
          { cle: 'libelle', libelle: 'Plan', rendu: (l) => <b>{l.libelle}</b> },
          { cle: 'vehicule_id', libelle: 'Véhicule', rendu: (l, a) => (l.vehicule_id ? a.ref('vehicules', l.vehicule_id) : 'Tous') },
          { cle: 'energie', libelle: 'Énergie', rendu: (l) => (l.energie ? <BadgeEnergie energie={l.energie} /> : '—') },
          { cle: 'intervalle', libelle: 'Intervalle', rendu: (l) => [l.intervalle_km && `${l.intervalle_km} km`, l.intervalle_jours && `${l.intervalle_jours} j`].filter(Boolean).join(' ou ') || '—' },
          { cle: 'dernier', libelle: 'Dernière fois', rendu: (l) => [l.dernier_km != null && `${l.dernier_km} km`, l.derniere_date && formatDate(l.derniere_date)].filter(Boolean).join(', ') || '—' },
          { cle: 'piece_id', libelle: 'Pièce', rendu: (l, a) => (l.piece_id ? a.ref('pieces', l.piece_id) : '—') },
        ],
        champs: [
          { cle: 'libelle', libelle: 'Libellé', requis: true, large: true },
          { cle: 'vehicule_id', libelle: 'Véhicule (vide = tous)', type: 'ref', ref: 'vehicules' },
          { cle: 'energie', libelle: 'Énergie concernée', type: 'select', options: ENERGIES },
          { cle: 'intervalle_km', libelle: 'Tous les … km', type: 'nombre' },
          { cle: 'intervalle_jours', libelle: 'Tous les … jours', type: 'nombre' },
          { cle: 'dernier_km', libelle: 'Dernier entretien (km)', type: 'nombre' },
          { cle: 'derniere_date', libelle: 'Dernier entretien (date)', type: 'date' },
          { cle: 'piece_id', libelle: 'Pièce habituelle', type: 'ref', ref: 'pieces' },
        ],
      }

    // ------------------------------------------------------------------ Interventions
    case 'interventions':
      return {
        ressource: 'interventions',
        titre: 'Interventions',
        description: 'Travaux des mécaniciens. Terminer une intervention retire les pièces du stock et remet le plan à zéro.',
        ecriture: true,
        refs: refs('vehicules', 'pieces', 'utilisateurs', 'plans'),
        filtres: [{ cle: 'statut', libelle: 'Statut', options: STATUTS_INTERVENTION }],
        defaut: { type: 'entretien', statut: 'planifiee', pieces: [], main_oeuvre: 0 },
        actions: [
          {
            libelle: 'Terminer',
            visible: (l) => l.statut !== 'terminee',
            executer: async (l, { api, toast, recharger, attente }) => {
              if (!window.confirm('Terminer cette intervention ? Les pièces seront retirées du stock.')) return
              await attente(api.patch(`/admin/interventions/${l.id}`, { statut: 'terminee' }))
              toast.succes('Intervention terminée.')
              recharger()
            },
          },
        ],
        colonnes: [
          { cle: 'le', libelle: 'Date', rendu: (l) => formatDate(l.le) },
          { cle: 'vehicule_id', libelle: 'Véhicule', rendu: (l, a) => a.ref('vehicules', l.vehicule_id) },
          { cle: 'type', libelle: 'Type', rendu: (l) => libelleDe(TYPES_INTERVENTION, l.type) },
          { cle: 'description', libelle: 'Description', rendu: (l) => <span className="line-clamp-2 max-w-xs">{l.description}</span> },
          { cle: 'pieces', libelle: 'Pièces', rendu: (l) => (l.pieces?.length ? `${l.pieces.length} réf.` : '—') },
          { cle: 'main_oeuvre', libelle: 'Main-d’œuvre', classe: 'text-right', rendu: argent('main_oeuvre') },
          { cle: 'mecanicien_id', libelle: 'Mécanicien', rendu: (l, a) => a.ref('utilisateurs', l.mecanicien_id) },
          { cle: 'statut', libelle: 'Statut', rendu: (l) => <Pastille texte={libelleDe(STATUTS_INTERVENTION, l.statut)} ton={{ planifiee: 'bleu', en_cours: 'ambre', terminee: 'vert' }[l.statut]} /> },
        ],
        champs: [
          { cle: 'vehicule_id', libelle: 'Véhicule', type: 'ref', ref: 'vehicules', requis: true },
          { cle: 'type', libelle: 'Type', type: 'select', options: TYPES_INTERVENTION, requis: true },
          { cle: 'description', libelle: 'Description', type: 'zone', requis: true },
          { cle: 'kilometrage', libelle: 'Kilométrage', type: 'nombre' },
          { cle: 'le', libelle: 'Date', type: 'dateheure' },
          { cle: 'mecanicien_id', libelle: 'Mécanicien', type: 'ref', ref: 'utilisateurs' },
          { cle: 'plan_id', libelle: 'Plan de maintenance', type: 'ref', ref: 'plans' },
          { cle: 'main_oeuvre', libelle: 'Main-d’œuvre', type: 'nombre' },
          { cle: 'statut', libelle: 'Statut', type: 'select', options: STATUTS_INTERVENTION },
          {
            cle: 'pieces', libelle: 'Pièces utilisées', type: 'lignes',
            sousChamps: [
              { cle: 'piece_id', libelle: 'Pièce', type: 'ref', ref: 'pieces', requis: true },
              { cle: 'quantite', libelle: 'Qté', type: 'nombre', requis: true },
            ],
          },
        ],
      }

    // ------------------------------------------------------------------ Pièces
    case 'pieces':
      return {
        ressource: 'pieces',
        titre: 'Pièces détachées',
        description: 'Stock, seuil d’alerte, prix et emplacement. « Mouvement » ajoute ou retire du stock avec un motif.',
        ecriture: true,
        refs: refs('fournisseurs'),
        defaut: { quantite: 0, seuil_alerte: 1, compatibilites: [] },
        actions: [
          {
            libelle: 'Mouvement',
            executer: async (l, { api, toast, recharger, attente }) => {
              const q = window.prompt(`Quantité à ajouter (+) ou retirer (−) pour « ${l.nom} » :`, '1')
              if (q === null || q.trim() === '' || Number.isNaN(Number(q))) return
              const motif = window.prompt('Motif du mouvement :', Number(q) > 0 ? 'Entrée en stock' : 'Sortie')
              if (motif === null) return
              await attente(api.post(`/admin/pieces/${l.id}/mouvement`, { quantite: Number(q), motif }))
              toast.succes('Stock mis à jour.')
              recharger()
            },
          },
        ],
        colonnes: [
          { cle: 'reference', libelle: 'Référence', rendu: (l) => <span className="font-mono">{l.reference}</span> },
          { cle: 'nom', libelle: 'Pièce', rendu: (l) => <b>{l.nom}</b> },
          { cle: 'categorie', libelle: 'Catégorie' },
          {
            cle: 'quantite', libelle: 'Stock', classe: 'text-right tabular-nums',
            rendu: (l) => <span className={Number(l.quantite) <= Number(l.seuil_alerte) ? 'font-bold text-red-600' : ''}>{l.quantite}</span>,
          },
          { cle: 'seuil_alerte', libelle: 'Seuil', classe: 'text-right tabular-nums' },
          { cle: 'prix_unitaire', libelle: 'Prix unitaire', classe: 'text-right', rendu: argent('prix_unitaire') },
          { cle: 'fournisseur_id', libelle: 'Fournisseur', rendu: (l, a) => a.ref('fournisseurs', l.fournisseur_id) },
          { cle: 'emplacement', libelle: 'Emplacement' },
        ],
        champs: [
          { cle: 'reference', libelle: 'Référence', requis: true },
          { cle: 'nom', libelle: 'Nom', requis: true },
          { cle: 'categorie', libelle: 'Catégorie' },
          { cle: 'emplacement', libelle: 'Emplacement' },
          { cle: 'compatibilites', libelle: 'Compatible avec', type: 'liste', large: true, aide: 'Modèles séparés par des virgules.' },
          { cle: 'quantite', libelle: 'Quantité en stock', type: 'nombre' },
          { cle: 'seuil_alerte', libelle: 'Seuil d’alerte', type: 'nombre' },
          { cle: 'prix_unitaire', libelle: 'Prix unitaire', type: 'nombre' },
          { cle: 'fournisseur_id', libelle: 'Fournisseur', type: 'ref', ref: 'fournisseurs' },
        ],
      }

    // ------------------------------------------------------------------ Fournisseurs
    case 'fournisseurs':
      return {
        ressource: 'fournisseurs',
        titre: 'Fournisseurs',
        description: 'Coordonnées, conditions de paiement et solde (commandes reçues moins paiements).',
        ecriture: direction,
        colonnes: [
          { cle: 'nom', libelle: 'Fournisseur', rendu: (l) => <b>{l.nom}</b> },
          { cle: 'contact', libelle: 'Contact' },
          { cle: 'telephone', libelle: 'Téléphone' },
          { cle: 'pays', libelle: 'Pays' },
          { cle: 'total_commandes', libelle: 'Commandes', classe: 'text-right', rendu: argent('total_commandes') },
          { cle: 'total_paye', libelle: 'Payé', classe: 'text-right', rendu: argent('total_paye') },
          { cle: 'solde', libelle: 'Solde', classe: 'text-right', rendu: (l) => <b className={Number(l.solde) > 0 ? 'text-ambre-600' : ''}>{monnaie(l.solde)}</b> },
        ],
        champs: [
          { cle: 'nom', libelle: 'Nom', requis: true },
          { cle: 'contact', libelle: 'Personne à contacter' },
          { cle: 'telephone', libelle: 'Téléphone' },
          { cle: 'email', libelle: 'E-mail' },
          { cle: 'adresse', libelle: 'Adresse', large: true },
          { cle: 'pays', libelle: 'Pays' },
          { cle: 'conditions_paiement', libelle: 'Conditions de paiement' },
        ],
      }

    // ------------------------------------------------------------------ Commandes fournisseurs
    case 'commandes':
      return {
        ressource: 'commandes',
        titre: 'Commandes fournisseurs',
        description: '« Recevoir » une commande ajoute ses pièces au stock.',
        ecriture: direction,
        refs: refs('fournisseurs', 'pieces'),
        filtres: [{ cle: 'statut', libelle: 'Statut', options: STATUTS_COMMANDE }],
        defaut: { statut: 'brouillon', lignes: [] },
        actions: direction ? [
          {
            libelle: 'Recevoir',
            visible: (l) => l.statut === 'envoyee' || l.statut === 'brouillon',
            executer: async (l, { api, toast, recharger, attente }) => {
              if (!window.confirm(`Réceptionner la commande ${l.numero || ''} ? Les pièces seront ajoutées au stock.`)) return
              await attente(api.post(`/admin/commandes/${l.id}/recevoir`))
              toast.succes('Commande reçue, stock mis à jour.')
              recharger()
            },
          },
        ] : [],
        colonnes: [
          { cle: 'numero', libelle: 'N°', rendu: (l) => <span className="font-mono font-bold">{l.numero || `#${l.id}`}</span> },
          { cle: 'fournisseur_id', libelle: 'Fournisseur', rendu: (l, a) => a.ref('fournisseurs', l.fournisseur_id) },
          { cle: 'lignes', libelle: 'Lignes', rendu: (l) => l.lignes?.length || 0 },
          { cle: 'total', libelle: 'Total', classe: 'text-right', rendu: argent('total') },
          { cle: 'statut', libelle: 'Statut', rendu: (l) => <Pastille texte={libelleDe(STATUTS_COMMANDE, l.statut)} ton={{ brouillon: 'gris', envoyee: 'bleu', recue: 'vert', annulee: 'rouge' }[l.statut]} /> },
          { cle: 'note', libelle: 'Note' },
        ],
        champs: [
          { cle: 'fournisseur_id', libelle: 'Fournisseur', type: 'ref', ref: 'fournisseurs', requis: true },
          { cle: 'statut', libelle: 'Statut', type: 'select', options: STATUTS_COMMANDE.filter((o) => o.valeur !== 'recue') },
          {
            cle: 'lignes', libelle: 'Lignes de la commande', type: 'lignes',
            sousChamps: [
              { cle: 'piece_id', libelle: 'Pièce', type: 'ref', ref: 'pieces', requis: true },
              { cle: 'quantite', libelle: 'Qté', type: 'nombre', requis: true },
              { cle: 'prix_unitaire', libelle: 'Prix u.', type: 'nombre' },
            ],
          },
          { cle: 'note', libelle: 'Note', type: 'zone' },
        ],
      }

    // ------------------------------------------------------------------ Paiements fournisseurs
    case 'paiements-fournisseurs':
      return {
        ressource: 'paiements-fournisseurs',
        titre: 'Paiements fournisseurs',
        description: 'Règlements des fournisseurs ; le solde de chaque fournisseur est recalculé.',
        ecriture: direction,
        refs: refs('fournisseurs', 'commandes'),
        defaut: { moyen: 'virement' },
        colonnes: [
          { cle: 'le', libelle: 'Date', rendu: (l) => formatDate(l.le) },
          { cle: 'fournisseur_id', libelle: 'Fournisseur', rendu: (l, a) => a.ref('fournisseurs', l.fournisseur_id) },
          { cle: 'commande_id', libelle: 'Commande', rendu: (l, a) => (l.commande_id ? a.ref('commandes', l.commande_id) : '—') },
          { cle: 'montant', libelle: 'Montant', classe: 'text-right', rendu: argent('montant') },
          { cle: 'moyen', libelle: 'Moyen', rendu: (l) => libelleDe(MOYENS, l.moyen) },
          { cle: 'reference', libelle: 'Référence' },
        ],
        champs: [
          { cle: 'fournisseur_id', libelle: 'Fournisseur', type: 'ref', ref: 'fournisseurs', requis: true },
          { cle: 'commande_id', libelle: 'Commande (facultatif)', type: 'ref', ref: 'commandes' },
          { cle: 'montant', libelle: 'Montant', type: 'nombre', requis: true },
          { cle: 'moyen', libelle: 'Moyen', type: 'select', options: MOYENS, requis: true },
          { cle: 'reference', libelle: 'Référence' },
          { cle: 'le', libelle: 'Date', type: 'date' },
        ],
      }

    default:
      return null
  }
}
