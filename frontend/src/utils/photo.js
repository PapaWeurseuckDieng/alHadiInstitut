/**
 * Préparation d'une photo avant envoi à l'API (limite serveur : 2 Mo, JPG/PNG/WEBP).
 * Les photos de téléphone dépassent souvent 3 Mo : elles sont réduites à 1024 px
 * de côté maximum et réencodées en JPEG, ce qui les rend aussi plus rapides à envoyer.
 */

const COTE_MAX = 1024
const QUALITE = 0.85
const TAILLE_MAX = 2 * 1024 * 1024

/** Erreur de photo avec une clé de traduction (i18n « photo.errors.… »). */
export class PhotoError extends Error {
  constructor(code) {
    super(code)
    this.code = code
  }
}

/** Charge l'image dans le navigateur (échoue si le format n'est pas lisible, ex. HEIC sur ordinateur). */
function chargerImage(fichier) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(fichier)
    const image = new Image()
    image.onload = () => { URL.revokeObjectURL(url); resolve(image) }
    image.onerror = () => { URL.revokeObjectURL(url); reject(new PhotoError('unreadable')) }
    image.src = url
  })
}

/**
 * Réduit et convertit la photo choisie ou prise par l'appareil.
 * @param {File} fichier
 * @returns {Promise<File>} photo JPEG prête à l'envoi
 * @throws {PhotoError} « notImage », « unreadable » ou « tooLarge »
 */
export async function preparerPhoto(fichier) {
  if (!fichier.type.startsWith('image/')) throw new PhotoError('notImage')

  const image = await chargerImage(fichier)
  const echelle = Math.min(1, COTE_MAX / Math.max(image.naturalWidth, image.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.naturalWidth * echelle))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * echelle))
  const contexte = canvas.getContext('2d')
  // Fond blanc : une image PNG transparente ne devient pas noire en JPEG
  contexte.fillStyle = '#fff'
  contexte.fillRect(0, 0, canvas.width, canvas.height)
  contexte.drawImage(image, 0, 0, canvas.width, canvas.height)

  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', QUALITE))
  if (!blob) throw new PhotoError('unreadable')
  if (blob.size > TAILLE_MAX) throw new PhotoError('tooLarge')

  const nom = (fichier.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg'
  return new File([blob], nom, { type: 'image/jpeg' })
}
