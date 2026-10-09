// ============================================================================
// Réduction d'une photo AVANT l'envoi (lot 9) : une photo de téléphone pèse souvent 4 à 8 Mo ; on la ramène à
// 1 600 px au plus (côté le plus long), en JPEG qualité 0,82 (≈ 200 à 500 Ko). Le serveur refuse au-delà de 2 Mo.
// Renvoie une « data URL » (texte base64) prête à être envoyée dans le corps JSON.
// ============================================================================
export const COTE_MAX = 1600

export function reduireImage(fichier, coteMax = COTE_MAX, qualite = 0.82) {
  return new Promise((resoudre, rejeter) => {
    if (!fichier || !fichier.type?.startsWith('image/')) { rejeter(new Error('Choisissez une image (JPEG, PNG ou WebP).')); return }
    const lecteur = new FileReader()
    lecteur.onerror = () => rejeter(new Error('Lecture de la photo impossible.'))
    lecteur.onload = () => {
      const img = new Image()
      img.onerror = () => rejeter(new Error('Photo illisible.'))
      img.onload = () => {
        // Nouvelles dimensions (proportions gardées)
        const echelle = Math.min(1, coteMax / Math.max(img.width, img.height))
        const largeur = Math.round(img.width * echelle)
        const hauteur = Math.round(img.height * echelle)
        const toile = document.createElement('canvas')
        toile.width = largeur
        toile.height = hauteur
        const ctx = toile.getContext('2d')
        ctx.fillStyle = '#ffffff'            // fond blanc (PNG transparent → JPEG)
        ctx.fillRect(0, 0, largeur, hauteur)
        ctx.drawImage(img, 0, 0, largeur, hauteur)
        resoudre(toile.toDataURL('image/jpeg', qualite))
      }
      img.src = lecteur.result
    }
    lecteur.readAsDataURL(fichier)
  })
}
