// ============================================================================
// Petits messages (toasts) maison + attente « Patientez… »
//   const toast = useToasts()
//   toast.succes('Enregistré.') / toast.erreur('…') / toast.info('…')
//   await toast.attente(promesse)  → affiche « Patientez… » + jauge pendant
//                                    toute la durée de la promesse, puis la retire.
// ============================================================================
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import Jauge from './Jauge.jsx'
import { useLangue } from '@/i18n/index.jsx'

const ContexteToasts = createContext(null)

// Couleur de la pastille selon le type de message
const STYLES = {
  succes: 'border-volt-500 bg-white text-nuit',
  erreur: 'border-red-500 bg-white text-nuit',
  info: 'border-nuit-600 bg-white text-nuit',
  attente: 'border-volt-400 bg-nuit/90 text-white backdrop-blur',
}

export function ToastsProvider({ children }) {
  const { t } = useLangue()
  const [toasts, setToasts] = useState([])
  // Nombre d'attentes en cours : la grande jauge centrale reste affichée tant qu'il y en a une
  const [attentes, setAttentes] = useState(0)
  const compteur = useRef(0)

  // Retire un toast par son numéro
  const retirer = useCallback((id) => setToasts((l) => l.filter((x) => x.id !== id)), [])

  // Ajoute un toast ; il disparaît seul après `duree` ms (sauf duree = 0)
  const ajouter = useCallback((type, texte, duree = 4000) => {
    compteur.current += 1
    const id = compteur.current
    setToasts((l) => [...l.slice(-3), { id, type, texte }])
    if (duree) setTimeout(() => retirer(id), duree)
    return id
  }, [retirer])

  // Attente : toast « Patientez… » + jauge pendant la promesse
  const attente = useCallback(async (promesse, texte) => {
    const id = ajouter('attente', texte || t('commun.patientez'), 0)
    setAttentes((n) => n + 1)
    try {
      return await promesse
    } finally {
      retirer(id)
      setAttentes((n) => Math.max(0, n - 1))
    }
  }, [ajouter, retirer, t])

  const api = useMemo(() => ({
    succes: (txt, d) => ajouter('succes', txt, d),
    erreur: (txt, d) => ajouter('erreur', txt, d ?? 6000),
    info: (txt, d) => ajouter('info', txt, d),
    attente,
  }), [ajouter, attente])

  return (
    <ContexteToasts.Provider value={api}>
      {children}

      {/* Grande jauge centrale transparente pendant une attente (ne bloque pas les clics) */}
      {attentes > 0 && (
        <div className="pointer-events-none fixed inset-0 z-[1100] grid place-items-center no-print" aria-hidden="true">
          <Jauge taille={72} epaisseur={5} />
        </div>
      )}

      {/* Pile des toasts, en bas au centre (au-dessus de la barre d'onglets mobile) */}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[1200] flex flex-col items-center gap-2 px-4 sm:bottom-6 no-print" role="status" aria-live="polite">
        {toasts.map((x) => (
          <div
            key={x.id}
            className={`pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl border-l-4 px-4 py-3 text-sm shadow-lg shadow-nuit/10 animate-monte ${STYLES[x.type]}`}
          >
            {x.type === 'attente' && <Jauge taille={22} epaisseur={3} couleur="#FFC629" />}
            {x.type === 'succes' && <span aria-hidden="true" className="text-volt-600">✓</span>}
            {x.type === 'erreur' && <span aria-hidden="true" className="text-red-600">!</span>}
            <span className="flex-1">{x.texte}</span>
            {x.type !== 'attente' && (
              <button type="button" onClick={() => retirer(x.id)} className="text-ardoise hover:text-nuit" aria-label={t('commun.fermer')}>×</button>
            )}
          </div>
        ))}
      </div>
    </ContexteToasts.Provider>
  )
}

// Accès aux toasts depuis n'importe quel composant
export function useToasts() {
  return useContext(ContexteToasts)
}
