/**
 * Validation côté client du formulaire de connexion.
 * Reprend les règles du LoginRequest Laravel (telephone requis, max 20 ;
 * password requis) pour éviter un aller-retour serveur inutile.
 */

// Caractères que le backend retire lui-même avant comparaison.
const SEPARATEURS = /[\s.\-()]/g

/**
 * @param {{ telephone: string, password: string }} valeurs
 * @returns {{ telephone?: string, password?: string }} Erreurs par champ (vide si tout est valide)
 */
export function validateLogin({ telephone, password }) {
  const erreurs = {}
  const numero = telephone.replace(SEPARATEURS, '')

  if (!numero) {
    erreurs.telephone = 'Saisissez votre numéro de téléphone.'
  } else if (!/^\+?\d+$/.test(numero)) {
    erreurs.telephone = 'Le numéro ne doit contenir que des chiffres (et éventuellement + au début).'
  } else if (numero.length > 20) {
    erreurs.telephone = 'Le numéro ne doit pas dépasser 20 chiffres.'
  }

  if (!password) {
    erreurs.password = 'Saisissez votre mot de passe.'
  }

  return erreurs
}
