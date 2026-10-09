// ============================================================================
// Champ mot de passe avec pictogramme « œil » pour voir / masquer la saisie
// (règle de sécurité de l'interface). Accepte les mêmes propriétés qu'un <input>.
// ============================================================================
import { useState } from 'react'
import { useLangue } from '@/i18n/index.jsx'

export default function MotDePasse({ className = '', ...props }) {
  const { t } = useLangue()
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <input {...props} type={visible ? 'text' : 'password'} className={`champ pr-11 ${className}`} />
      {/* Bouton œil : bascule entre texte visible et masqué */}
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-0 grid w-11 place-items-center text-ardoise hover:text-nuit"
        aria-label={visible ? t('commun.cacherMdp') : t('commun.voirMdp')}
        title={visible ? t('commun.cacherMdp') : t('commun.voirMdp')}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
          {/* Trait barré quand le mot de passe est visible */}
          {visible && <path d="M4 4l16 16" />}
        </svg>
      </button>
    </div>
  )
}
