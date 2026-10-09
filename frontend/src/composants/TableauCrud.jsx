// ============================================================================
// TableauCrud : écran de gestion GÉNÉRIQUE d'une ressource du back-office
// (liste + recherche + création + modification + suppression + actions).
// Tout est décrit par un objet de configuration (voir pages/admin/ressources.jsx) :
//
//   ressource   : nom dans l'API (ex. 'vehicules' → /api/admin/vehicules)
//   titre, description
//   colonnes    : [{ cle, libelle, rendu?(ligne, aides), classe? }]
//   champs      : [{ cle ('a.b' accepté), libelle, type, options?, ref?, requis?,
//                    aide?, large?, visible?(formulaire), sousChamps? }]
//       types : texte | nombre | date | dateheure | select | case | liste
//               | ref (choix dans une autre ressource) | motdepasse | zone
//               | lignes (tableau de sous-lignes décrites par sousChamps)
//   refs        : { nomRessource: (objet) => libellé }  — listes à charger
//   defaut      : valeurs d'un nouvel enregistrement
//   versFormulaire(ligne) / avantEnvoi(formulaire) : conversions facultatives
//   actions     : [{ libelle, visible?(ligne), executer(ligne, outils) }]
//                 ou, pour une saisie (lot 2) : [{ libelle, visible?, formulaire: {
//                   titre(ligne), champs:[…comme ci-dessus], defaut?(ligne),
//                   envoyer(ligne, valeurs, outils) } }] → ouvre une modale
//   filtres     : [{ cle, libelle, options:[{valeur, libelle}] }] → ?cle=valeur
//   ecriture    : false → lecture seule (pas de création/modification/suppression)
//   suppression : false → pas de bouton Supprimer
// Tous les textes affichés passent par la traduction (clés « crud.* »).
// ============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react'
import api, { messageErreur } from '@/lib/api.js'
import { useToasts } from './Toasts.jsx'
import Modale from './Modale.jsx'
import MotDePasse from './MotDePasse.jsx'
import Jauge from './Jauge.jsx'
import { useLangue } from '@/i18n/index.jsx'

// --- Lecture / écriture d'une valeur par chemin pointé (« promo.pourcentage »)
export function lire(objet, chemin) {
  return chemin.split('.').reduce((o, k) => (o == null ? undefined : o[k]), objet)
}
function ecrire(objet, chemin, valeur) {
  const copie = structuredClone(objet ?? {})
  const cles = chemin.split('.')
  let o = copie
  cles.slice(0, -1).forEach((k) => { if (o[k] == null || typeof o[k] !== 'object') o[k] = {}; o = o[k] })
  o[cles.at(-1)] = valeur
  return copie
}

// --- Conversion des valeurs d'un champ entre l'API et le formulaire
function versSaisie(champ, valeur) {
  if (valeur == null) return champ.type === 'case' ? false : champ.type === 'lignes' ? [] : ''
  if (champ.type === 'date') return String(valeur).slice(0, 10)
  if (champ.type === 'dateheure') return String(valeur).slice(0, 16)
  if (champ.type === 'liste') return Array.isArray(valeur) ? valeur.join(', ') : String(valeur)
  return valeur
}
function versApi(champ, valeur) {
  switch (champ.type) {
    case 'nombre':
    case 'ref':
      if (valeur === '' || valeur == null) return null
      return champ.type === 'ref' && Number.isNaN(Number(valeur)) ? valeur : Number(valeur)
    case 'liste':
      return String(valeur || '').split(',').map((s) => s.trim()).filter(Boolean)
    case 'case':
      return Boolean(valeur)
    case 'date':
    case 'dateheure':
      return valeur ? new Date(valeur).toISOString() : null
    case 'lignes':
      return (valeur || []).map((l) => Object.fromEntries((champ.sousChamps || []).map((sc) => [sc.cle, versApi(sc, l[sc.cle])])))
    default:
      return valeur === '' ? null : valeur
  }
}

export default function TableauCrud({ config }) {
  const {
    ressource, titre, description, colonnes = [], champs = [], refs = {}, defaut = {},
    versFormulaire, avantEnvoi, actions = [], filtres = [], ecriture = true, suppression = true,
    entete,
  } = config
  const toast = useToasts()
  const { t } = useLangue()
  const [lignes, setLignes] = useState([])
  // Formulaire d'une action particulière (ex. mouvement de stock) : { action, ligne, valeurs }
  const [saisieAction, setSaisieAction] = useState(null)
  const [charge, setCharge] = useState(false)
  const [recherche, setRecherche] = useState('')
  const [valeursFiltres, setValeursFiltres] = useState({})
  const [selection, setSelection] = useState(null)
  const [listesRef, setListesRef] = useState({})
  // Formulaire ouvert : { id|null, valeurs }
  const [formulaire, setFormulaire] = useState(null)
  const [envoi, setEnvoi] = useState(false)

  // --- Chargement de la liste (avec recherche et filtres), sous « Patientez… »
  const charger = useCallback(async (silencieux = false) => {
    const params = { limite: 300 }
    if (recherche.trim()) params.q = recherche.trim()
    Object.entries(valeursFiltres).forEach(([k, v]) => { if (v) params[k] = v })
    const appel = api.get(`/admin/${ressource}`, { params })
    try {
      const { data } = silencieux ? await appel : await toast.attente(appel)
      setLignes(Array.isArray(data) ? data : data?.elements || [])
    } catch (err) {
      toast.erreur(messageErreur(err))
    } finally {
      setCharge(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ressource, recherche, valeursFiltres])

  // Rechargement 400 ms après la dernière frappe dans la recherche
  useEffect(() => {
    const m = setTimeout(() => charger(), recherche ? 400 : 0)
    return () => clearTimeout(m)
  }, [charger, recherche])

  // --- Chargement des listes de référence (véhicules, fournisseurs…) pour les menus
  const nomsRefs = useMemo(() => Object.keys(refs).join(','), [refs])
  useEffect(() => {
    if (!nomsRefs) return
    let actif = true
    Promise.all(nomsRefs.split(',').map((nom) =>
      api.get(`/admin/${nom}`, { params: { limite: 1000 } }).then(({ data }) => [nom, Array.isArray(data) ? data : []]).catch(() => [nom, []]),
    )).then((paires) => actif && setListesRef(Object.fromEntries(paires)))
    return () => { actif = false }
  }, [nomsRefs])

  // --- Outils donnés aux colonnes : libellé d'un objet référencé par son id
  const aides = useMemo(() => ({
    ref: (nom, id) => {
      if (id == null || id === '') return '—'
      const objet = (listesRef[nom] || []).find((x) => String(x.id) === String(id))
      return objet ? refs[nom](objet) : `#${id}`
    },
    listesRef,
  }), [listesRef, refs])

  // --- Ouverture du formulaire (nouveau ou modification)
  const ouvrir = (ligne) => {
    const source = ligne ? (versFormulaire ? versFormulaire(ligne) : ligne) : structuredClone(defaut)
    let valeurs = {}
    champs.forEach((c) => { valeurs = ecrire(valeurs, c.cle, versSaisie(c, lire(source, c.cle))) })
    setFormulaire({ id: ligne?.id ?? null, valeurs })
  }

  // --- Enregistrement (POST pour un nouveau, PATCH pour une modification)
  const enregistrer = async (e) => {
    e.preventDefault()
    let corps = {}
    champs.forEach((c) => {
      if (c.visible && !c.visible(formulaire.valeurs)) return
      const v = versApi(c, lire(formulaire.valeurs, c.cle))
      // Mot de passe vide = inchangé : on ne l'envoie pas
      if (c.type === 'motdepasse' && !v) return
      corps = ecrire(corps, c.cle, v)
    })
    if (avantEnvoi) corps = avantEnvoi(corps, formulaire)
    setEnvoi(true)
    try {
      const appel = formulaire.id == null
        ? api.post(`/admin/${ressource}`, corps)
        : api.patch(`/admin/${ressource}/${formulaire.id}`, corps)
      await toast.attente(appel)
      toast.succes(formulaire.id == null ? t('crud.ajoute') : t('crud.modifie'))
      setFormulaire(null)
      charger(true)
    } catch (err) {
      toast.erreur(messageErreur(err))
    } finally {
      setEnvoi(false)
    }
  }

  // --- Suppression après confirmation
  const supprimer = async (ligne) => {
    if (!window.confirm(t('crud.confirmerSuppression'))) return
    try {
      await toast.attente(api.delete(`/admin/${ressource}/${ligne.id}`))
      toast.succes(t('crud.supprime'))
      setSelection(null)
      charger(true)
    } catch (err) {
      toast.erreur(messageErreur(err))
    }
  }

  // --- Action particulière (ex. « Recevoir » une commande)
  const lancerAction = async (action, ligne) => {
    // Action avec saisie : on ouvre sa modale
    if (action.formulaire) {
      let valeurs = {}
      const source = action.formulaire.defaut ? action.formulaire.defaut(ligne) : {}
      action.formulaire.champs.forEach((c) => { valeurs = ecrire(valeurs, c.cle, versSaisie(c, lire(source, c.cle))) })
      setSaisieAction({ action, ligne, valeurs })
      return
    }
    try {
      await action.executer(ligne, { api, toast, recharger: () => charger(true), attente: toast.attente })
    } catch (err) {
      toast.erreur(messageErreur(err))
    }
  }

  // --- Validation de la modale d'une action avec saisie
  const validerAction = async (e) => {
    e.preventDefault()
    const { action, ligne, valeurs } = saisieAction
    let corps = {}
    action.formulaire.champs.forEach((c) => { corps = ecrire(corps, c.cle, versApi(c, lire(valeurs, c.cle))) })
    try {
      // envoyer() renvoie false pour garder la modale ouverte (saisie à corriger)
      const ok = await action.formulaire.envoyer(ligne, corps, { api, toast, recharger: () => charger(true), attente: toast.attente })
      if (ok !== false) setSaisieAction(null)
    } catch (err) {
      toast.erreur(messageErreur(err))
    }
  }

  const avecActions = ecriture || actions.length > 0

  return (
    <section>
      {/* En-tête : titre, recherche, filtres, bouton Ajouter */}
      <header className="mb-4 flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="font-display text-2xl font-bold text-nuit">{titre}</h1>
          {description && <p className="mt-1 max-w-prose text-sm text-ardoise">{description}</p>}
        </div>
        <label className="relative">
          <span className="sr-only">{t('crud.rechercher')}</span>
          <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder={t('crud.rechercherPh')} className="champ w-56 pl-9" />
          <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ardoise" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        </label>
        {filtres.map((f) => (
          <select key={f.cle} value={valeursFiltres[f.cle] || ''} onChange={(e) => setValeursFiltres((v) => ({ ...v, [f.cle]: e.target.value }))} className="champ w-auto" aria-label={f.libelle}>
            <option value="">{t('crud.tous', { filtre: f.libelle })}</option>
            {f.options.map((o) => <option key={o.valeur} value={o.valeur}>{o.libelle}</option>)}
          </select>
        ))}
        {ecriture && <button type="button" onClick={() => ouvrir(null)} className="btn-principal">{t('crud.ajouter')}</button>}
      </header>

      {entete}

      {/* Tableau (défilement horizontal sur petit écran) */}
      <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-nuit/10">
        <table className="tableau">
          <thead>
            <tr>
              {colonnes.map((c) => <th key={c.cle} className={c.classe}>{c.libelle}</th>)}
              {avecActions && <th className="text-right">{t('crud.actions')}</th>}
            </tr>
          </thead>
          <tbody>
            {!charge && (
              <tr><td colSpan={colonnes.length + 1} className="py-10 text-center"><span className="inline-block"><Jauge /></span></td></tr>
            )}
            {charge && lignes.length === 0 && (
              <tr><td colSpan={colonnes.length + 1} className="py-10 text-center text-ardoise">
                {t('crud.vide')}{ecriture && ` ${t('crud.videAjouter')}`}
              </td></tr>
            )}
            {lignes.map((l) => (
              <tr
                key={l.id}
                aria-selected={selection === l.id}
                onClick={() => setSelection(l.id)}
                onDoubleClick={() => ecriture && ouvrir(l)}
                className="cursor-pointer"
              >
                {colonnes.map((c) => (
                  <td key={c.cle} className={c.classe}>{c.rendu ? c.rendu(l, aides) : affichageSimple(lire(l, c.cle), t)}</td>
                ))}
                {avecActions && (
                  <td className="whitespace-nowrap text-right">
                    {actions.filter((a) => !a.visible || a.visible(l)).map((a) => (
                      <button key={a.libelle} type="button" onClick={(e) => { e.stopPropagation(); lancerAction(a, l) }} className="lien-action">{a.libelle}</button>
                    ))}
                    {ecriture && <button type="button" onClick={(e) => { e.stopPropagation(); ouvrir(l) }} className="lien-action">{t('crud.modifier')}</button>}
                    {ecriture && suppression && <button type="button" onClick={(e) => { e.stopPropagation(); supprimer(l) }} className="lien-action text-red-600">{t('crud.supprimer')}</button>}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-ardoise">{t('crud.compte', { n: lignes.length })}{ecriture && ` ${t('crud.doubleClic')}`}</p>

      {/* Formulaire de création / modification */}
      <Modale titre={formulaire?.id == null ? t('crud.titreAjout', { titre }) : t('crud.titreModif', { titre })} ouverte={Boolean(formulaire)} onFermer={() => setFormulaire(null)} large={champs.length > 8}>
        {formulaire && (
          <form onSubmit={enregistrer} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {champs.filter((c) => !c.visible || c.visible(formulaire.valeurs)).map((c) => (
              <Champ
                key={c.cle}
                champ={c}
                valeur={lire(formulaire.valeurs, c.cle)}
                listesRef={listesRef}
                refs={refs}
                onChange={(v) => setFormulaire((f) => ({ ...f, valeurs: ecrire(f.valeurs, c.cle, v) }))}
              />
            ))}
            <div className="flex justify-end gap-2 sm:col-span-2">
              <button type="button" onClick={() => setFormulaire(null)} className="btn-secondaire">{t('commun.annuler')}</button>
              <button type="submit" disabled={envoi} className="btn-principal">{t('commun.enregistrer')}</button>
            </div>
          </form>
        )}
      </Modale>

      {/* Modale d'une action avec saisie (ex. mouvement de stock) */}
      <Modale titre={saisieAction ? saisieAction.action.formulaire.titre(saisieAction.ligne) : ''} ouverte={Boolean(saisieAction)} onFermer={() => setSaisieAction(null)}>
        {saisieAction && (
          <form onSubmit={validerAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {saisieAction.action.formulaire.champs.map((c) => (
              <Champ
                key={c.cle}
                champ={c}
                valeur={lire(saisieAction.valeurs, c.cle)}
                listesRef={listesRef}
                refs={refs}
                onChange={(v) => setSaisieAction((sa) => ({ ...sa, valeurs: ecrire(sa.valeurs, c.cle, v) }))}
              />
            ))}
            <div className="flex justify-end gap-2 sm:col-span-2">
              <button type="button" onClick={() => setSaisieAction(null)} className="btn-secondaire">{t('commun.annuler')}</button>
              <button type="submit" className="btn-principal">{t('commun.enregistrer')}</button>
            </div>
          </form>
        )}
      </Modale>
    </section>
  )
}

// --- Affichage par défaut d'une valeur dans une cellule
function affichageSimple(v, t) {
  if (v == null || v === '') return '—'
  if (typeof v === 'boolean') return v ? t('commun.oui') : t('commun.non')
  if (Array.isArray(v)) return v.join(', ') || '—'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

// --- Un champ du formulaire, selon son type
function Champ({ champ, valeur, onChange, listesRef, refs }) {
  const { t } = useLangue()
  const { cle, libelle, type = 'texte', options = [], requis, aide, large, min, max, pas } = champ
  const id = `champ-${cle}`
  const classeBloc = large || type === 'lignes' || type === 'zone' ? 'sm:col-span-2' : ''

  // Case à cocher : libellé à droite
  if (type === 'case') {
    return (
      <label className={`flex items-center gap-2 text-sm text-nuit ${classeBloc}`}>
        <input type="checkbox" checked={Boolean(valeur)} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-volt-600" />
        {libelle}
      </label>
    )
  }

  // Sous-lignes (ex. pièces d'une intervention, lignes d'une commande)
  if (type === 'lignes') {
    const liste = Array.isArray(valeur) ? valeur : []
    const vide = Object.fromEntries((champ.sousChamps || []).map((sc) => [sc.cle, '']))
    const maj = (i, k, v) => onChange(liste.map((l, j) => (j === i ? { ...l, [k]: v } : l)))
    return (
      <fieldset className={classeBloc}>
        <legend className="mb-1 text-sm font-bold text-nuit">{libelle}</legend>
        <div className="space-y-2">
          {liste.map((l, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2 rounded-xl bg-brume p-2">
              {(champ.sousChamps || []).map((sc) => (
                <div key={sc.cle} className={sc.type === 'ref' ? 'min-w-[10rem] flex-1' : 'w-28'}>
                  <Champ champ={sc} valeur={l[sc.cle]} onChange={(v) => maj(i, sc.cle, v)} listesRef={listesRef} refs={refs} />
                </div>
              ))}
              <button type="button" onClick={() => onChange(liste.filter((_, j) => j !== i))} className="mb-1 px-2 text-red-600" aria-label={t('crud.retirerLigne')}>×</button>
            </div>
          ))}
          <button type="button" onClick={() => onChange([...liste, { ...vide }])} className="btn-secondaire text-sm">{t('crud.ajouterLigne')}</button>
        </div>
      </fieldset>
    )
  }

  // Contrôle de saisie selon le type
  let controle
  if (type === 'select' || type === 'ref') {
    const choix = type === 'ref'
      ? (listesRef[champ.ref] || []).map((o) => ({ valeur: o.id, libelle: refs[champ.ref] ? refs[champ.ref](o) : o.id }))
      : options
    controle = (
      <select id={id} value={valeur ?? ''} onChange={(e) => onChange(e.target.value)} required={requis} className="champ">
        <option value="">—</option>
        {choix.map((o) => <option key={o.valeur} value={o.valeur}>{o.libelle}</option>)}
      </select>
    )
  } else if (type === 'motdepasse') {
    controle = <MotDePasse id={id} value={valeur ?? ''} onChange={(e) => onChange(e.target.value)} autoComplete="new-password" placeholder={t('crud.mdpInchange')} />
  } else if (type === 'zone') {
    controle = <textarea id={id} value={valeur ?? ''} onChange={(e) => onChange(e.target.value)} required={requis} rows={3} className="champ" />
  } else {
    const typeHtml = { nombre: 'number', date: 'date', dateheure: 'datetime-local' }[type] || 'text'
    controle = (
      <input id={id} type={typeHtml} step={type === 'nombre' ? (pas ?? 'any') : undefined} min={min} max={max} value={valeur ?? ''} onChange={(e) => onChange(e.target.value)} required={requis} className="champ" />
    )
  }
  return (
    <div className={classeBloc}>
      <label htmlFor={id} className="mb-1 block text-sm font-bold text-nuit">{libelle}{requis && <span className="text-red-600"> *</span>}</label>
      {controle}
      {aide && <p className="mt-1 text-xs text-ardoise">{aide}</p>}
    </div>
  )
}
