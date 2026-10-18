import { apiRequest, toFormData } from './apiClient'
import { getToken } from './authService'

/** Liste et indicateurs du tableau de bord ; archives = true inclut les dossiers archivés. */
export async function getDashboard({ section, q, annee, page, archives = false }) {
  const params = new URLSearchParams({ section, page: String(page) })
  if (q) params.set('q', q)
  if (annee) params.set('annee', annee)
  if (archives) params.set('include_archived', '1')
  return (await apiRequest(`/v1/admin/dashboard?${params}`, { token: getToken() })).data
}

export async function getMyRecords(role) {
  const path = role === 'tuteur' ? '/v1/tuteur/me/eleves' : '/v1/oustaz/me/classes'
  return (await apiRequest(path, { token: getToken() })).data
}

/**
 * Crée un élève, une classe ou un compte.
 * Avec une photo (body.photo = File), la requête part en multipart/form-data ; sinon en JSON.
 */
export function createRecord(kind, { photo, ...body }) {
  const paths = { eleve: '/v1/eleves', classe: '/v1/classes', user: '/v1/admin/users' }
  return apiRequest(paths[kind], { method: 'POST', token: getToken(), body: photo ? toFormData({ ...body, photo }) : body })
}

/** Ajoute ou remplace la photo d'un élève (kind = 'eleve') ou d'un compte (kind = 'user'). */
export function updatePhoto(kind, id, photo) {
  const path = kind === 'eleve' ? `/v1/eleves/${id}/photo` : `/v1/admin/users/${id}/photo`
  return apiRequest(path, { method: 'POST', token: getToken(), body: toFormData({ photo }) })
}

/** Remet le mot de passe temporaire « passer » (changement imposé à la prochaine connexion). */
export function resetPassword(userId) {
  return apiRequest(`/v1/admin/users/${userId}/reset-password`, { method: 'POST', token: getToken() })
}

/* ---------- Détail, modification et archivage (Admin) ---------- */

export async function getUser(id) {
  return (await apiRequest(`/v1/admin/users/${id}?include_archived=1`, { token: getToken() })).data
}

export function updateUser(id, body) {
  return apiRequest(`/v1/admin/users/${id}`, { method: 'PATCH', token: getToken(), body })
}

export function archiveUser(id, motif) {
  return apiRequest(`/v1/admin/users/${id}/archive`, { method: 'POST', token: getToken(), body: { motif: motif || null } })
}

export async function getEleve(id) {
  return (await apiRequest(`/v1/eleves/${id}?include_archived=1`, { token: getToken() })).data
}

export function updateEleve(id, body) {
  return apiRequest(`/v1/eleves/${id}`, { method: 'PATCH', token: getToken(), body })
}

export function archiveEleve(id, motif) {
  return apiRequest(`/v1/eleves/${id}/archive`, { method: 'POST', token: getToken(), body: { motif: motif || null } })
}

/** Réinscription d'un élève existant pour l'année scolaire courante. */
export function reinscrire(eleveId, classeId) {
  return apiRequest('/v1/inscriptions-annuelles', { method: 'POST', token: getToken(), body: { eleve_id: eleveId, classe_id: classeId } })
}

/** Modifie une classe : nom, niveau ou oustaz responsable. */
export function updateClasse(id, body) {
  return apiRequest(`/v1/classes/${id}`, { method: 'PATCH', token: getToken(), body })
}

/** Synthèse de progression d'un enfant (tuteur rattaché). */
export async function getSynthese(eleveId) {
  return (await apiRequest(`/v1/tuteur/enfants/${eleveId}/synthese`, { token: getToken() })).data
}

/* ---------- Tuteurs d'un élève et changement de classe (Admin) ---------- */

/** Rattache un tuteur : { mode: 'existant', tuteur_id } ou { mode: 'creer', compte: {...} }, + lien_parente, est_payeur… */
export function attachTuteur(eleveId, body) {
  return apiRequest(`/v1/eleves/${eleveId}/tuteurs`, { method: 'POST', token: getToken(), body })
}

/** Modifie un rattachement : lien_parente, est_responsable_legal, est_payeur. */
export function updateTuteurLink(eleveId, tuteurId, body) {
  return apiRequest(`/v1/eleves/${eleveId}/tuteurs/${tuteurId}`, { method: 'PATCH', token: getToken(), body })
}

/** Retire un tuteur de l'élève (refusé s'il s'agit du dernier). */
export function detachTuteur(eleveId, tuteurId) {
  return apiRequest(`/v1/eleves/${eleveId}/tuteurs/${tuteurId}/retirer`, { method: 'POST', token: getToken() })
}

/** Transfère l'élève dans une autre classe de la même année scolaire. */
export function changerClasse(inscriptionId, classeId, motif) {
  return apiRequest(`/v1/inscriptions-annuelles/${inscriptionId}/changer-classe`, { method: 'POST', token: getToken(), body: { classe_id: classeId, motif: motif || null } })
}

/* ---------- Recherche de tuteurs et frais d'inscription (Admin) ---------- */

/**
 * Tuteurs actifs dont le prénom, le nom ou le téléphone contient la recherche (20 au plus).
 * Chaque résultat : { id, prenom, nom, telephone, photo, enfants: string[], homonyme: boolean }.
 * excludeEleveId : écarte les tuteurs déjà rattachés à cet élève.
 */
export async function searchTuteurs(q, excludeEleveId) {
  const params = new URLSearchParams({ q })
  if (excludeEleveId) params.set('exclure_eleve_id', String(excludeEleveId))
  return (await apiRequest(`/v1/admin/tuteurs?${params}`, { token: getToken() })).data
}

/** Encaisse les frais d'inscription (montant fixé pour la classe) : renvoie le reçu. */
export function encaisserFrais(inscriptionId, modePaiement) {
  return apiRequest(`/v1/inscriptions-annuelles/${inscriptionId}/frais-inscription`, { method: 'POST', token: getToken(), body: { mode_paiement: modePaiement } })
}
