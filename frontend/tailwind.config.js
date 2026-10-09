/** @type {import('tailwindcss').Config} */
// ============================================================================
// Charte graphique sawali-bfmobility — refonte « Ouaga en mouvement » (09/10/2026)
//   nuit    : indigo profond (fonds forts, texte principal) — le ciel de Ouaga à la tombée du jour
//   volt    : jaune soleil (action principale, électrique, « en ligne ») — le jaune du taxi
//   ambre   : fuchsia (promotions, mises en avant, alertes « attention »)
//   brume   : fond clair et froid des pages
//   ardoise : texte secondaire
// Les noms des couleurs sont conservés : toutes les pages changent d'apparence sans être réécrites.
// ============================================================================
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        nuit: { DEFAULT: '#1A1650', 900: '#100D36', 800: '#1A1650', 700: '#2A2470', 600: '#3D3690' },
        volt: { DEFAULT: '#FFC629', 50: '#FFF8DB', 100: '#FFEFB0', 400: '#FFD54D', 500: '#FFC629', 600: '#E0A800', 700: '#7A5A00' },
        ambre: { DEFAULT: '#D62B63', 50: '#FDEAF0', 100: '#FAD0DE', 500: '#D62B63', 600: '#B81F52' },
        brume: '#F4F4FA',
        ardoise: '#5A5B78',
      },
      fontFamily: {
        // Titres : Unbounded, grotesque large et arrondie (identité) ; corps : très lisible (chauffeurs en plein soleil)
        display: ['Unbounded', 'system-ui', 'sans-serif'],
        sans: ['"Atkinson Hyperlegible"', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        // Rotation de l'arc de la jauge d'attente
        tourne: { to: { transform: 'rotate(360deg)' } },
        // Arrivée d'un toast par le bas
        monte: { from: { transform: 'translateY(12px)', opacity: '0' }, to: { transform: 'none', opacity: '1' } },
        // Tracé progressif du trajet sur la carte du héros (une seule fois)
        trace: { from: { strokeDashoffset: '1' }, to: { strokeDashoffset: '0' } },
        // Pulsation du point « chauffeur »
        pouls: { '0%': { transform: 'scale(.6)', opacity: '.8' }, '100%': { transform: 'scale(2.4)', opacity: '0' } },
      },
      animation: {
        tourne: 'tourne 0.9s linear infinite',
        monte: 'monte .25s ease-out',
        trace: 'trace 1.6s cubic-bezier(.6,.1,.2,1) forwards',
        pouls: 'pouls 1.8s ease-out infinite',
      },
    },
  },
  plugins: [],
}
