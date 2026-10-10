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
    lot: 22,
    date: '10/10/2026',
    titre: 'Capture d\'écran dans la fenêtre d\'assistance',
    description: 'Nouveau pictogramme « Capture d\'écran » au-dessus de la saisie : l\'utilisateur choisit l\'écran ou la fenêtre à montrer, l\'image part au support SAWALI (ordinateur seulement).',
    rubrique: 'Plateforme',
  },
  {
    lot: 21,
    date: '10/10/2026',
    titre: 'Retour à l\'accueil dans la carte de connexion',
    description: 'Le lien « ← Retour à l\'accueil » est maintenant dans la carte Connexion / Inscription, sous « Créer un compte », comme sur beAuthentik.',
    rubrique: 'Plateforme',
  },
  {
    lot: 20,
    date: '10/10/2026',
    titre: 'Fiche technique et comparaison des véhicules',
    description: 'Chaque véhicule a sa fiche technique (intérieur, sièges, écran, audio, climatisation, énergie, sécurité) et le site compare jusqu\'à 3 véhicules côte à côte. Saisie : fiche du véhicule → « Fiche technique ».',
    rubrique: 'Plateforme',
  },
  {
    lot: 19,
    date: '10/10/2026',
    titre: 'Galerie « Nos véhicules » sur l\'accueil',
    description: 'L\'accueil présente chaque véhicule photographié en grand, avec son nom et deux liens : « Découvrir » (page du véhicule) et « Commander ».',
    rubrique: 'Plateforme',
  },
  {
    lot: 17,
    date: '10/10/2026',
    titre: 'Retour au site depuis la connexion',
    description: 'Les pages Connexion et Inscription affichent en haut à gauche un lien « ← Retour au site » vers le site public.',
    rubrique: 'Plateforme',
  },
  {
    lot: 16,
    date: '10/10/2026',
    titre: 'Photos des véhicules à côté des tarifs',
    description: 'Le tableau des tarifs montre les photos des véhicules de chaque catégorie ; un clic ouvre la page du véhicule (photos, description, classe et tarifs). La description se saisit dans la fiche du véhicule.',
    rubrique: 'Plateforme',
  },
  {
    lot: 14,
    date: '09/10/2026',
    titre: 'Version courte dans la barre latérale',
    description: 'La barre latérale du back-office n\'affiche plus que la version et la date de déploiement ; le lot et le commit restent sur la page Paramètres.',
    rubrique: 'Plateforme',
  },
  {
    lot: 13,
    date: '09/10/2026',
    titre: 'Pictogrammes dans la fenêtre d\'assistance',
    description: 'Comme dans le chat SAWALI : emojis, photo, trombone (documents, vidéos) et note vocale transcrite ; les photos et documents du support s\'affichent dans la discussion.',
    rubrique: 'Plateforme',
  },
  {
    lot: 12,
    date: '09/10/2026',
    titre: 'Carte grise des véhicules',
    description: 'Fiche véhicule : cadre Carte grise (n°, titulaire, châssis, puissance fiscale, genre, carrosserie, dates) et scan de la carte grise dans l\'onglet « Documents scannés ».',
    rubrique: 'Plateforme',
  },
  {
    lot: 11,
    date: '09/10/2026',
    titre: 'Visite technique, TVM et documents scannés',
    description: 'Fiche véhicule : cadres Assurance, Visite technique et TVM (référence de la transaction, montant, type de paiement, échéance), alerte d\'échéance TVM, et onglet « Documents scannés » pour stocker les scans (PDF ou photo).',
    rubrique: 'Plateforme',
  },
  {
    lot: 10,
    date: '09/10/2026',
    titre: 'Fiches à onglets et formulaires plus lisibles',
    description: 'Champs de saisie en bleu clair, libellés gris-bleu, fiches rangées par sections ; chaque fiche (véhicule, utilisateur, fournisseur…) a des onglets pour toute sa « vie » : énergie, dépannages, plans, courses, commandes, paiements.',
    rubrique: 'Plateforme',
  },
  {
    lot: 9,
    date: '09/10/2026',
    titre: 'Photos des véhicules',
    description: '4 photos par véhicule (face, cabine avant, cabine arrière, coffre) chargées depuis le back-office ; sur le site, les clients les regardent, zooment et reviennent à leur choix.',
    rubrique: 'Plateforme',
  },
  {
    lot: 8,
    date: '09/10/2026',
    titre: 'Nouveau style du site',
    description: 'Palette indigo et jaune soleil, titres en police Unbounded, simulateur de prix en forme de billet et tarifs présentés en lignes comparatives.',
    rubrique: 'Plateforme',
  },
  {
    lot: 7,
    date: '09/10/2026',
    titre: 'Assistance pour les clients et les chauffeurs',
    description: 'Le pictogramme d\'assistance (support SAWALI) apparaît aussi dans l\'en-tête pour tout utilisateur connecté : client, chauffeur, personnel.',
    rubrique: 'Plateforme',
  },
  {
    lot: 6,
    date: '09/10/2026',
    titre: 'Assistance : discussion avec le support SAWALI',
    description: 'Petit pictogramme « Assistance » dans la barre latérale du back-office : une fenêtre de discussion avec le support SAWALI (requête numérotée, son à chaque réponse).',
    rubrique: 'Plateforme',
  },
  {
    lot: 2,
    date: '09/10/2026',
    titre: 'Paiement en ligne, code WhatsApp, itinéraires et candidatures',
    description: 'Mobile Money et carte, connexion par code WhatsApp, trajets routiers sur la carte, notifications WhatsApp et formulaire « Devenez chauffeur ».',
    rubrique: 'Plateforme',
  },
  {
    lot: 1,
    date: '09/10/2026',
    titre: 'Lancement de bfmobility',
    description: 'Site client (tarifs, commande en 3 étapes, suivi en direct, reçu), espace chauffeur et back-office complet.',
    rubrique: 'Plateforme',
  },
]
