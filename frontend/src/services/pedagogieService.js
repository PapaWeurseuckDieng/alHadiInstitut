/**
 * Espace pédagogique (Oustaz et Admin) : classes, planning, appel, fiches hebdomadaires,
 * référentiel des sourates et exemplarité. Voir docs/GUIDE-PROJET.md § 3.9 à 3.11.
 */
import { apiRequest } from './apiClient'
import { getToken } from './authService'

const request = (path, options = {}) => apiRequest(path, { ...options, token: getToken() })

/* ---------- Classes ---------- */

/** Classes de l'année : toutes pour l'Admin, les siennes pour l'Oustaz. */
export async function getClasses() {
  return (await request('/v1/classes')).data
}

/** Tous les élèves actifs d'une classe (jusqu'à 200). */
export async function getClassStudents(classeId) {
  return (await request(`/v1/classes/${classeId}/eleves?per_page=200`)).data
}

/* ---------- Planning et appel ---------- */

/** Séances de la semaine, groupées par jour : { samedi: [...], dimanche: [...], ... } */
export async function getPlanning(classeId) {
  return (await request(`/v1/classes/${classeId}/planning`)).data.semaine
}

export function createSeance(classeId, body) {
  return request(`/v1/classes/${classeId}/planning`, { method: 'POST', body })
}

export function updateSeance(planningId, body) {
  return request(`/v1/plannings/${planningId}`, { method: 'PATCH', body })
}

/** Élèves de la séance et statut déjà saisi (null si pas encore fait) pour une date. */
export async function getPresences(planningId, dateCours) {
  return (await request(`/v1/plannings/${planningId}/presences?date_cours=${dateCours}`)).data
}

export function savePresences(planningId, dateCours, presences) {
  return request(`/v1/plannings/${planningId}/presences`, { method: 'PUT', body: { date_cours: dateCours, presences } })
}

/* ---------- Suivi coranique ---------- */

// Les 114 sourates ne changent jamais : un seul chargement par session
let souratesCache = null
export async function getSourates() {
  souratesCache ??= request('/v1/referentiels/sourates').then(response => response.data).catch(error => { souratesCache = null; throw error })
  return souratesCache
}

/** Fiches d'une semaine (samedi → mercredi). */
export async function getFichesSemaine(dateDebut, dateFin) {
  return (await request(`/v1/fiches-hebdomadaires?date_debut=${dateDebut}&date_fin=${dateFin}`)).data
}

/** (Admin) Fiches validées dont l'oustaz demande la réouverture. */
export async function getDemandesModification() {
  return (await request('/v1/fiches-hebdomadaires?demande_modification=1')).data
}

export async function getFiche(ficheId) {
  return (await request(`/v1/fiches-hebdomadaires/${ficheId}`)).data
}

export function createFiche(body) {
  return request('/v1/fiches-hebdomadaires', { method: 'POST', body })
}

export function updateFiche(ficheId, body) {
  return request(`/v1/fiches-hebdomadaires/${ficheId}`, { method: 'PATCH', body })
}

/** Saisie d'un jour : { reperes: { D, J, M }, qualite_recitation } */
export function saveFicheDay(ficheId, jour, body) {
  return request(`/v1/fiches-hebdomadaires/${ficheId}/jours/${jour}`, { method: 'PUT', body })
}

/** (Oustaz) Valide la fiche remplie : elle est figée et compte pour l'Élève du mois. */
export function validateFiche(ficheId) {
  return request(`/v1/fiches-hebdomadaires/${ficheId}/valider`, { method: 'POST' })
}

/** (Oustaz) Demande à l'administration de rouvrir une fiche validée. */
export function demanderModification(ficheId, motif) {
  return request(`/v1/fiches-hebdomadaires/${ficheId}/demander-modification`, { method: 'POST', body: { motif: motif || null } })
}

/** (Admin) Rouvre une fiche validée : elle repasse en brouillon pour l'oustaz. */
export function autoriserModification(ficheId) {
  return request(`/v1/fiches-hebdomadaires/${ficheId}/autoriser-modification`, { method: 'POST' })
}

/* ---------- Exemplarité ---------- */

export async function getExemplarite(classeId, mois) {
  return (await request(`/v1/classes/${classeId}/exemplarite?mois=${mois}`)).data
}

export function saveExemplarite(eleveId, body) {
  return request(`/v1/eleves/${eleveId}/exemplarite`, { method: 'POST', body })
}

/* ---------- Élève du mois (Admin) ---------- */

/** Classement du mois : { mois, gagnant, classement, non_classes, classes: [...], classe_exemplaire } */
export async function getEleveDuMois(mois) {
  return (await request(`/v1/admin/eleve-du-mois?mois=${mois}`)).data
}
