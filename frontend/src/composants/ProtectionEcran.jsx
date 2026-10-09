// ============================================================================
// Sécurité de l'interface (règle du propriétaire pour tout nouveau site),
// composant monté UNE fois pour tout le site :
//   - touche Impr. écran : presse-papiers vidé, écran flouté 3 s, message ;
//   - contenu flouté quand la page perd le focus ou est masquée ;
//   - impression bloquée (page blanche, voir index.css) SAUF sur /recu/:id ;
//   - clic droit, appui long et glisser interdits sur images, vidéos et carte.
// Limite (rappelée dans le pied de page) : un site ne peut pas empêcher une
// capture faite par le système ou le téléphone.
// ============================================================================
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useLangue } from '@/i18n/index.jsx'
import { useToasts } from './Toasts.jsx'

// Éléments protégés contre clic droit / appui long / glisser
const PROTEGES = 'img, video, svg image, .leaflet-container'

export default function ProtectionEcran() {
  const { t } = useLangue()
  const toast = useToasts()
  const lieu = useLocation()
  const [flou, setFlou] = useState(false)       // flou « page masquée / sans focus »
  const [capture, setCapture] = useState(false) // flou temporaire après Impr. écran

  // --- Impression autorisée uniquement sur la page du reçu
  useEffect(() => {
    const recu = lieu.pathname.startsWith('/recu/')
    document.documentElement.classList.toggle('impression-autorisee', recu)
  }, [lieu.pathname])

  // --- Touche Impr. écran
  useEffect(() => {
    let minuterie = null
    const surTouche = (e) => {
      if (e.key !== 'PrintScreen' && e.code !== 'PrintScreen') return
      // On vide le presse-papiers (peut être refusé par le navigateur : sans gravité)
      try { navigator.clipboard?.writeText('').catch(() => {}) } catch { /* ignoré */ }
      setCapture(true)
      toast.info(t('secu.capture'))
      clearTimeout(minuterie)
      minuterie = setTimeout(() => setCapture(false), 3000)
    }
    window.addEventListener('keyup', surTouche)
    window.addEventListener('keydown', surTouche)
    return () => { window.removeEventListener('keyup', surTouche); window.removeEventListener('keydown', surTouche); clearTimeout(minuterie) }
  }, [t, toast])

  // --- Flou quand la page perd le focus ou est masquée
  useEffect(() => {
    const masquer = () => setFlou(true)
    const montrer = () => setFlou(document.visibilityState === 'hidden')
    const surVisibilite = () => setFlou(document.visibilityState === 'hidden')
    window.addEventListener('blur', masquer)
    window.addEventListener('focus', montrer)
    document.addEventListener('visibilitychange', surVisibilite)
    return () => {
      window.removeEventListener('blur', masquer)
      window.removeEventListener('focus', montrer)
      document.removeEventListener('visibilitychange', surVisibilite)
    }
  }, [])

  // --- Clic droit et glisser interdits sur les médias et la carte
  useEffect(() => {
    const bloquer = (e) => { if (e.target instanceof Element && e.target.closest(PROTEGES)) e.preventDefault() }
    document.addEventListener('contextmenu', bloquer)
    document.addEventListener('dragstart', bloquer)
    return () => { document.removeEventListener('contextmenu', bloquer); document.removeEventListener('dragstart', bloquer) }
  }, [])

  if (!flou && !capture) return null
  // Voile flou par-dessus toute la page
  return (
    <div className="no-print fixed inset-0 z-[2000] grid place-items-center bg-nuit/30 backdrop-blur-xl" aria-hidden="true" onClick={() => setFlou(false)}>
      <p className="rounded-2xl bg-white/90 px-5 py-3 text-sm font-bold text-nuit shadow-lg">
        {capture ? t('secu.capture') : t('secu.masque')}
      </p>
    </div>
  )
}
