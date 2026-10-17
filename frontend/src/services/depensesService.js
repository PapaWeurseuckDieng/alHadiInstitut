import { apiRequest } from './apiClient'
import { getToken } from './authService'

const request = (path, options = {}) => apiRequest(path, { ...options, token: getToken() })

/**
 * Liste des dépenses et indicateurs de la période.
 * @param {{ mois?: string, annee_scolaire?: string, categorie?: string, statut?: string, q?: string, page?: number }} filtres
 */
export async function getDepenses(filtres = {}) {
  const params = new URLSearchParams()
  Object.entries(filtres).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value))
  })
  return (await request(`/v1/depenses?${params}`)).data
}

export function createDepense(body) {
  return request('/v1/depenses', { method: 'POST', body })
}

/** Corrige une dépense encore en attente. */
export function updateDepense(id, body) {
  return request(`/v1/depenses/${id}`, { method: 'PATCH', body })
}

export function validerDepense(id) {
  return request(`/v1/depenses/${id}/valider`, { method: 'POST' })
}

export function rejeterDepense(id, motif) {
  return request(`/v1/depenses/${id}/rejeter`, { method: 'POST', body: { motif } })
}
