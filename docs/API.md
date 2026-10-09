# sawali-bfmobility — contrat d'API (lot 1)

Toutes les routes sont préfixées par `/api`. Authentification : en-tête `Authorization: Bearer <jeton>`
(jeton obtenu à la connexion). Réponses en JSON ; erreurs : `{"detail": "message en français"}`.
Montants : nombres dans la **devise de la plateforme** (paramètre `devise`, ex. `XOF`, `EUR`, `USD`) ;
distances en km (l'affichage peut convertir en miles si `unite_distance = "mi"`).
Dates : ISO 8601 UTC.

## Rôles
| Rôle | Qui | Accès |
|---|---|---|
| `admin` | direction de la société | tout |
| `gestionnaire` | gestion du parc / exploitation | tout sauf paramètres et comptes admin |
| `chauffeur` | conducteur | ses courses, sa disponibilité, sa position, ses pleins/recharges |
| `mecanicien` | atelier | interventions, pièces, plans de maintenance (lecture parc) |
| `client` | passager | réservations, paiements, reçus, notes |

## Public
- `GET /health` → `{ok:true}`
- `GET /version` → `{version, lot, commit, demarrage, libelle, libelle_detaille}`
- `GET /public/config` → `{nom, slogan, pays, devise, langue, fuseau, unite_distance, telephone_support, email_support, pays_disponibles:[{code,nom,devise,langue,indicatif}]}`
- `GET /public/categories` → `[{code, nom, description, energies:["electrique","hybride","thermique"], places, confort:[…], prise_en_charge, prix_km, prix_minute, prix_heure, prix_jour, minimum, promo:{pourcentage, libelle, debut, fin}|null, promo_active:bool, vehicules_disponibles:int}]`
- `POST /public/estimation` body `{depart:{lat,lng}, arrivee:{lat,lng}|null, categorie, mode:"course"|"heure"|"jour", duree_heures?:number, quand?:ISO}`
  → `{distance_km, duree_min, prix, prix_sans_promo, devise, majoration_nuit:bool, detail:[{libelle, montant}]}`

## Authentification
- `POST /auth/inscription` `{nom, telephone, email?, mot_de_passe, langue?}` → `{jeton, utilisateur}` (rôle client)
- `POST /auth/connexion` `{identifiant (email ou téléphone), mot_de_passe}` → `{jeton, utilisateur}`
- `GET /auth/moi` → utilisateur
- `PATCH /auth/moi` `{nom?, email?, langue?, mot_de_passe?}` → utilisateur

`utilisateur` = `{id, nom, email, telephone, role, langue, actif, chauffeur?:{vehicule_id, en_ligne, note_moyenne, nb_notes, permis_numero, permis_expire}}`

## Courses (client)
- `POST /courses` `{mode, categorie, depart:{lat,lng,adresse}, arrivee:{lat,lng,adresse}|null, quand?:ISO, duree_heures?, paiement:"especes"|"mobile_money"|"carte", note_client?}` → course
- `GET /courses/mes` → `[course]` (client : les siennes ; chauffeur : les siennes)
- `GET /courses/{id}` → course (client propriétaire, chauffeur affecté, admin/gestionnaire)
- `POST /courses/{id}/annuler` `{motif?}` → course
- `POST /courses/{id}/payer` `{moyen, telephone?}` → course (paiement enregistré « en_attente » ou « paye »)
- `POST /courses/{id}/noter` `{note:1..5, commentaire?}` → course
- `GET /courses/{id}/recu` → `{numero, date, societe:{nom, telephone, email, pays}, client:{nom, telephone}, chauffeur:{nom}, vehicule:{modele, immatriculation}, trajet:{depart, arrivee, distance_km, duree_min}, lignes:[{libelle, montant}], total, devise, paiement:{moyen, statut, reference}}`
- `GET /courses/{id}/messages` → `[{id, auteur_id, auteur_nom, role, texte, le}]`
- `POST /courses/{id}/messages` `{texte}` → message

`course` = `{id, numero, statut, mode, categorie, depart, arrivee, quand, duree_heures, distance_km, duree_min,
prix_estime, prix_final, devise, paiement:{moyen, statut:"non_paye"|"en_attente"|"paye", reference}, client:{id, nom, telephone},
chauffeur:{id, nom, telephone, note_moyenne, position:{lat,lng,le}}|null, vehicule:{id, marque, modele, couleur, immatriculation, energie}|null,
note_client, evaluation:{note, commentaire}|null, historique:[{statut, le}], cree_le}`

Statuts : `recherche` → `acceptee` → `en_approche` → `arrivee` → `en_cours` → `terminee` ; ou `annulee`.
Réservation (`quand` dans le futur) : statut `planifiee` jusqu'à 30 min avant, puis `recherche`.

## Chauffeur
- `POST /chauffeur/disponibilite` `{en_ligne:bool, lat?, lng?}` → utilisateur
- `POST /chauffeur/position` `{lat, lng}` → `{ok}`
- `GET /chauffeur/courses` → `{proposees:[course], en_cours:course|null, recentes:[course]}`
- `POST /courses/{id}/accepter` → course
- `POST /courses/{id}/statut` `{statut:"en_approche"|"arrivee"|"en_cours"|"terminee", km_reel?:number, encaisse?:bool}` → course
- `POST /chauffeur/energie` `{type:"recharge"|"carburant", quantite, cout, kilometrage, station?}` → saisie (véhicule du chauffeur)

## Back-office (admin, gestionnaire ; mécanicien sur pièces/interventions/plans)
Listes : `GET /admin/<ressource>?q=&limite=` ; création `POST`, modification `PATCH /admin/<ressource>/{id}`, suppression `DELETE`.
- `vehicules` : `{marque, modele, annee, immatriculation, energie, categorie, couleur, places, confort:[…], autonomie_km?, capacite_batterie_kwh?, reservoir_l?, kilometrage, statut:"disponible"|"en_service"|"maintenance"|"hors_service", chauffeur_id?, assurance_expire?, controle_technique_expire?, photo_url?}`
- `categories` (tarifs) : `{code, nom, description, energies, places, confort, prise_en_charge, prix_km, prix_minute, prix_heure, prix_jour, minimum, promo, actif, ordre}`
- `utilisateurs` : `{nom, telephone, email?, role, mot_de_passe?, actif, chauffeur?:{permis_numero, permis_expire, vehicule_id}}` (rôle `admin` réservé à l'admin)
- `energie` : `{vehicule_id, type, quantite, cout, kilometrage, station?, le?}` (met à jour le kilométrage du véhicule)
- `plans` (plans de maintenance) : `{vehicule_id?, energie?, libelle, intervalle_km?, intervalle_jours?, dernier_km?, derniere_date?, piece_id?}`
- `interventions` : `{vehicule_id, mecanicien_id?, type:"entretien"|"reparation"|"controle", description, kilometrage, pieces:[{piece_id, quantite}], main_oeuvre, statut:"planifiee"|"en_cours"|"terminee", plan_id?, le?}` (terminer décrémente le stock et remet le plan à zéro)
- `pieces` : `{reference, nom, categorie, compatibilites:[…], quantite, seuil_alerte, prix_unitaire, fournisseur_id?, emplacement?}`
- `POST /admin/pieces/{id}/mouvement` `{quantite (+/-), motif}` → pièce
- `fournisseurs` : `{nom, contact, telephone, email, adresse, pays, conditions_paiement}` (+ champs calculés `total_commandes, total_paye, solde`)
- `commandes` : `{fournisseur_id, lignes:[{piece_id, quantite, prix_unitaire}], statut:"brouillon"|"envoyee"|"recue"|"annulee", note}` (+ `numero, total`) ; `POST /admin/commandes/{id}/recevoir` ajoute au stock
- `paiements-fournisseurs` : `{fournisseur_id, commande_id?, montant, moyen, reference?, le?}`
- `GET /admin/courses?statut=` ; `POST /admin/courses/{id}/affecter` `{chauffeur_id}`
- `GET /admin/alertes` → `[{type:"maintenance"|"stock"|"document"|"autonomie", gravite:"info"|"attention"|"urgent", message, vehicule_id?, piece_id?}]`
- `GET /admin/tableau-de-bord` → `{courses_jour, chiffre_jour, chiffre_mois, courses_mois, vehicules:{total, disponibles, en_service, maintenance}, chauffeurs_en_ligne, note_moyenne, energie_mois:{cout, kwh, litres}, maintenance_mois, alertes, par_categorie:[{categorie, courses, chiffre}], par_energie:[{energie, km, cout_energie}], courses_7j:[{jour, courses, chiffre}]}`
- `GET /admin/parametres` / `PATCH /admin/parametres` (admin) : `{nom, slogan, pays, devise, langue, fuseau, unite_distance, vitesse_moyenne_kmh, facteur_route, majoration_nuit_pct, nuit_debut, nuit_fin, commission_pct, telephone_support, email_support}`

---
# Lot 2 — compléments

## Configuration publique (champs ajoutés)
`GET /public/config` renvoie aussi :
`paiements_en_ligne: {mobile_money: bool, carte: bool, especes: true}` (moyens réellement configurés) et
`connexion_par_code: bool` (connexion par code WhatsApp disponible).

## Estimation (champs ajoutés)
`POST /public/estimation` renvoie aussi `trace: [[lat,lng],…] | null` (itinéraire routier à dessiner sur la carte)
et `source_distance: "route" | "estimation" | "aucune"`. La course créée garde ce `trace`.

## Connexion par code WhatsApp (sans mot de passe)
- `POST /auth/otp/demande` `{telephone}` → `{envoye, canal:"whatsapp"|"sms", compte_existant, duree_min}`
  (429 si redemandé avant 1 min ou plus de 5 codes/heure ; 503 si aucun canal d'envoi configuré)
- `POST /auth/otp/verification` `{telephone, code, nom?}` → `{jeton, utilisateur}` ; `nom` obligatoire si `compte_existant` était faux (422 sinon).

## Paiement en ligne
- `GET /paiements/moyens` → `{mobile_money, carte, especes}`
- `POST /paiements/courses/{id}/mobile-money` `{telephone?}` → `{reference, adresse}` : rediriger le navigateur vers `adresse` (page pawaPay)
- `POST /paiements/courses/{id}/carte` → `{reference, adresse}` : rediriger vers `adresse` (Stripe Checkout)
- Retour sur le site : `/courses/{id}?paiement={reference}` (ou `?paiement=annule`) → appeler
  `GET /paiements/{reference}?rafraichir=true` → `{statut:"initie"|"en_attente"|"en_cours"|"paye"|"echec"|"montant_incoherent", moyen, montant, devise, message?}` ;
  réinterroger toutes les 4 s tant que `en_attente`/`en_cours` (max 2 min), puis recharger la course.
- Une **course** se paie en ligne quand elle est `terminee` (prix définitif) ; une **location** (heure/jour) dès la commande. Sinon 409.
- 503 si l'opérateur n'est pas configuré (le site masque alors le bouton grâce à `paiements_en_ligne`).

## Courses (actions ajoutées)
- `POST /courses/{id}/relancer` (client) : relance la recherche dans un rayon élargi (statut `recherche` seulement, sinon 409).
- `POST /courses/{id}/refuser` (chauffeur) : retire la course de ses propositions → `{ok:true}`.
- `POST /courses/{id}/liberer` `{motif?}` (chauffeur affecté, avant `en_cours`) : la course repart en `recherche` → course.

## Candidatures chauffeurs
- `POST /public/candidatures` `{nom, telephone, ville?, experience_annees?, permis_numero?, vehicule_personnel?, message?}` → `{ok:true}` (409 si déjà déposée aujourd'hui)
- Back-office : ressource générique `candidatures` (`statut: nouvelle|contactee|acceptee|refusee`, `note_interne`).

## Paramètres (champs ajoutés)
`itineraire_routier: bool`, `notifications_whatsapp: bool`, `rayon_recherche_km: number`.

## Notifications WhatsApp (automatiques, rien à appeler)
Client prévenu : chauffeur en route (avec lien de suivi), chauffeur arrivé, course terminée (avec lien du reçu),
chauffeur désisté (recherche d'un autre), course annulée par la société, réservation enregistrée.
