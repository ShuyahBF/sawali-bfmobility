// ============================================================================
// NOUVEAUTÉS PAR LOT (règle 5 du propriétaire : systématique à chaque lot)
// ----------------------------------------------------------------------------
// À CHAQUE déploiement : ajouter EN TÊTE une entrée avec le MÊME numéro que
// LOT dans src/version.js. La carte est affichée dans Paramètres → « Nouveautés »
// et ouvre la rubrique des Paramètres indiquée par `rubrique` (titre exact de
// la rubrique, voir pages/admin/Parametres.jsx), jamais l'écran d'utilisation.
// ============================================================================
export const NOUVEAUTES = [
  {
    lot: 1,
    date: '09/10/2026',
    titre: 'Lancement de bfmobility',
    description: 'Site client (tarifs, commande en 3 étapes, suivi en direct, reçu), espace chauffeur et back-office complet.',
    rubrique: 'Plateforme',
  },
]
