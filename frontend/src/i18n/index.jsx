// ============================================================================
// Internationalisation maison (sans bibliothèque)
//   - LangueProvider : garde la langue choisie (mémorisée dans le navigateur)
//   - useLangue()    : { langue, changerLangue, t, langues }
//   - t('cle', {x})  : texte traduit ; « {x} » est remplacé par la valeur x.
//     Si une clé manque dans la langue choisie, on prend le français.
// ============================================================================
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import fr from './fr.js'
import en from './en.js'
import es from './es.js'
import pt from './pt.js'
// Textes du back-office (lot 2), dans des fichiers séparés pour rester lisibles
import adminFr from './admin/fr.js'
import adminEn from './admin/en.js'
import adminEs from './admin/es.js'
import adminPt from './admin/pt.js'

// Dictionnaires disponibles (site + back-office réunis par langue)
const DICTIONNAIRES = {
  fr: { ...fr, ...adminFr },
  en: { ...en, ...adminEn },
  es: { ...es, ...adminEs },
  pt: { ...pt, ...adminPt },
}
export const LANGUES = [
  { code: 'fr', nom: 'Français' },
  { code: 'en', nom: 'English' },
  { code: 'es', nom: 'Español' },
  { code: 'pt', nom: 'Português' },
]

const CLE_LANGUE = 'bfm_langue'
const ContexteLangue = createContext(null)

// Langue de départ : celle mémorisée, sinon celle du navigateur si on la connaît, sinon français
function langueInitiale() {
  try {
    const memo = localStorage.getItem(CLE_LANGUE)
    if (memo && DICTIONNAIRES[memo]) return memo
  } catch { /* stockage bloqué */ }
  const nav = (navigator.language || 'fr').slice(0, 2)
  return DICTIONNAIRES[nav] ? nav : 'fr'
}

export function LangueProvider({ children }) {
  const [langue, setLangue] = useState(langueInitiale)

  // Change la langue et la mémorise
  const changerLangue = useCallback((code) => {
    if (!DICTIONNAIRES[code]) return
    setLangue(code)
    try { localStorage.setItem(CLE_LANGUE, code) } catch { /* ignoré */ }
  }, [])

  // Attribut lang de la page (lecteurs d'écran, césure)
  useEffect(() => { document.documentElement.lang = langue }, [langue])

  // Fonction de traduction
  const t = useCallback((cle, valeurs) => {
    let texte = DICTIONNAIRES[langue]?.[cle] ?? DICTIONNAIRES.fr[cle] ?? cle
    if (valeurs) {
      for (const [k, v] of Object.entries(valeurs)) texte = texte.replaceAll(`{${k}}`, String(v))
    }
    return texte
  }, [langue])

  const valeur = useMemo(() => ({ langue, changerLangue, t, langues: LANGUES }), [langue, changerLangue, t])
  return <ContexteLangue.Provider value={valeur}>{children}</ContexteLangue.Provider>
}

// Accès à la langue depuis n'importe quel composant
export function useLangue() {
  return useContext(ContexteLangue)
}

// Indique si une langue a déjà été choisie explicitement (sinon on suit la config serveur)
export function langueMemorisee() {
  try { return Boolean(localStorage.getItem(CLE_LANGUE)) } catch { return false }
}
