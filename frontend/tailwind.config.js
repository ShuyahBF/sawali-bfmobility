/** @type {import('tailwindcss').Config} */
// ============================================================================
// Charte graphique sawali-bfmobility
//   nuit  : bleu nuit profond (fonds forts, texte principal)
//   volt  : vert électrique (action principale, électrique, « en ligne »)
//   ambre : touches chaudes (promos, arrivée, alertes « attention »)
//   brume : fond clair des pages
//   ardoise : texte secondaire
// ============================================================================
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        nuit: { DEFAULT: '#0B1F3A', 900: '#071528', 800: '#0B1F3A', 700: '#13305A', 600: '#1E4378' },
        volt: { DEFAULT: '#14C97E', 50: '#E7FBF2', 100: '#C6F5DF', 400: '#2EE59D', 500: '#14C97E', 600: '#0E9E62', 700: '#0B7B4D' },
        ambre: { DEFAULT: '#F5A524', 50: '#FEF5E4', 100: '#FDE6BC', 500: '#F5A524', 600: '#D9860A' },
        brume: '#F2F5F9',
        ardoise: '#52617A',
      },
      fontFamily: {
        // Titres : grotesque expressive ; corps : police très lisible (chauffeurs en plein soleil)
        display: ['"Bricolage Grotesque"', 'system-ui', 'sans-serif'],
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
