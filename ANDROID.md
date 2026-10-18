# bfmobility sur Android (application installable, lot 36)

Le site est une **application installable** : icône sur l'écran d'accueil, ouverture plein écran, page « Pas de connexion ».
Elle se met à jour toute seule : elle charge toujours la dernière version du site.

## 1. Installer tout de suite sur un téléphone (sans Play Store)
Avec Chrome : ouvrir le site, puis toucher le bouton **Installer l'application** (page de connexion ou bas du site).
Si le bouton ne lance rien, la petite fenêtre explique le geste : menu ⋮ de Chrome, puis *Installer l'application*.

## 2. Fabriquer l'application Android avec PWABuilder (sans Android Studio, sans ligne de commande)
Tout se fait avec des clics sur un site web.

1. Ouvrir **https://www.pwabuilder.com**.
2. Saisir l'adresse du site : **https://sawalismartsysems.com** puis cliquer **Start**.
3. Vérifier que le manifeste et le « Service Worker » sont bien détectés (coches vertes), puis cliquer **Package for stores**, puis **Android**.
4. Remplir les deux champs importants :
   - **Nom de l'application** : `bfmobility`
   - **Identifiant du paquet (Package ID)** : `com.sawali.bfmobility` (à ne plus jamais changer ensuite)
5. Laisser le reste par défaut. Pour la **clé de signature**, choisir « Créer une nouvelle clé » (PWABuilder la génère).
6. Cliquer **Download** : on obtient un fichier **ZIP**. L'enregistrer dans un dossier sûr.
7. Dans le ZIP se trouvent : le fichier de l'application (.apk pour tester, .aab pour le Play Store), le **fichier de clé de signature** (.keystore) et un fichier texte avec les mots de passe de la clé.
   **Garder ce ZIP précieusement** (copie sur une clé USB ou un disque sûr) : sans la clé, impossible de publier une mise à jour de l'application.
8. Dans le ZIP, un fichier **signing-key-info.txt** (ou équivalent) donne l'**empreinte SHA-256** de la clé : une longue suite du type `AB:CD:12:...`.
   Cette empreinte n'est PAS un secret : **la donner à Claude** dans le chat. Il l'ajoute dans `frontend/public/.well-known/assetlinks.json`.
9. Sans cette empreinte, l'application affiche une barre d'adresse en haut. Une fois l'empreinte ajoutée et le site redéployé, la barre disparaît (application plein écran).

## 3. Règles de sécurité à retenir
- **Ne jamais envoyer** à Claude ni dans le chat, ni mettre dans le dépôt GitHub : le fichier de clé (.keystore), les mots de passe de la clé, ni le ZIP complet.
- Seule l'**empreinte SHA-256** peut être partagée.

## 4. Avertissement : localisation du téléphone
Dans une application de ce type (site empaqueté), la localisation du téléphone est **moins fiable qu'une application Android native** :
elle peut être moins précise, s'interrompre quand l'écran s'éteint ou que l'application passe en arrière-plan.
**À tester sur un vrai téléphone** avant de s'appuyer dessus pour le suivi en temps réel des chauffeurs.

## Contenu technique (pour mémoire)
- `frontend/public/manifest.json` : nom, icônes (192, 512, 512 « maskable »), couleurs (indigo `#1A1650`), plein écran.
- `frontend/public/sw.js` : affiche `offline.html` quand Internet manque ; rien d'autre n'est mis en cache.
- `frontend/public/.well-known/assetlinks.json` : lien site ↔ application (vide `[]` tant que l'empreinte n'est pas fournie).
  Sur Render, les fichiers du site passent avant la réécriture « /* → index.html » : ce fichier est bien servi.
- `frontend/src/composants/InstallerApplication.jsx` : bouton « Installer l'application ».
- Icônes : tirées du vrai logo (goutte jaune et éclair) de `src/composants/Logo.jsx`, sur fond indigo.
