/**
 * Service d'authentification (Laravel Sanctum, mode token).
 *
 * Contrat backend utilisé (backend/routes/api.php + Api/AuthController) :
 *   POST /api/auth/login   { telephone, password }
 *     200 -> { message, token, token_type: "Bearer", user }
 *     401 -> { message }  identifiants incorrects
 *     403 -> { message }  compte désactivé
 *     422 -> { message, errors: { telephone?: [], password?: [] } }
 *     429 -> { message }  trop de tentatives (5/min)
 */
import { apiRequest } from './apiClient'

// Clés de stockage local de la session.
const CLE_TOKEN = 'alhadi.auth.token'
const CLE_UTILISATEUR = 'alhadi.auth.user'

/**
 * Connecte un utilisateur et enregistre sa session.
 * @param {{ telephone: string, password: string }} identifiants
 * @returns {Promise<{ token: string, user: object }>}
 * @throws {import('./apiClient').ApiError}
 */
export async function login({ telephone, password }) {
  const reponse = await apiRequest('/auth/login', {
    method: 'POST',
    // Le backend normalise lui-même le numéro (espaces, points, tirets...).
    body: { telephone: telephone.trim(), password },
  })

  enregistrerSession(reponse.token, reponse.user)
  return { token: reponse.token, user: reponse.user }
}

/**
 * Sauvegarde le token et l'utilisateur dans le navigateur.
 * @param {string} token
 * @param {object} user
 */
function enregistrerSession(token, user) {
  try {
    localStorage.setItem(CLE_TOKEN, token)
    localStorage.setItem(CLE_UTILISATEUR, JSON.stringify(user))
  } catch {
    // Stockage indisponible (navigation privée stricte) : la session
    // ne survivra pas au rechargement, mais la connexion reste valide.
  }
}

/** @returns {string | null} Token Sanctum courant, s'il existe. */
export function getToken() {
  try {
    return localStorage.getItem(CLE_TOKEN)
  } catch {
    return null
  }
}

/** @returns {object | null} Utilisateur connecté, s'il existe. */
export function getUtilisateur() {
  try {
    const brut = localStorage.getItem(CLE_UTILISATEUR)
    return brut ? JSON.parse(brut) : null
  } catch {
    return null
  }
}
