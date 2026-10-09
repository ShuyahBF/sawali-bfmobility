// ============================================================================
// PhotosVehicule (lot 9) — back-office : les 4 photos d'un véhicule
// (vue de face, intérieur cabine avant, intérieur cabine arrière, coffre).
// Chaque emplacement : aperçu, « Choisir une photo » / « Remplacer », « Supprimer ».
// La photo est réduite dans le navigateur avant l'envoi (lib/reduireImage.js).
// Ouvert depuis l'action « 📷 Photos » de la liste des véhicules (TableauCrud).
// ============================================================================
import { useCallback, useEffect, useRef, useState } from 'react'
import api, { URL_API, messageErreur } from '@/lib/api.js'
import { reduireImage } from '@/lib/reduireImage.js'
import { useToasts } from './Toasts.jsx'
import Jauge from './Jauge.jsx'
import { useLangue } from '@/i18n/index.jsx'

// Adresse complète d'une image servie par l'API (« /api/public/… » → « https://api…/api/public/… »)
export const urlImage = (chemin) => (chemin ? `${URL_API.replace(/\/api$/, '')}${chemin}` : '')

export default function PhotosVehicule({ vehicule, peutModifier = true }) {
  const { t } = useLangue()
  const toast = useToasts()
  const [vues, setVues] = useState(null)
  const [enCours, setEnCours] = useState(null)       // vue en cours d'envoi / de suppression
  const entrees = useRef({})                           // champs « fichier » cachés, un par vue

  // Lecture des 4 emplacements
  const charger = useCallback(async () => {
    try { setVues((await api.get(`/admin/vehicules/${vehicule.id}/photos`)).data.vues) }
    catch (err) { toast.erreur(messageErreur(err)); setVues([]) }
  }, [vehicule.id])   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { charger() }, [charger])

  // Envoi d'une photo (réduite d'abord), avec « Patientez… »
  const envoyer = async (vue, fichier) => {
    if (!fichier) return
    setEnCours(vue)
    try {
      const image = await reduireImage(fichier)
      await toast.attente(api.put(`/admin/vehicules/${vehicule.id}/photos/${vue}`, { image }))
      toast.succes(t('photos.admin.envoyee'))
      await charger()
    } catch (err) {
      toast.erreur(err?.response ? messageErreur(err) : err.message)
    } finally {
      setEnCours(null)
      if (entrees.current[vue]) entrees.current[vue].value = ''
    }
  }

  // Suppression d'une photo (après confirmation)
  const supprimer = async (vue) => {
    if (!window.confirm(t('photos.admin.confirmer'))) return
    setEnCours(vue)
    try {
      await api.delete(`/admin/vehicules/${vehicule.id}/photos/${vue}`)
      toast.succes(t('photos.admin.supprimee'))
      await charger()
    } catch (err) { toast.erreur(messageErreur(err)) } finally { setEnCours(null) }
  }

  if (!vues) return <div className="flex justify-center py-8"><Jauge taille={40} /></div>
  return (
    <div>
      <p className="mb-4 text-sm text-ardoise">{t('photos.admin.aide')}</p>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {vues.map((v) => (
          <li key={v.vue} className="overflow-hidden rounded-2xl ring-1 ring-nuit/10">
            {/* Aperçu (ou emplacement vide) */}
            <div className="relative aspect-[4/3] bg-brume">
              {v.url
                ? <img src={urlImage(v.url)} alt={t(`photos.vue.${v.vue}`)} className="h-full w-full object-cover" loading="lazy" />
                : <div className="grid h-full place-items-center text-sm text-ardoise">{t('photos.admin.vide')}</div>}
              {enCours === v.vue && <div className="absolute inset-0 grid place-items-center bg-white/60"><Jauge taille={36} /></div>}
            </div>
            <div className="flex flex-wrap items-center gap-2 p-3">
              <span className="flex-1 font-bold text-nuit">{t(`photos.vue.${v.vue}`)}</span>
              {peutModifier && (
                <>
                  <input ref={(el) => { entrees.current[v.vue] = el }} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                         onChange={(e) => envoyer(v.vue, e.target.files?.[0])} />
                  <button type="button" disabled={Boolean(enCours)} onClick={() => entrees.current[v.vue]?.click()} className="btn-secondaire px-3 py-1.5 text-sm">
                    {v.url ? t('photos.admin.remplacer') : t('photos.admin.choisir')}
                  </button>
                  {v.url && (
                    <button type="button" disabled={Boolean(enCours)} onClick={() => supprimer(v.vue)} className="lien-action text-red-600">
                      {t('photos.admin.supprimer')}
                    </button>
                  )}
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
