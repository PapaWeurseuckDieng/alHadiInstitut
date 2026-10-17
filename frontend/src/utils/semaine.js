/**
 * Dates de l'institut, en heure locale et au format AAAA-MM-JJ (comme l'API).
 * Les cours ont lieu du samedi au mercredi ; jeudi et vendredi sont libres.
 */

/** Jours de cours, dans l'ordre de la semaine de l'institut. */
export const JOURS = ['samedi', 'dimanche', 'lundi', 'mardi', 'mercredi']

// Jour JavaScript (0 = dimanche … 6 = samedi) → jour de cours
const PAR_NUMERO = { 6: 'samedi', 0: 'dimanche', 1: 'lundi', 2: 'mardi', 3: 'mercredi' }

const deux = n => String(n).padStart(2, '0')

/** Date → « AAAA-MM-JJ » (heure locale). */
export function iso(date) {
  return `${date.getFullYear()}-${deux(date.getMonth() + 1)}-${deux(date.getDate())}`
}

/** « AAAA-MM-JJ » → Date à midi (évite tout décalage de jour lié au fuseau). */
export function parseIso(valeur) {
  const [annee, mois, jour] = valeur.split('-').map(Number)
  return new Date(annee, mois - 1, jour, 12)
}

export function aujourdhui() {
  return iso(new Date())
}

export function ajouterJours(valeur, jours) {
  const date = parseIso(valeur)
  date.setDate(date.getDate() + jours)
  return iso(date)
}

/** Jour de cours d'une date (« samedi »…), ou null le jeudi et le vendredi. */
export function jourDeCours(valeur) {
  return PAR_NUMERO[parseIso(valeur).getDay()] ?? null
}

/** Samedi qui ouvre la semaine de cours d'une date (jeudi/vendredi → semaine qui vient de finir). */
export function samediDeLaSemaine(valeur) {
  const jour = parseIso(valeur).getDay()
  // samedi → 0, dimanche → 1, … vendredi → 6 jours depuis le samedi
  return ajouterJours(valeur, -((jour + 1) % 7))
}

/** Date du jour de cours dans la semaine qui commence au samedi donné. */
export function dateDuJour(samedi, jour) {
  return ajouterJours(samedi, JOURS.indexOf(jour))
}

/** Mois courant « AAAA-MM ». */
export function moisCourant() {
  return aujourdhui().slice(0, 7)
}

/** Mois précédent ou suivant : decaler('2026-01', -1) → '2025-12'. */
export function decalerMois(mois, decalage) {
  const [annee, numero] = mois.split('-').map(Number)
  const date = new Date(annee, numero - 1 + decalage, 1, 12)
  return `${date.getFullYear()}-${deux(date.getMonth() + 1)}`
}
