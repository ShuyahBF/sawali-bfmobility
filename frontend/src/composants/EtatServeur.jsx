// ============================================================================
// État du serveur (page de connexion) : appel de /api/health et chronométrage.
//   vert   « Serveur actif »      : réponse en moins de 2 s
//   orange « Serveur lent »       : réponse en plus de 2 s
//   rouge  « Serveur injoignable » : pas de réponse
// Le test est refait toutes les 30 s.
// ============================================================================
import { useEffect, useState } from 'react'
import api from '@/lib/api.js'
import { useLangue } from '@/i18n/index.jsx'

export default function EtatServeur() {
  const { t } = useLangue()
  const [etat, setEtat] = useState('test')
  const [ms, setMs] = useState(null)

  useEffect(() => {
    let actif = true
    // Un test : on mesure le temps de réponse de /health
    const tester = async () => {
      const debut = performance.now()
      try {
        await api.get('/health', { timeout: 15000 })
        const duree = Math.round(performance.now() - debut)
        if (!actif) return
        setMs(duree)
        setEtat(duree > 2000 ? 'lent' : 'actif')
      } catch {
        if (actif) { setEtat('injoignable'); setMs(null) }
      }
    }
    tester()
    const minuterie = setInterval(tester, 30000)
    return () => { actif = false; clearInterval(minuterie) }
  }, [])

  // Couleur de la pastille et texte selon l'état
  const rendu = {
    test: { pastille: 'bg-slate-300', texte: t('cnx.serveurTest') },
    actif: { pastille: 'bg-volt-500', texte: t('cnx.serveurActif') },
    lent: { pastille: 'bg-ambre-500', texte: t('cnx.serveurLent') },
    injoignable: { pastille: 'bg-red-500', texte: t('cnx.serveurInjoignable') },
  }[etat]

  return (
    <span className="inline-flex items-center gap-2 text-sm text-ardoise" role="status">
      <span className={`h-2.5 w-2.5 rounded-full ${rendu.pastille}`} aria-hidden="true" />
      <span className="font-bold text-nuit">{rendu.texte}</span>
      {ms !== null && <span className="tabular-nums">({ms} ms)</span>}
    </span>
  )
}
