// ============================================================================
// Bouton « Installer l'application » (application Android installable).
//   - Chrome propose l'installation par l'événement « beforeinstallprompt » (gardé par main.jsx) :
//     le bouton ouvre alors directement la fenêtre d'installation du téléphone.
//   - Sinon (iPhone, Firefox, déjà proposée une fois…), une petite fenêtre explique les gestes à faire.
//   - Application déjà installée (ouverte en plein écran) : le bouton disparaît (ou affiche « installée »).
//   etat = true  → affiche aussi l'état « installée » au lieu de se cacher (page Paramètres).
// ============================================================================
import { useEffect, useState } from 'react'
import Modale from '@/composants/Modale.jsx'
import { useLangue } from '@/i18n/index.jsx'

// Vrai si le site tourne déjà comme une application installée (plein écran)
const dejaInstallee = () =>
  Boolean(window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true)

export default function InstallerApplication({ className = '', etat = false }) {
  const { t } = useLangue()
  const [invite, setInvite] = useState(window.__bfmInvite || null)
  const [installee, setInstallee] = useState(dejaInstallee)
  const [aide, setAide] = useState(false)

  useEffect(() => {
    // L'invitation peut arriver après l'affichage de la page
    const surInvite = (e) => { e.preventDefault(); window.__bfmInvite = e; setInvite(e) }
    const surInstallation = () => { window.__bfmInvite = null; setInvite(null); setInstallee(true) }
    window.addEventListener('beforeinstallprompt', surInvite)
    window.addEventListener('appinstalled', surInstallation)
    return () => { window.removeEventListener('beforeinstallprompt', surInvite); window.removeEventListener('appinstalled', surInstallation) }
  }, [])

  // Clic : fenêtre d'installation du navigateur si elle est proposée, sinon explications
  const installer = async () => {
    if (!invite) { setAide(true); return }
    invite.prompt()
    try { await invite.userChoice } catch { /* choix ignoré */ }
    window.__bfmInvite = null
    setInvite(null)
  }

  // Déjà installée : rien à proposer (sauf état demandé)
  if (installee) return etat ? <p className={`text-sm font-bold text-nuit-600 ${className}`}>{t('install.deja')}</p> : null

  const estIphone = /iphone|ipad|ipod/i.test(navigator.userAgent)
  return (
    <>
      <button type="button" onClick={installer} className={`btn-secondaire ${className}`}>
        <span aria-hidden="true">📲</span> {t('install.bouton')}
      </button>
      <Modale titre={t('install.titre')} ouverte={aide} onFermer={() => setAide(false)}>
        <div className="space-y-3 text-sm">
          {estIphone ? (
            <ol className="list-decimal space-y-1 pl-5">
              <li>{t('install.iphone1')}</li>
              <li>{t('install.iphone2')}</li>
              <li>{t('install.iphone3')}</li>
            </ol>
          ) : (
            <>
              <p>{t('install.android0')}</p>
              <ol className="list-decimal space-y-1 pl-5">
                <li>{t('install.android1')}</li>
                <li>{t('install.android2')}</li>
                <li>{t('install.android3')}</li>
              </ol>
              <p className="text-xs text-ardoise">{t('install.note')}</p>
            </>
          )}
          <button type="button" onClick={() => setAide(false)} className="btn-principal w-full">{t('commun.fermer')}</button>
        </div>
      </Modale>
    </>
  )
}
