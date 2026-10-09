// ============================================================================
// Paramètres de la société (admin) : GET / PATCH /admin/parametres
// Rubriques : Nouveautés, Plateforme, Tarification, Service client, Version.
// Version affichée en libellé DÉTAILLÉ (page de paramétrage).
// ============================================================================
import { useEffect, useState } from 'react'
import { useToasts } from '@/composants/Toasts.jsx'
import Jauge from '@/composants/Jauge.jsx'
import { useConfig } from '@/contexte/Config.jsx'
import { LANGUES } from '@/i18n/index.jsx'
import api, { messageErreur } from '@/lib/api.js'
import { libelleVersion, LOT } from '@/version.js'
import { NOUVEAUTES } from '@/nouveautes.js'

// Rubriques et leurs champs (titre exact de la rubrique = cible des cartes « Nouveautés »)
const RUBRIQUES = [
  {
    titre: 'Plateforme',
    champs: [
      { cle: 'nom', libelle: 'Nom de la plateforme' },
      { cle: 'slogan', libelle: 'Slogan' },
      { cle: 'pays', libelle: 'Pays (code ISO, ex. BF)' },
      { cle: 'devise', libelle: 'Devise (code ISO, ex. XOF, EUR)' },
      { cle: 'langue', libelle: 'Langue par défaut', type: 'select', options: LANGUES.map((l) => ({ valeur: l.code, libelle: l.nom })) },
      { cle: 'fuseau', libelle: 'Fuseau horaire (ex. Africa/Ouagadougou)' },
      { cle: 'unite_distance', libelle: 'Unité de distance', type: 'select', options: [{ valeur: 'km', libelle: 'Kilomètres' }, { valeur: 'mi', libelle: 'Miles' }] },
    ],
  },
  {
    titre: 'Tarification',
    champs: [
      { cle: 'vitesse_moyenne_kmh', libelle: 'Vitesse moyenne en ville (km/h)', type: 'nombre' },
      { cle: 'facteur_route', libelle: 'Facteur route / vol d’oiseau', type: 'nombre', aide: 'Ex. 1,3 : la route est 30 % plus longue que la ligne droite.' },
      { cle: 'majoration_nuit_pct', libelle: 'Majoration de nuit (%)', type: 'nombre' },
      { cle: 'nuit_debut', libelle: 'Début de la nuit (HH:MM)' },
      { cle: 'nuit_fin', libelle: 'Fin de la nuit (HH:MM)' },
      { cle: 'commission_pct', libelle: 'Commission de la société (%)', type: 'nombre' },
    ],
  },
  {
    titre: 'Service client',
    champs: [
      { cle: 'telephone_support', libelle: 'Téléphone du service client' },
      { cle: 'email_support', libelle: 'E-mail du service client' },
    ],
  },
]

// Identifiant d'ancre d'une rubrique (« Service client » → rubrique-service-client)
const ancre = (titre) => `rubrique-${titre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-')}`

export default function Parametres() {
  const toast = useToasts()
  const { setConfig } = useConfig()
  const [valeurs, setValeurs] = useState(null)
  const [versionServeur, setVersionServeur] = useState(null)
  const [envoi, setEnvoi] = useState(false)

  // Lecture des paramètres et de la version du serveur
  useEffect(() => {
    toast.attente(api.get('/admin/parametres'))
      .then(({ data }) => setValeurs(data || {}))
      .catch((err) => { toast.erreur(messageErreur(err)); setValeurs({}) })
    api.get('/version').then(({ data }) => setVersionServeur(data)).catch(() => {})
  }, [toast])

  // Enregistrement
  const enregistrer = async (e) => {
    e.preventDefault()
    setEnvoi(true)
    try {
      const corps = {}
      RUBRIQUES.forEach((r) => r.champs.forEach((c) => {
        const v = valeurs[c.cle]
        corps[c.cle] = c.type === 'nombre' ? (v === '' || v == null ? null : Number(v)) : v
      }))
      const { data } = await toast.attente(api.patch('/admin/parametres', corps))
      setValeurs(data || corps)
      // La configuration publique suit immédiatement (devise, unité…)
      setConfig((c) => ({ ...c, ...(data || corps) }))
      toast.succes('Paramètres enregistrés.')
    } catch (err) {
      toast.erreur(messageErreur(err))
    } finally {
      setEnvoi(false)
    }
  }

  // Ouvre une rubrique (depuis une carte « Nouveautés »)
  const ouvrirRubrique = (titre) => {
    const el = document.getElementById(ancre(titre))
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    el?.classList.add('ring-2', 'ring-volt-500')
    setTimeout(() => el?.classList.remove('ring-2', 'ring-volt-500'), 2000)
  }

  if (!valeurs) return <div className="grid min-h-[50vh] place-items-center"><Jauge taille={56} /></div>

  return (
    <div className="max-w-4xl space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold">Paramètres</h1>
        <p className="text-sm text-ardoise">{libelleVersion(true)}</p>
      </header>

      {/* Nouveautés du lot (règle 5) */}
      <section className="surface" id={ancre('Nouveautés')}>
        <h2 className="text-lg font-bold">Nouveautés</h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {NOUVEAUTES.map((n) => (
            <li key={n.lot}>
              <button type="button" onClick={() => ouvrirRubrique(n.rubrique)} className={`h-full w-full rounded-2xl p-4 text-left ring-1 transition hover:ring-nuit/30 ${n.lot === LOT ? 'bg-volt-50 ring-volt-500' : 'bg-white ring-nuit/10'}`}>
                <p className="text-xs font-bold text-volt-700">Lot {n.lot} — {n.date}</p>
                <p className="mt-1 font-bold">{n.titre}</p>
                <p className="mt-1 text-sm text-ardoise">{n.description}</p>
                <p className="mt-2 text-sm font-bold text-nuit-600">Ouvrir la rubrique « {n.rubrique} »</p>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* Formulaire des paramètres */}
      <form onSubmit={enregistrer} className="space-y-6">
        {RUBRIQUES.map((r) => (
          <section key={r.titre} id={ancre(r.titre)} className="surface scroll-mt-6 transition">
            <h2 className="mb-4 text-lg font-bold">{r.titre}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {r.champs.map((c) => (
                <div key={c.cle}>
                  <label htmlFor={`p-${c.cle}`} className="mb-1 block text-sm font-bold">{c.libelle}</label>
                  {c.type === 'select' ? (
                    <select id={`p-${c.cle}`} value={valeurs[c.cle] ?? ''} onChange={(e) => setValeurs((v) => ({ ...v, [c.cle]: e.target.value }))} className="champ">
                      {c.options.map((o) => <option key={o.valeur} value={o.valeur}>{o.libelle}</option>)}
                    </select>
                  ) : (
                    <input id={`p-${c.cle}`} type={c.type === 'nombre' ? 'number' : 'text'} step="any" value={valeurs[c.cle] ?? ''} onChange={(e) => setValeurs((v) => ({ ...v, [c.cle]: e.target.value }))} className="champ" />
                  )}
                  {c.aide && <p className="mt-1 text-xs text-ardoise">{c.aide}</p>}
                </div>
              ))}
            </div>
          </section>
        ))}
        <div className="sticky bottom-4 flex justify-end">
          <button type="submit" disabled={envoi} className="btn-principal px-8 py-3 shadow-lg">Enregistrer les paramètres</button>
        </div>
      </form>

      {/* Version du site et du serveur */}
      <section className="surface" id={ancre('Version')}>
        <h2 className="text-lg font-bold">Version</h2>
        <dl className="mt-2 space-y-1 text-sm">
          <div><dt className="inline text-ardoise">Site : </dt><dd className="inline tabular-nums">{libelleVersion(true)}</dd></div>
          <div><dt className="inline text-ardoise">Serveur : </dt><dd className="inline tabular-nums">{versionServeur?.libelle_detaille || versionServeur?.libelle || 'indisponible'}</dd></div>
        </dl>
      </section>
    </div>
  )
}
