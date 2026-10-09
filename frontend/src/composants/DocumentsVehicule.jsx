// ============================================================================
// DocumentsVehicule (lot 11) — onglet « Documents scannés » de la fiche véhicule :
// attestation d'assurance, visite technique et quittance de TVM (impôts).
// Chaque document : « Joindre le scan » / « Remplacer », « Voir », « Supprimer ».
//   - une PHOTO est réduite dans le navigateur avant l'envoi (lib/reduireImage.js) ;
//   - un PDF est envoyé tel quel (4 Mo au plus).
// Les scans ne sont JAMAIS publics : le fichier est lu avec le jeton de connexion
// puis affiché dans l'aperçu sous la liste (image ou PDF).
// ============================================================================
import { useCallback, useEffect, useRef, useState } from 'react'
import api, { messageErreur } from '@/lib/api.js'
import { reduireImage } from '@/lib/reduireImage.js'
import { formatDateHeure } from '@/lib/format.js'
import { useToasts } from './Toasts.jsx'
import Jauge from './Jauge.jsx'
import { useLangue } from '@/i18n/index.jsx'

const TAILLE_MAX = 4 * 1024 * 1024   // 4 Mo (même limite que le serveur)

// Fichier PDF → « data URL » (texte base64) prête à être envoyée dans le corps JSON
const lireEnDataUrl = (fichier) => new Promise((resoudre, rejeter) => {
  const lecteur = new FileReader()
  lecteur.onerror = () => rejeter(new Error('Lecture du fichier impossible.'))
  lecteur.onload = () => resoudre(lecteur.result)
  lecteur.readAsDataURL(fichier)
})

export default function DocumentsVehicule({ vehicule, peutModifier = true }) {
  const { t, langue } = useLangue()
  const toast = useToasts()
  const [docs, setDocs] = useState(null)
  const [enCours, setEnCours] = useState(null)       // document en cours d'envoi / de lecture / de suppression
  const [apercu, setApercu] = useState(null)         // {document, url, type} : scan affiché sous la liste
  const entrees = useRef({})                           // champs « fichier » cachés, un par document

  // Lecture des 3 emplacements
  const charger = useCallback(async () => {
    try { setDocs((await api.get(`/admin/vehicules/${vehicule.id}/documents`)).data.documents) }
    catch (err) { toast.erreur(messageErreur(err)); setDocs([]) }
  }, [vehicule.id])   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { charger() }, [charger])

  // L'adresse temporaire de l'aperçu est libérée quand il change ou quand l'onglet se ferme
  useEffect(() => () => { if (apercu?.url) URL.revokeObjectURL(apercu.url) }, [apercu])

  // Envoi d'un scan (photo réduite ou PDF), avec « Patientez… »
  const envoyer = async (doc, fichier) => {
    if (!fichier) return
    setEnCours(doc)
    try {
      let contenu
      if (fichier.type === 'application/pdf') {
        if (fichier.size > TAILLE_MAX) throw new Error(t('scans.trop'))
        contenu = await lireEnDataUrl(fichier)
      } else {
        contenu = await reduireImage(fichier)
      }
      await toast.attente(api.put(`/admin/vehicules/${vehicule.id}/documents/${doc}`, { fichier: contenu, nom: fichier.name }))
      toast.succes(t('scans.envoye'))
      if (apercu?.document === doc) setApercu(null)
      await charger()
    } catch (err) {
      toast.erreur(err?.response ? messageErreur(err) : err.message)
    } finally {
      setEnCours(null)
      if (entrees.current[doc]) entrees.current[doc].value = ''
    }
  }

  // Affichage d'un scan : lu avec le jeton (jamais d'adresse publique)
  const voir = async (doc) => {
    setEnCours(doc)
    try {
      const r = await api.get(`/admin/vehicules/${vehicule.id}/documents/${doc}/fichier`, { responseType: 'blob' })
      setApercu({ document: doc, url: URL.createObjectURL(r.data), type: r.data.type })
    } catch (err) { toast.erreur(messageErreur(err)) } finally { setEnCours(null) }
  }

  // Suppression d'un scan (après confirmation)
  const supprimer = async (doc) => {
    if (!window.confirm(t('scans.confirmer'))) return
    setEnCours(doc)
    try {
      await api.delete(`/admin/vehicules/${vehicule.id}/documents/${doc}`)
      toast.succes(t('scans.supprime'))
      if (apercu?.document === doc) setApercu(null)
      await charger()
    } catch (err) { toast.erreur(messageErreur(err)) } finally { setEnCours(null) }
  }

  if (!docs) return <div className="flex justify-center py-8"><Jauge taille={40} /></div>
  return (
    <div>
      <p className="mb-4 text-sm text-ardoise">{t('scans.aide')}</p>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {docs.map((d) => (
          <li key={d.document} className={`flex flex-col gap-2 rounded-2xl p-4 ring-1 ${apercu?.document === d.document ? 'bg-sky-50 ring-sky-300' : 'ring-nuit/10'}`}>
            <span className="font-bold text-nuit">{t(`scans.doc.${d.document}`)}</span>
            {/* État du scan : nom du fichier et date, ou « Aucun scan » */}
            {d.present
              ? <span className="text-xs text-ardoise"><span aria-hidden="true">{d.type === 'application/pdf' ? '📕 ' : '🖼️ '}</span>{d.nom}<br />{formatDateHeure(d.maj_le, langue)}</span>
              : <span className="text-xs text-ardoise">{t('scans.vide')}</span>}
            <div className="mt-auto flex flex-wrap items-center gap-2">
              {enCours === d.document && <Jauge taille={20} />}
              {d.present && <button type="button" disabled={Boolean(enCours)} onClick={() => voir(d.document)} className="lien-action">{t('scans.voir')}</button>}
              {peutModifier && (
                <>
                  <input ref={(el) => { entrees.current[d.document] = el }} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden"
                         onChange={(e) => envoyer(d.document, e.target.files?.[0])} />
                  <button type="button" disabled={Boolean(enCours)} onClick={() => entrees.current[d.document]?.click()} className="btn-secondaire px-3 py-1.5 text-sm">
                    {d.present ? t('scans.remplacer') : t('scans.choisir')}
                  </button>
                  {d.present && <button type="button" disabled={Boolean(enCours)} onClick={() => supprimer(d.document)} className="lien-action text-red-600">{t('scans.supprimer')}</button>}
                </>
              )}
            </div>
          </li>
        ))}
      </ul>

      {/* Aperçu du scan choisi : image ou PDF */}
      {apercu && (
        <div className="mt-4 overflow-hidden rounded-2xl ring-1 ring-nuit/10">
          <div className="flex items-center justify-between bg-brume px-4 py-2 text-sm">
            <b>{t(`scans.doc.${apercu.document}`)}</b>
            <button type="button" onClick={() => setApercu(null)} className="lien-action" aria-label={t('commun.fermer')}>×</button>
          </div>
          {apercu.type === 'application/pdf'
            ? <iframe title={t(`scans.doc.${apercu.document}`)} src={apercu.url} className="h-[60vh] w-full" />
            : <img src={apercu.url} alt={t(`scans.doc.${apercu.document}`)} className="mx-auto max-h-[60vh] object-contain" />}
        </div>
      )}
    </div>
  )
}
