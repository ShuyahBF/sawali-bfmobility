// ============================================================================
// Configuration publique de la plateforme (pays, devise, unité de distance…)
// et catégories de véhicules/tarifs, chargées une fois au démarrage.
// Fournit aussi les fonctions d'affichage adaptées : monnaie(), distance().
// ============================================================================
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import api from '@/lib/api.js'
import { formatDistance, formatMonnaie } from '@/lib/format.js'
import { langueMemorisee, useLangue } from '@/i18n/index.jsx'

// Valeurs par défaut tant que le serveur n'a pas répondu (ou s'il est injoignable)
const CONFIG_DEFAUT = {
  nom: 'bfmobility',
  slogan: 'Roulez propre, payez juste.',
  pays: 'BF',
  devise: 'XOF',
  langue: 'fr',
  fuseau: 'Africa/Ouagadougou',
  unite_distance: 'km',
  telephone_support: '',
  email_support: '',
  pays_disponibles: [],
  // Lot 2 : moyens de paiement en ligne configurés sur le serveur et connexion par code
  paiements_en_ligne: { mobile_money: false, carte: false, especes: true },
  connexion_par_code: false,
}

const ContexteConfig = createContext(null)

export function ConfigProvider({ children }) {
  const { langue, changerLangue } = useLangue()
  const [config, setConfig] = useState(CONFIG_DEFAUT)
  const [categories, setCategories] = useState([])
  const [charge, setCharge] = useState(false)

  // (Re)chargement des catégories et tarifs publics
  const chargerCategories = useCallback(async () => {
    try {
      const { data } = await api.get('/public/categories')
      setCategories(Array.isArray(data) ? data : [])
    } catch { /* serveur indisponible : la liste reste vide */ }
  }, [])

  // Chargement initial de la configuration publique
  useEffect(() => {
    let actif = true
    api.get('/public/config')
      .then(({ data }) => {
        if (!actif) return
        setConfig({ ...CONFIG_DEFAUT, ...data })
        // Si le visiteur n'a jamais choisi de langue, on prend celle de la plateforme
        if (data?.langue && !langueMemorisee()) changerLangue(data.langue)
      })
      .catch(() => {})
      .finally(() => actif && setCharge(true))
    chargerCategories()
    return () => { actif = false }
  }, [chargerCategories, changerLangue])

  // Fonctions d'affichage qui tiennent compte de la devise, de l'unité et de la langue
  const monnaie = useCallback((n, devise) => formatMonnaie(n, devise || config.devise, langue), [config.devise, langue])
  const distance = useCallback((km) => formatDistance(km, config.unite_distance, langue), [config.unite_distance, langue])

  const valeur = useMemo(
    () => ({ config, setConfig, categories, chargerCategories, charge, monnaie, distance }),
    [config, categories, chargerCategories, charge, monnaie, distance],
  )
  return <ContexteConfig.Provider value={valeur}>{children}</ContexteConfig.Provider>
}

export function useConfig() {
  return useContext(ContexteConfig)
}
