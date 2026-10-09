// ============================================================================
// Page de connexion
//   Onglet « Mot de passe »   : e-mail ou téléphone + mot de passe
//   Onglet « Code WhatsApp »  (lot 2, si config.connexion_par_code) :
//     1. numéro → POST /auth/otp/demande (code envoyé par WhatsApp ou SMS)
//     2. code à 6 chiffres (+ nom si nouveau compte) → POST /auth/otp/verification
//     « Renvoyer le code » possible après un compte à rebours de 60 s.
// Après connexion : retour à la page demandée (?suite=…) sinon accueil du rôle.
// ============================================================================
import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import CarteAuth from './CarteAuth.jsx'
import MotDePasse from '@/composants/MotDePasse.jsx'
import { useToasts } from '@/composants/Toasts.jsx'
import { accueilDuRole, useAuth } from '@/contexte/Auth.jsx'
import { useConfig } from '@/contexte/Config.jsx'
import { useLangue } from '@/i18n/index.jsx'
import api, { messageErreur } from '@/lib/api.js'

// N'accepte que des chemins internes pour la redirection (sécurité)
export function suiteSure(suite) {
  return suite && suite.startsWith('/') && !suite.startsWith('//') ? suite : null
}

// Délai avant de pouvoir redemander un code (secondes)
const DELAI_RENVOI = 60

export default function Connexion() {
  const { t } = useLangue()
  const { connexion, connexionParCode, utilisateur } = useAuth()
  const { config } = useConfig()
  const toast = useToasts()
  const naviguer = useNavigate()
  const [params] = useSearchParams()
  const suite = suiteSure(params.get('suite'))
  const [onglet, setOnglet] = useState('mdp')
  const [envoi, setEnvoi] = useState(false)
  // --- Onglet mot de passe
  const [identifiant, setIdentifiant] = useState('')
  const [mdp, setMdp] = useState('')
  // --- Onglet code WhatsApp
  const [telephone, setTelephone] = useState('')
  const [demande, setDemande] = useState(null) // réponse de /auth/otp/demande
  const [code, setCode] = useState('')
  const [nom, setNom] = useState('')
  const [restant, setRestant] = useState(0)

  // Compte à rebours avant « Renvoyer le code »
  useEffect(() => {
    if (restant <= 0) return
    const m = setTimeout(() => setRestant((r) => r - 1), 1000)
    return () => clearTimeout(m)
  }, [restant])

  // Déjà connecté : on part directement
  if (utilisateur && !envoi) return <Navigate to={suite || accueilDuRole(utilisateur.role)} replace />

  // Message clair selon le code d'erreur du serveur
  const erreurCode = (err) => {
    const statut = err?.response?.status
    const detail = err?.response?.data?.detail
    if (statut === 429) return typeof detail === 'string' ? detail : t('otp.trop')
    if (statut === 401) return t('otp.invalide')
    if (statut === 503) return t('otp.indisponible')
    if (statut === 422 && demande && !demande.compte_existant && !nom.trim()) return t('otp.nomRequis')
    return messageErreur(err)
  }

  // Connexion par mot de passe
  const validerMdp = async (e) => {
    e.preventDefault()
    setEnvoi(true)
    try {
      const u = await toast.attente(connexion(identifiant.trim(), mdp))
      naviguer(suite || accueilDuRole(u.role), { replace: true })
    } catch (err) {
      toast.erreur(messageErreur(err, t('cnx.erreur')))
      setEnvoi(false)
    }
  }

  // Étape 1 (ou renvoi) : demande d'un code
  const demanderCode = async (e) => {
    e?.preventDefault()
    setEnvoi(true)
    try {
      const { data } = await toast.attente(api.post('/auth/otp/demande', { telephone: telephone.trim() }))
      setDemande(data)
      setCode('')
      setRestant(DELAI_RENVOI)
      toast.succes(t(data.canal === 'sms' ? 'otp.envoyeSms' : 'otp.envoyeWhatsapp', { n: data.duree_min ?? 10 }))
    } catch (err) {
      toast.erreur(erreurCode(err))
    } finally {
      setEnvoi(false)
    }
  }

  // Étape 2 : vérification du code
  const verifierCode = async (e) => {
    e.preventDefault()
    if (!/^\d{6}$/.test(code)) { toast.erreur(t('otp.format')); return }
    if (!demande.compte_existant && nom.trim().length < 2) { toast.erreur(t('otp.nomRequis')); return }
    setEnvoi(true)
    try {
      const u = await toast.attente(connexionParCode(telephone.trim(), code, demande.compte_existant ? undefined : nom.trim()))
      naviguer(suite || accueilDuRole(u.role), { replace: true })
    } catch (err) {
      toast.erreur(erreurCode(err))
      setEnvoi(false)
    }
  }

  // Style des onglets
  const classeOnglet = (o) => `flex-1 rounded-xl py-2 text-sm font-bold transition ${onglet === o ? 'bg-nuit text-white' : 'text-nuit hover:bg-brume'}`

  return (
    <CarteAuth
      titre={t('cnx.titre')}
      sousTitre={t('cnx.sousTitre')}
      pied={<>{t('cnx.pasDeCompte')} <Link to={`/inscription${suite ? `?suite=${encodeURIComponent(suite)}` : ''}`} className="font-bold text-volt-700 hover:underline">{t('nav.inscription')}</Link></>}
    >
      {/* Onglets (seulement si la connexion par code est disponible) */}
      {config.connexion_par_code && (
        <div className="mb-5 grid grid-cols-2 gap-1 rounded-2xl bg-brume p-1" role="tablist">
          <button type="button" role="tab" aria-selected={onglet === 'mdp'} onClick={() => setOnglet('mdp')} className={classeOnglet('mdp')}>{t('otp.ongletMdp')}</button>
          <button type="button" role="tab" aria-selected={onglet === 'code'} onClick={() => setOnglet('code')} className={classeOnglet('code')}>{t('otp.ongletCode')}</button>
        </div>
      )}

      {/* ---------- Mot de passe ---------- */}
      {onglet === 'mdp' && (
        <form onSubmit={validerMdp} className="space-y-4">
          <div>
            <label htmlFor="identifiant" className="etiquette">{t('cnx.identifiant')}</label>
            <input id="identifiant" value={identifiant} onChange={(e) => setIdentifiant(e.target.value)} required autoComplete="username" className="champ" />
          </div>
          <div>
            <label htmlFor="mdp" className="etiquette">{t('cnx.mdp')}</label>
            <MotDePasse id="mdp" value={mdp} onChange={(e) => setMdp(e.target.value)} required autoComplete="current-password" />
          </div>
          <button type="submit" disabled={envoi} className="btn-principal w-full py-3 text-base">{t('cnx.bouton')}</button>
        </form>
      )}

      {/* ---------- Code WhatsApp : étape 1, le numéro ---------- */}
      {onglet === 'code' && !demande && (
        <form onSubmit={demanderCode} className="space-y-4">
          <div>
            <label htmlFor="tel-otp" className="etiquette">{t('ins.telephone')}</label>
            <input id="tel-otp" type="tel" value={telephone} onChange={(e) => setTelephone(e.target.value)} required autoComplete="tel" className="champ" placeholder="+226 70 00 00 00" />
            <p className="mt-1 text-xs text-ardoise">{t('otp.aide')}</p>
          </div>
          <button type="submit" disabled={envoi || telephone.trim().length < 6} className="btn-principal w-full py-3 text-base">{t('otp.recevoir')}</button>
        </form>
      )}

      {/* ---------- Code WhatsApp : étape 2, le code ---------- */}
      {onglet === 'code' && demande && (
        <form onSubmit={verifierCode} className="space-y-4">
          <p className="rounded-xl bg-volt-50 p-3 text-sm">
            {t(demande.canal === 'sms' ? 'otp.envoyeSms' : 'otp.envoyeWhatsapp', { n: demande.duree_min ?? 10 })} <b>{telephone}</b>
          </p>
          <div>
            <label htmlFor="code-otp" className="etiquette">{t('otp.code')}</label>
            <input
              id="code-otp" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric" autoComplete="one-time-code" required maxLength={6}
              className="champ text-center font-display text-2xl tracking-[0.5em]" placeholder="••••••"
            />
          </div>
          {/* Nouveau compte : le nom est demandé */}
          {!demande.compte_existant && (
            <div>
              <label htmlFor="nom-otp" className="etiquette">{t('otp.nom')}</label>
              <input id="nom-otp" value={nom} onChange={(e) => setNom(e.target.value)} required autoComplete="name" className="champ" />
              <p className="mt-1 text-xs text-ardoise">{t('otp.nouveauCompte')}</p>
            </div>
          )}
          <button type="submit" disabled={envoi || code.length !== 6} className="btn-principal w-full py-3 text-base">{t('cnx.bouton')}</button>
          <div className="flex items-center justify-between text-sm">
            <button type="button" onClick={() => { setDemande(null); setCode('') }} className="font-bold text-nuit-600 hover:underline">{t('otp.changerNumero')}</button>
            {restant > 0
              ? <span className="tabular-nums text-ardoise">{t('otp.renvoyerDans', { s: restant })}</span>
              : <button type="button" disabled={envoi} onClick={demanderCode} className="font-bold text-volt-700 hover:underline">{t('otp.renvoyer')}</button>}
          </div>
        </form>
      )}
    </CarteAuth>
  )
}
