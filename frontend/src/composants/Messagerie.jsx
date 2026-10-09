// ============================================================================
// Messages d'une course (client ↔ chauffeur), rafraîchis toutes les 5 s.
// ============================================================================
import { useCallback, useEffect, useRef, useState } from 'react'
import api, { messageErreur } from '@/lib/api.js'
import { useAuth } from '@/contexte/Auth.jsx'
import { useLangue } from '@/i18n/index.jsx'
import { useToasts } from './Toasts.jsx'
import { formatHeure } from '@/lib/format.js'

export default function Messagerie({ courseId, actif = true }) {
  const { utilisateur } = useAuth()
  const { t, langue } = useLangue()
  const toast = useToasts()
  const [messages, setMessages] = useState([])
  const [texte, setTexte] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const bas = useRef(null)

  // Lecture des messages
  const charger = useCallback(async () => {
    try {
      const { data } = await api.get(`/courses/${courseId}/messages`)
      setMessages(Array.isArray(data) ? data : [])
    } catch { /* silencieux : on réessaie au prochain tour */ }
  }, [courseId])

  // Premier chargement puis toutes les 5 s
  useEffect(() => {
    charger()
    if (!actif) return
    const m = setInterval(charger, 5000)
    return () => clearInterval(m)
  }, [charger, actif])

  // Défile vers le dernier message
  useEffect(() => { bas.current?.scrollIntoView({ block: 'nearest' }) }, [messages.length])

  // Envoi d'un message
  const envoyer = async (e) => {
    e.preventDefault()
    const contenu = texte.trim()
    if (!contenu) return
    setEnvoi(true)
    try {
      const { data } = await api.post(`/courses/${courseId}/messages`, { texte: contenu })
      setMessages((l) => [...l, data])
      setTexte('')
    } catch (err) {
      toast.erreur(messageErreur(err))
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <div className="flex flex-col">
      <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
        {messages.length === 0 && <p className="text-sm text-ardoise">{t('commun.aucun')}</p>}
        {messages.map((m) => {
          const moi = m.auteur_id === utilisateur?.id
          return (
            <div key={m.id} className={`flex ${moi ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${moi ? 'rounded-br-md bg-nuit text-white' : 'rounded-bl-md bg-brume text-nuit'}`}>
                {!moi && <p className="text-xs font-bold text-volt-700">{m.auteur_nom}</p>}
                <p className="whitespace-pre-wrap break-words">{m.texte}</p>
                <p className={`mt-0.5 text-right text-[11px] ${moi ? 'text-white/60' : 'text-ardoise'}`}>{formatHeure(m.le, langue)}</p>
              </div>
            </div>
          )
        })}
        <div ref={bas} />
      </div>
      {actif && (
        <form onSubmit={envoyer} className="mt-3 flex gap-2">
          <input value={texte} onChange={(e) => setTexte(e.target.value)} placeholder={t('suivi.messagePh')} className="champ flex-1" maxLength={500} />
          <button type="submit" disabled={envoi || !texte.trim()} className="btn-principal px-4">{t('commun.envoyer')}</button>
        </form>
      )}
    </div>
  )
}
