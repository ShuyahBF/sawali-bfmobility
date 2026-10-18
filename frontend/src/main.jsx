// ============================================================================
// Point d'entrée du site : fournisseurs globaux (langue, toasts, configuration,
// authentification, routeur) puis l'application.
// ============================================================================
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { LangueProvider } from '@/i18n/index.jsx'
import { ToastsProvider } from '@/composants/Toasts.jsx'
import { ConfigProvider } from '@/contexte/Config.jsx'
import { AuthProvider } from '@/contexte/Auth.jsx'
// Règle 9 — Ctrl + Espace / double-clic : reprendre le texte par défaut (gris) d'un champ pour le modifier
import { installerValeurParDefaut } from "./lib/valeurParDefaut";

installerValeurParDefaut();

// Application Android installable : le « service worker » est enregistré DÈS le démarrage du site (il n'affiche que la
// page « Pas de connexion » quand Internet manque ; rien d'autre n'est mis en cache).
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {})
}

// Garde de côté l'invitation d'installation de Chrome (événement « beforeinstallprompt »), même si le bouton
// « Installer l'application » n'est pas encore affiché : il la retrouve dans window.__bfmInvite.
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); window.__bfmInvite = e })

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LangueProvider>
      <ToastsProvider>
        <ConfigProvider>
          <AuthProvider>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </AuthProvider>
        </ConfigProvider>
      </ToastsProvider>
    </LangueProvider>
  </StrictMode>,
)
