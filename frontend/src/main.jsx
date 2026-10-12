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
