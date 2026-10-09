// ============================================================================
// Fenêtre modale simple (formulaires du back-office, confirmations…)
// Fermeture : bouton ×, touche Échap ou clic sur le fond.
// ============================================================================
import { useEffect, useId, useRef } from 'react'
import { useLangue } from '@/i18n/index.jsx'

// Pile des fenêtres ouvertes (lot 10) : une fiche à onglets peut ouvrir une 2e fenêtre (ex. « Ajouter » dans
// l'onglet Énergie). Échap ne ferme alors QUE la fenêtre du dessus, jamais les deux à la fois.
const pile = []

// taille : « xl » (lot 10) pour les fiches à onglets ; large = ancienne taille moyenne
export default function Modale({ titre, ouverte, onFermer, children, large = false, taille = '' }) {
  const { t } = useLangue()
  const id = useId()
  // onFermer gardé dans une référence : l'ordre de la pile ne change pas à chaque affichage
  const fermerRef = useRef(onFermer)
  fermerRef.current = onFermer
  // Touche Échap pour fermer (seulement la fenêtre du dessus de la pile)
  useEffect(() => {
    if (!ouverte) return
    pile.push(id)
    const surTouche = (e) => e.key === 'Escape' && pile[pile.length - 1] === id && fermerRef.current?.()
    window.addEventListener('keydown', surTouche)
    return () => {
      window.removeEventListener('keydown', surTouche)
      const i = pile.lastIndexOf(id)
      if (i >= 0) pile.splice(i, 1)
    }
  }, [ouverte, id])

  if (!ouverte) return null
  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-nuit/50 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onFermer?.()}>
      <div role="dialog" aria-modal="true" aria-label={titre} className={`max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl ${taille === 'xl' ? 'sm:max-w-5xl' : large ? 'sm:max-w-3xl' : 'sm:max-w-lg'} animate-monte`}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="font-display text-xl font-bold text-nuit">{titre}</h2>
          <button type="button" onClick={onFermer} className="-mr-2 -mt-1 grid h-9 w-9 place-items-center rounded-full text-2xl text-ardoise hover:bg-brume" aria-label={t('commun.fermer')}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}
