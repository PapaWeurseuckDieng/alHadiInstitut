import { apiRequest } from './apiClient'
import { getToken } from './authService'

export async function getDashboard({ section, q, annee, page }) {
  const params = new URLSearchParams({ section, page: String(page) })
  if (q) params.set('q', q)
  if (annee) params.set('annee', annee)
  return (await apiRequest(`/v1/admin/dashboard?${params}`, { token: getToken() })).data
}

export async function getMyRecords(role) {
  const path = role === 'tuteur' ? '/v1/tuteur/me/eleves' : '/v1/oustaz/me/classes'
  return (await apiRequest(path, { token: getToken() })).data
}

export function createRecord(kind, body) {
  const paths = { eleve: '/v1/eleves', classe: '/v1/classes', user: '/v1/admin/users' }
  return apiRequest(paths[kind], { method: 'POST', token: getToken(), body })
}
