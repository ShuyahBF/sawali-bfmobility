// ============================================================================
// Reçu d'une course (GET /courses/{id}/recu), prêt à imprimer (@media print)
// ============================================================================
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import PageSite from '@/composants/MiseEnPage.jsx'
import Logo from '@/composants/Logo.jsx'
import Jauge from '@/composants/Jauge.jsx'
import { useToasts } from '@/composants/Toasts.jsx'
import { useConfig } from '@/contexte/Config.jsx'
import { useLangue } from '@/i18n/index.jsx'
import api, { messageErreur } from '@/lib/api.js'
import { formatDateHeure, formatDuree } from '@/lib/format.js'

// Nom affiché des opérateurs de paiement en ligne
const NOMS_OPERATEURS = { pawapay: 'pawaPay', stripe: 'Stripe' }

export default function Recu() {
  const { id } = useParams()
  const { t, langue } = useLangue()
  const { monnaie, distance } = useConfig()
  const toast = useToasts()
  const [recu, setRecu] = useState(null)
  const [erreur, setErreur] = useState('')

  // Chargement du reçu
  useEffect(() => {
    toast.attente(api.get(`/courses/${id}/recu`))
      .then(({ data }) => setRecu(data))
      .catch((err) => setErreur(messageErreur(err)))
  }, [id, toast])

  return (
    <PageSite sansPied>
      <div className="mx-auto max-w-2xl px-4 py-8">
        {/* Boutons (non imprimés) */}
        <div className="no-print mb-4 flex justify-between gap-2">
          <Link to={`/courses/${id}`} className="btn-secondaire">{t('commun.retour')}</Link>
          <button type="button" onClick={() => window.print()} disabled={!recu} className="btn-nuit">{t('commun.imprimer')}</button>
        </div>
        {!recu && !erreur && <div className="flex justify-center py-16"><Jauge taille={48} /></div>}
        {erreur && <p className="text-red-600">{erreur}</p>}

        {recu && (
          <article className="print-plein rounded-3xl bg-white p-6 ring-1 ring-nuit/10 sm:p-10">
            {/* En-tête : société + numéro */}
            <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-nuit pb-5">
              <div>
                <Logo />
                <p className="mt-2 text-sm font-bold">{recu.societe?.nom}</p>
                <p className="text-sm text-ardoise">{[recu.societe?.telephone, recu.societe?.email, recu.societe?.pays].filter(Boolean).join(' — ')}</p>
              </div>
              <div className="text-right">
                <h1 className="text-2xl font-bold">{t('recu.titre')}</h1>
                <p className="text-sm">{t('recu.numero', { numero: recu.numero })}</p>
                <p className="text-sm text-ardoise">{formatDateHeure(recu.date, langue)}</p>
              </div>
            </header>

            {/* Parties */}
            <dl className="grid grid-cols-1 gap-4 py-5 text-sm sm:grid-cols-3">
              <div><dt className="text-ardoise">{t('recu.client')}</dt><dd className="font-bold">{recu.client?.nom}</dd><dd>{recu.client?.telephone}</dd></div>
              <div><dt className="text-ardoise">{t('recu.chauffeur')}</dt><dd className="font-bold">{recu.chauffeur?.nom || '—'}</dd></div>
              <div><dt className="text-ardoise">{t('recu.vehicule')}</dt><dd className="font-bold">{recu.vehicule?.modele || '—'}</dd><dd className="font-mono">{recu.vehicule?.immatriculation}</dd></div>
            </dl>

            {/* Trajet */}
            <section className="rounded-2xl bg-brume p-4 text-sm print:bg-white print:ring-1 print:ring-nuit/20">
              <p className="mb-1 text-ardoise">{t('recu.trajet')}</p>
              <p><b>A</b> {recu.trajet?.depart}</p>
              {recu.trajet?.arrivee && <p><b>B</b> {recu.trajet.arrivee}</p>}
              <p className="mt-1 text-ardoise">{distance(recu.trajet?.distance_km)} — {formatDuree(recu.trajet?.duree_min)}</p>
            </section>

            {/* Lignes du prix */}
            <table className="mt-5 w-full text-sm">
              <tbody>
                {(recu.lignes || []).map((l) => (
                  <tr key={l.libelle} className="border-b border-nuit/10">
                    <td className="py-2">{l.libelle}</td>
                    <td className="py-2 text-right tabular-nums">{monnaie(l.montant, recu.devise)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="pt-4 font-display text-lg font-bold">{t('recu.total')}</td>
                  <td className="pt-4 text-right font-display text-2xl font-extrabold tabular-nums">{monnaie(recu.total, recu.devise)}</td>
                </tr>
              </tfoot>
            </table>

            {/* Paiement */}
            <p className="mt-4 text-sm">
              <span className="text-ardoise">{t('recu.paiement')} :</span> <b>{t(`cmd.${recu.paiement?.moyen}`)}</b>
              {/* Opérateur du paiement en ligne (pawaPay, Stripe…), s'il y en a un */}
              {recu.paiement?.operateur && <> ({t('recu.operateur')} : {NOMS_OPERATEURS[recu.paiement.operateur] || recu.paiement.operateur})</>}
              {' '}— {t(`paiement.${recu.paiement?.statut || 'non_paye'}`)}
              {recu.paiement?.reference && <> — {t('recu.reference')} {recu.paiement.reference}</>}
            </p>
            <p className="mt-8 text-center text-sm text-ardoise">{t('recu.merci')}</p>
          </article>
        )}
      </div>
    </PageSite>
  )
}
