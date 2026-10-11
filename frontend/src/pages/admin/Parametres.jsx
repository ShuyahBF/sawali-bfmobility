// ============================================================================
// Paramètres de la société (admin) : GET / PATCH /admin/parametres
// Rubriques : Nouveautés, Plateforme, Tarification, Service client, Version.
// Version affichée en libellé DÉTAILLÉ (page de paramétrage).
// Lot 2 : itinéraire routier, notifications WhatsApp et rayon de recherche
// dans « Plateforme », avec l'état des services en ligne (paiement, code).
// Textes traduits (clés adm.param.*).
// ============================================================================
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useToasts } from '@/composants/Toasts.jsx'
import Jauge from '@/composants/Jauge.jsx'
import { useConfig } from '@/contexte/Config.jsx'
import { LANGUES, useLangue } from '@/i18n/index.jsx'
import api, { messageErreur } from '@/lib/api.js'
import { libelleVersion, LOT } from '@/version.js'
import { NOUVEAUTES } from '@/nouveautes.js'

// Rubriques et leurs champs.
// `id` = titre français exact de la rubrique : c'est la cible des cartes
// « Nouveautés » (src/nouveautes.js) ; le titre affiché est traduit.
const RUBRIQUES = [
  {
    id: 'Plateforme',
    cle: 'plateforme',
    etatServices: true,
    champs: [
      { cle: 'nom' },
      { cle: 'slogan' },
      { cle: 'pays' },
      { cle: 'devise' },
      { cle: 'langue', type: 'select', options: LANGUES.map((l) => ({ valeur: l.code, libelle: l.nom })) },
      { cle: 'fuseau' },
      { cle: 'unite_distance', type: 'select', options: [{ valeur: 'km', cle: 'km' }, { valeur: 'mi', cle: 'mi' }] },
      // Lot 2
      { cle: 'rayon_recherche_km', type: 'nombre', aide: true },
      { cle: 'itineraire_routier', type: 'case', aide: true },
      { cle: 'notifications_whatsapp', type: 'case', aide: true },
    ],
  },
  {
    id: 'Tarification',
    cle: 'tarification',
    champs: [
      { cle: 'vitesse_moyenne_kmh', type: 'nombre' },
      { cle: 'facteur_route', type: 'nombre', aide: true },
      { cle: 'majoration_nuit_pct', type: 'nombre' },
      { cle: 'nuit_debut' },
      { cle: 'nuit_fin' },
      { cle: 'commission_pct', type: 'nombre' },
    ],
  },
  {
    id: 'Service client',
    cle: 'support',
    champs: [
      { cle: 'telephone_support' },
      { cle: 'email_support' },
    ],
  },
]

// Identifiant d'ancre d'une rubrique (« Service client » → rubrique-service-client)
const ancre = (titre) => `rubrique-${titre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-')}`

// Pastille d'état d'un service (texte + couleur, jamais la couleur seule)
function EtatService({ libelle, actif, t }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-xl bg-brume px-3 py-2 text-sm">
      <span>{libelle}</span>
      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${actif ? 'bg-volt-100 text-volt-700' : 'bg-slate-200 text-slate-700'}`}>
        {actif ? t('adm.param.actif') : t('adm.param.nonConfigure')}
      </span>
    </li>
  )
}

export default function Parametres() {
  const toast = useToasts()
  const { t } = useLangue()
  const { config, setConfig } = useConfig()
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
        if (c.type === 'nombre') corps[c.cle] = v === '' || v == null ? null : Number(v)
        else if (c.type === 'case') corps[c.cle] = Boolean(v)
        else corps[c.cle] = v
      }))
      const { data } = await toast.attente(api.patch('/admin/parametres', corps))
      setValeurs(data || corps)
      // La configuration publique suit immédiatement (devise, unité…)
      setConfig((c) => ({ ...c, ...(data || corps) }))
      toast.succes(t('adm.param.enregistres'))
    } catch (err) {
      toast.erreur(messageErreur(err))
    } finally {
      setEnvoi(false)
    }
  }

  // Ouvre une rubrique (depuis une carte « Nouveautés ») : défilement + surbrillance
  const ouvrirRubrique = (titre) => {
    const el = document.getElementById(ancre(titre))
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    el?.classList.add('ring-2', 'ring-volt-500')
    setTimeout(() => el?.classList.remove('ring-2', 'ring-volt-500'), 2000)
  }

  if (!valeurs) return <div className="grid min-h-[50vh] place-items-center"><Jauge taille={56} /></div>

  // Titre traduit d'une rubrique à partir de son identifiant
  const titreRubrique = (id) => {
    const r = RUBRIQUES.find((x) => x.id === id)
    return r ? t(`adm.param.rub.${r.cle}`) : id
  }
  const services = config.paiements_en_ligne || {}

  return (
    <div className="max-w-4xl space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold">{t('adm.menu.parametres')}</h1>
        <p className="text-sm text-ardoise">{libelleVersion(true)}</p>
      </header>

      {/* Nouveautés du lot (règle 5) : chaque carte ouvre sa rubrique */}
      <section className="surface" id={ancre('Nouveautés')}>
        <h2 className="text-lg font-bold">{t('adm.param.nouveautes')}</h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {NOUVEAUTES.map((n) => (
            <li key={n.lot}>
              <button type="button" onClick={() => ouvrirRubrique(n.rubrique)} className={`h-full w-full rounded-2xl p-4 text-left ring-1 transition hover:ring-nuit/30 ${n.lot === LOT ? 'bg-volt-50 ring-volt-500' : 'bg-white ring-nuit/10'}`}>
                <p className="text-xs font-bold text-volt-700">{t('adm.param.lot', { n: n.lot })} — {n.date}</p>
                <p className="mt-1 font-bold">{n.titre}</p>
                <p className="mt-1 text-sm text-ardoise">{n.description}</p>
                <p className="mt-2 text-sm font-bold text-nuit-600">{t('adm.param.ouvrirRubrique', { rubrique: titreRubrique(n.rubrique) })}</p>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* Formulaire des paramètres */}
      <form onSubmit={enregistrer} className="space-y-6">
        {RUBRIQUES.map((r) => (
          <section key={r.id} id={ancre(r.id)} className="surface scroll-mt-6 transition">
            <h2 className="mb-4 text-lg font-bold">{t(`adm.param.rub.${r.cle}`)}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {r.champs.map((c) => (
                <div key={c.cle} className={c.type === 'case' ? 'sm:col-span-2' : ''}>
                  {c.type === 'case' ? (
                    // Case à cocher (réglage marche / arrêt)
                    <label className="flex items-start gap-3 text-sm">
                      <input type="checkbox" checked={Boolean(valeurs[c.cle])} onChange={(e) => setValeurs((v) => ({ ...v, [c.cle]: e.target.checked }))} className="mt-0.5 h-5 w-5 accent-volt-600" />
                      <span>
                        <span className="block font-bold">{t(`adm.param.${c.cle}`)}</span>
                        {c.aide && <span className="block text-xs text-ardoise">{t(`adm.param.${c.cle}.aide`)}</span>}
                      </span>
                    </label>
                  ) : (
                    <>
                      <label htmlFor={`p-${c.cle}`} className="etiquette">{t(`adm.param.${c.cle}`)}</label>
                      {c.type === 'select' ? (
                        <select id={`p-${c.cle}`} value={valeurs[c.cle] ?? ''} onChange={(e) => setValeurs((v) => ({ ...v, [c.cle]: e.target.value }))} className="champ">
                          {c.options.map((o) => <option key={o.valeur} value={o.valeur}>{o.cle ? t(`adm.param.unite.${o.cle}`) : o.libelle}</option>)}
                        </select>
                      ) : (
                        <input id={`p-${c.cle}`} type={c.type === 'nombre' ? 'number' : 'text'} step="any" value={valeurs[c.cle] ?? ''} onChange={(e) => setValeurs((v) => ({ ...v, [c.cle]: e.target.value }))} className="champ" />
                      )}
                      {c.aide && <p className="mt-1 text-xs text-ardoise">{t(`adm.param.${c.cle}.aide`)}</p>}
                    </>
                  )}
                </div>
              ))}
            </div>

            {/* État des services en ligne (configurés par variables d'environnement sur Render) */}
            {r.etatServices && (
              <div className="mt-6 border-t border-nuit/10 pt-4">
                <h3 className="font-bold">{t('adm.param.services')}</h3>
                <p className="mt-1 text-xs text-ardoise">{t('adm.param.servicesAide')}</p>
                <ul className="mt-3 grid gap-2 sm:grid-cols-3">
                  <EtatService libelle={t('pay.mobileMoney')} actif={services.mobile_money} t={t} />
                  <EtatService libelle={t('pay.carte')} actif={services.carte} t={t} />
                  <EtatService libelle={t('otp.ongletCode')} actif={config.connexion_par_code} t={t} />
                </ul>
                <Link to="/admin/candidatures" className="btn-secondaire mt-4">{t('adm.param.voirCandidatures')}</Link>
                {/* Lot 26 : connexions et visites signalées à SAWALI (alerte WhatsApp du propriétaire) */}
                <p className="mt-4 rounded-xl bg-brume px-3 py-2 text-xs text-ardoise">{t('adm.param.signalConnexions')}</p>
              </div>
            )}
          </section>
        ))}
        <div className="sticky bottom-4 flex justify-end">
          <button type="submit" disabled={envoi} className="btn-principal px-8 py-3 shadow-lg">{t('adm.param.enregistrer')}</button>
        </div>
      </form>

      {/* Version du site et du serveur */}
      <section className="surface" id={ancre('Version')}>
        <h2 className="text-lg font-bold">{t('adm.param.version')}</h2>
        <dl className="mt-2 space-y-1 text-sm">
          <div><dt className="inline text-ardoise">{t('adm.param.site')} : </dt><dd className="inline tabular-nums">{libelleVersion(true)}</dd></div>
          <div><dt className="inline text-ardoise">{t('adm.param.serveur')} : </dt><dd className="inline tabular-nums">{versionServeur?.libelle_detaille || versionServeur?.libelle || t('adm.param.indisponible')}</dd></div>
        </dl>
      </section>
    </div>
  )
}
