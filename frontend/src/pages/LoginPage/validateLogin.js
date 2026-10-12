/**
 * Validation côté client du formulaire de connexion.
 * Reprend les règles du LoginRequest Laravel (telephone requis, max 20 ;
 * password requis) pour éviter un aller-retour serveur inutile.
 * Les messages sont traduits dans la langue courante (voir src/i18n).
 */
import { translate } from '../../i18n/i18n'

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
    erreurs.telephone = translate('login.errors.phoneRequired')
  } else if (!/^\+?\d+$/.test(numero)) {
    erreurs.telephone = translate('login.errors.phoneDigits')
  } else if (numero.length > 20) {
    erreurs.telephone = translate('login.errors.phoneTooLong')
  }

  if (!password) {
    erreurs.password = translate('login.errors.passwordRequired')
  }

  return erreurs
}
