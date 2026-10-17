/**
 * Diplômes des élèves (Admin ; le tuteur consulte ceux de ses enfants).
 *   GET  /diplomes?q=&statut=&page=      liste et indicateurs
 *   POST /eleves/{id}/diplomes           délivrer
 *   GET  /diplomes/{id}                  diplôme à imprimer (admin ou tuteur de l'élève)
 *   PATCH /diplomes/{id}                 corriger
 *   POST /diplomes/{id}/annuler          annuler (motif)
 */
import { apiRequest } from './apiClient'
import { getToken } from './authService'

const request = (path, options = {}) => apiRequest(path, { ...options, token: getToken() })

export async function getDiplomes({ q = '', statut = '', page = 1 } = {}) {
  const params = new URLSearchParams({ page: String(page) })
  if (q) params.set('q', q)
  if (statut) params.set('statut', statut)
  return (await request(`/v1/diplomes?${params}`)).data
}

export async function getDiplome(id) {
  return (await request(`/v1/diplomes/${id}`)).data
}

/** @param {{ type: string, intitule?: string, mention?: string|null, date_obtention: string, observations?: string }} body */
export function createDiplome(eleveId, body) {
  return request(`/v1/eleves/${eleveId}/diplomes`, { method: 'POST', body })
}

export function updateDiplome(id, body) {
  return request(`/v1/diplomes/${id}`, { method: 'PATCH', body })
}

export function annulerDiplome(id, motif) {
  return request(`/v1/diplomes/${id}/annuler`, { method: 'POST', body: { motif } })
}

/** Types et mentions (valeurs de l'API) ; les libellés sont dans i18n « dip.types » et « dip.mentions ». */
export const TYPES_DIPLOME = ['hifz_complet', 'hifz_partiel', 'fin_cycle', 'tajwid', 'autre']
export const MENTIONS_DIPLOME = ['passable', 'assez_bien', 'bien', 'tres_bien', 'excellent']

/** Élèves dont le nom, le prénom ou le matricule contient la recherche (pour délivrer un diplôme). */
export async function searchEleves(q) {
  return (await request(`/v1/eleves?q=${encodeURIComponent(q)}`)).data
}
