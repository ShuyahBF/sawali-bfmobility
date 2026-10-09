// ============================================================================
// SupportSawali.jsx — pictogramme d'assistance + fenêtre de discussion avec le support SAWALI (SAWALI lot 90).
//
// Demande du propriétaire (09/10/2026) : « pour ne pas être encombrant, un petit pictogramme représentant une
// assistance » dans la barre latérale du portail. Un clic ouvre une petite fenêtre de discussion :
//   - les messages partent vers le serveur de la plateforme (/api/support-sawali/…), qui les relaie à SAWALI
//     (requête signée : aucun secret dans le navigateur) ;
//   - les réponses du support arrivent toutes les 5 s (fenêtre ouverte) ; fenêtre fermée, une pastille rouge
//     signale les réponses non lues (vérification toutes les 60 s) et un SON est joué à chaque nouvelle réponse ;
//   - la requête est numérotée par SAWALI (SUP-…) et son état est affiché (en attente, en cours, terminée).
// Le pictogramme reste caché si la plateforme n'est pas reliée à SAWALI (clé absente).
//
// Props : api = client axios de la plateforme (avec le jeton de connexion) ; clair = pictogramme sur fond sombre ;
//         libelle = texte affiché à côté du pictogramme (facultatif).
// ============================================================================
import { useCallback, useEffect, useRef, useState } from 'react'

const RAFRAICHIR_OUVERT_MS = 5000      // lecture du fil, fenêtre ouverte
const RAFRAICHIR_FERME_MS = 60000      // vérification des réponses non lues, fenêtre fermée

// --- Son de notification (3 notes montantes, comme le chat de SAWALI) ; déverrouillé au premier clic
let contexteAudio = null
function jouerSon() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    contexteAudio = contexteAudio || new Ctx()
    if (contexteAudio.state === 'suspended') contexteAudio.resume().catch(() => {})
    const t0 = contexteAudio.currentTime + 0.02
    ;[[659.25, 0, 0.18], [783.99, 0.14, 0.18], [1046.5, 0.28, 0.32]].forEach(([f, debut, duree]) => {
      const osc = contexteAudio.createOscillator()
      const env = contexteAudio.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(f, t0 + debut)
      env.gain.setValueAtTime(0.0001, t0 + debut)
      env.gain.exponentialRampToValueAtTime(0.5, t0 + debut + 0.02)
      env.gain.exponentialRampToValueAtTime(0.0001, t0 + debut + duree)
      osc.connect(env); env.connect(contexteAudio.destination)
      osc.start(t0 + debut); osc.stop(t0 + debut + duree + 0.02)
    })
  } catch { /* son impossible : sans importance */ }
}

// Heure courte « 14:05 » (date ISO)
const heure = (iso) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

// Couleur de l'état de la requête
const ETATS = { attente: '⏳ En attente du support', active: '💬 En cours', terminee: '✅ Terminée' }

export default function SupportSawali({ api, clair = false, libelle = 'Assistance' }) {
  const [actif, setActif] = useState(false)          // plateforme reliée à SAWALI ?
  const [ouvert, setOuvert] = useState(false)
  const [messages, setMessages] = useState([])
  const [requete, setRequete] = useState(null)
  const [nonLus, setNonLus] = useState(0)
  const [texte, setTexte] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState('')
  const dernierRef = useRef('')                      // date du dernier message reçu (lecture incrémentale)
  const nonLusRef = useRef(0)
  const filRef = useRef(null)

  // Le pictogramme n'apparaît que si la plateforme est reliée à SAWALI
  useEffect(() => {
    api.get('/support-sawali/etat').then((r) => setActif(!!r.data?.actif)).catch(() => setActif(false))
  }, [api])

  // Lecture du fil (fenêtre ouverte : messages ajoutés et marqués lus)
  const lireFil = useCallback(async () => {
    try {
      const r = await api.post('/support-sawali/fil', { depuis: dernierRef.current || null, marquer_lu: true })
      const nouveaux = r.data?.messages || []
      if (nouveaux.length) {
        if (dernierRef.current && nouveaux.some((m) => m.de === 'support')) jouerSon()
        dernierRef.current = nouveaux[nouveaux.length - 1].le
        setMessages((avant) => {
          const connus = new Set(avant.map((m) => m.id))
          return [...avant, ...nouveaux.filter((m) => !connus.has(m.id))]
        })
      }
      setRequete(r.data?.requete || null)
      setNonLus(0); nonLusRef.current = 0
      setErreur('')
    } catch (e) {
      setErreur(e?.response?.data?.detail || 'Support SAWALI injoignable : réessayez dans un instant.')
    }
  }, [api])

  // Fenêtre fermée : simple vérification des réponses non lues (son si leur nombre augmente)
  const verifierNonLus = useCallback(async () => {
    try {
      const r = await api.post('/support-sawali/fil', { depuis: dernierRef.current || null, marquer_lu: false })
      const n = r.data?.non_lus || 0
      if (n > nonLusRef.current) jouerSon()
      nonLusRef.current = n
      setNonLus(n)
    } catch { /* silencieux : nouvel essai plus tard */ }
  }, [api])

  // Rafraîchissement : 5 s fenêtre ouverte, 60 s fenêtre fermée
  useEffect(() => {
    if (!actif) return undefined
    const action = ouvert ? lireFil : verifierNonLus
    action()
    const minuterie = setInterval(action, ouvert ? RAFRAICHIR_OUVERT_MS : RAFRAICHIR_FERME_MS)
    return () => clearInterval(minuterie)
  }, [actif, ouvert, lireFil, verifierNonLus])

  // Défilement automatique vers le dernier message
  useEffect(() => { if (filRef.current) filRef.current.scrollTop = filRef.current.scrollHeight }, [messages, ouvert])

  // Envoi d'un message (toast d'attente via le bouton « Patientez… »)
  const envoyer = async (e) => {
    e.preventDefault()
    const t = texte.trim()
    if (!t || envoi) return
    setEnvoi(true)
    try {
      const r = await api.post('/support-sawali/messages', { texte: t })
      setTexte('')
      setRequete(r.data?.requete || requete)
      await lireFil()
    } catch (err) {
      setErreur(err?.response?.data?.detail || "Envoi impossible : votre message est conservé, réessayez.")
    } finally { setEnvoi(false) }
  }

  if (!actif) return null
  return (
    <>
      {/* Pictogramme discret (casque d'assistance) + pastille des réponses non lues */}
      <button type="button" onClick={() => setOuvert((v) => !v)} title="Assistance — écrire au support SAWALI"
              aria-label="Assistance — écrire au support SAWALI"
              className={`relative inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition ${clair ? 'text-white/80 hover:bg-white/10 hover:text-white' : 'text-slate-700 hover:bg-slate-100'}`}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M3 14v-2a9 9 0 0 1 18 0v2" /><path d="M21 15a2 2 0 0 1-2 2h-1v-6h1a2 2 0 0 1 2 2z" />
          <path d="M3 15a2 2 0 0 0 2 2h1v-6H5a2 2 0 0 0-2 2z" /><path d="M18 17v1a3 3 0 0 1-3 3h-3" />
        </svg>
        {libelle && <span>{libelle}</span>}
        {nonLus > 0 && (
          <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white">{nonLus}</span>
        )}
      </button>

      {/* Fenêtre de discussion (coin inférieur droit ; plein écran sur téléphone) */}
      {ouvert && (
        <div className="fixed inset-x-2 bottom-2 z-[1000] flex h-[70vh] max-h-[560px] flex-col overflow-hidden rounded-2xl bg-white text-slate-800 shadow-2xl ring-1 ring-slate-200 sm:inset-x-auto sm:right-4 sm:w-[360px]"
             role="dialog" aria-label="Support SAWALI">
          <div className="flex items-center gap-2 bg-slate-900 px-4 py-3 text-white">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">Support SAWALI</p>
              <p className="truncate text-xs text-white/70">
                {requete ? `${requete.numero} · ${ETATS[requete.statut] || requete.libelle}` : 'Posez votre question, nous vous répondons ici.'}
              </p>
            </div>
            <button type="button" onClick={() => setOuvert(false)} className="rounded-lg px-2 py-1 text-lg leading-none hover:bg-white/10" aria-label="Fermer">×</button>
          </div>
          <div ref={filRef} className="flex-1 space-y-2 overflow-y-auto bg-slate-50 p-3">
            {messages.length === 0 && <p className="py-6 text-center text-sm italic text-slate-400">Aucun message pour l'instant.</p>}
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.de === 'moi' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm ${m.systeme ? 'bg-amber-50 text-amber-900 ring-1 ring-amber-200' : m.de === 'moi' ? 'bg-slate-900 text-white' : 'bg-white ring-1 ring-slate-200'}`}>
                  {m.de !== 'moi' && !m.systeme && <p className="mb-0.5 text-[11px] font-bold text-slate-500">{m.auteur}</p>}
                  <p className="whitespace-pre-wrap break-words">{m.texte}</p>
                  <p className={`mt-1 text-right text-[10px] ${m.de === 'moi' ? 'text-white/60' : 'text-slate-400'}`}>{heure(m.le)}</p>
                </div>
              </div>
            ))}
          </div>
          {erreur && <p className="bg-red-50 px-3 py-1 text-xs text-red-700">{erreur}</p>}
          <form onSubmit={envoyer} className="flex gap-2 border-t border-slate-200 p-2">
            <textarea value={texte} onChange={(e) => setTexte(e.target.value)} rows={2} maxLength={2000}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) envoyer(e) }}
                      placeholder="Votre message…" className="min-w-0 flex-1 resize-none rounded-xl border border-slate-300 px-3 py-2 text-sm" />
            <button type="submit" disabled={envoi || !texte.trim()} className="rounded-xl bg-slate-900 px-3 text-sm font-bold text-white disabled:opacity-40">
              {envoi ? 'Patientez…' : 'Envoyer'}
            </button>
          </form>
        </div>
      )}
    </>
  )
}
