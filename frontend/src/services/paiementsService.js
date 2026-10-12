/**
 * Service des mensualités (paiements reçus au secrétariat).
 *
 * Endpoints (préfixe /api/v1, administrateur sauf mention) :
 *   GET  /paiements?mois=&statut=&classe_id=&q=&page=   situation du mois
 *   POST /paiements                                     enregistrer un paiement
 *   GET  /paiements/{id}/recu                           données du reçu
 *   POST /paiements/{id}/annuler                        annuler un reçu (motif)
 *   GET  /paiements/tarifs   PUT /paiements/tarifs      mensualité par classe
 *   GET  /paiements/rappels  POST /paiements/rappels    journal / envoi des rappels WhatsApp
 *   GET  /tuteur/me/paiements                           (tuteur) mensualités de ses enfants
 */
import { apiRequest } from './apiClient'
import { getToken } from './authService'

/** Requête authentifiée avec le token de la session. */
const request = (path, options = {}) => apiRequest(path, { ...options, token: getToken() })

/**
 * Situation des élèves pour un mois.
 * @param {{ mois?: string, statut?: string, classe_id?: string|number, q?: string, page?: number }} filtres
 */
export async function getPaiements(filtres = {}) {
  const params = new URLSearchParams()
  Object.entries(filtres).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value))
  })
  return (await request(`/v1/paiements?${params}`)).data
}

/**
 * Enregistre un paiement reçu.
 * @param {{ eleve_id: number, mois: string, montant: number, mode_paiement: string, date_paiement?: string, note?: string }} body
 * @returns {Promise<{ message: string, data: object }>} message + données du reçu
 */
export function createPaiement(body) {
  return request('/v1/paiements', { method: 'POST', body })
}

/** Données d'un reçu à imprimer. */
export async function getRecu(id) {
  return (await request(`/v1/paiements/${id}/recu`)).data
}

/** Annule un reçu erroné (il reste visible, marqué « annulé »). */
export function annulerPaiement(id, motif) {
  return request(`/v1/paiements/${id}/annuler`, { method: 'POST', body: { motif } })
}

/** Mensualité de chaque classe de l'année en cours. */
export async function getTarifs() {
  return (await request('/v1/paiements/tarifs')).data
}

/**
 * Modifie les mensualités (null = tarif par défaut).
 * @param {Array<{ classe_id: number, mensualite: number|null }>} tarifs
 */
export function updateTarifs(tarifs) {
  return request('/v1/paiements/tarifs', { method: 'PUT', body: { tarifs } })
}

/** Envoie maintenant les rappels WhatsApp du mois. */
export function envoyerRappels(mois) {
  return request('/v1/paiements/rappels', { method: 'POST', body: { mois } })
}

/** (Tuteur) Mensualités de l'année pour ses enfants. */
export async function getMesPaiements() {
  return (await request('/v1/tuteur/me/paiements')).data
}
