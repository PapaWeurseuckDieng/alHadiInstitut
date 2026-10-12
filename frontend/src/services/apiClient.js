/**
 * Client HTTP minimal basé sur fetch, partagé par tous les services.
 *
 * - Préfixe chaque chemin avec VITE_API_URL (voir .env.example).
 * - Envoie et attend du JSON.
 * - Transforme toute réponse non-2xx en ApiError, pour que l'interface
 *   n'ait jamais à manipuler directement les objets Response.
 */

import { getLanguage, translate } from '../i18n/i18n'

// URL de base de l'API. Aucune valeur sensible : seulement l'adresse du serveur.
const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')

// Au-delà de ce délai, la requête est annulée et une erreur réseau est levée.
const DELAI_MAX_MS = 15000

/**
 * Erreur normalisée renvoyée par le client.
 * status = 0 signifie que le serveur n'a pas pu être joint (réseau, délai, URL absente).
 */
export class ApiError extends Error {
  /**
   * @param {string} message  Message lisible (souvent fourni par Laravel)
   * @param {number} status   Code HTTP, ou 0 si erreur réseau
   * @param {Record<string, string[]>} [errors]  Erreurs de validation Laravel (422)
   */
  constructor(message, status, errors = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.errors = errors
  }
}

/**
 * Lit le corps JSON d'une réponse sans planter si le corps est vide ou non JSON.
 * @param {Response} response
 * @returns {Promise<any>}
 */
async function lireJson(response) {
  const texte = await response.text()
  if (!texte) return null
  try {
    return JSON.parse(texte)
  } catch {
    return null
  }
}

/**
 * Effectue une requête vers l'API.
 * @param {string} chemin  Chemin relatif, ex. "/auth/login"
 * @param {{ method?: string, body?: unknown, token?: string }} [options]
 * @returns {Promise<any>} Corps JSON de la réponse en cas de succès
 * @throws {ApiError}
 */
export async function apiRequest(chemin, { method = 'GET', body, token } = {}) {
  if (!API_URL) {
    throw new ApiError(translate('errors.noApiUrl'), 0)
  }

  const controleur = new AbortController()
  const minuteur = setTimeout(() => controleur.abort(), DELAI_MAX_MS)

  const entetes = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    // Langue de l'interface : permettra au backend de répondre en arabe s'il est traduit un jour
    'Accept-Language': getLanguage(),
  }
  // Le token Sanctum est transmis en Bearer pour les routes protégées.
  if (token) entetes.Authorization = `Bearer ${token}`

  let response
  try {
    response = await fetch(`${API_URL}${chemin}`, {
      method,
      headers: entetes,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controleur.signal,
    })
  } catch {
    // Serveur éteint, réseau coupé, CORS refusé ou délai dépassé.
    throw new ApiError(translate('errors.network'), 0)
  } finally {
    clearTimeout(minuteur)
  }

  const donnees = await lireJson(response)

  if (!response.ok) {
    throw new ApiError(
      donnees?.message || translate('errors.generic'),
      response.status,
      donnees?.errors ?? {},
    )
  }

  return donnees
}
