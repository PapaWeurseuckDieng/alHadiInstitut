/**
 * Traduction de l'interface (sans dépendance externe).
 *
 * - Français par défaut, arabe disponible (écrit de droite à gauche).
 * - Le choix est mémorisé dans le navigateur (localStorage).
 * - Les attributs lang et dir de <html> suivent la langue, ce qui
 *   retourne automatiquement la mise en page en arabe.
 *
 * Dans un composant : utiliser le hook useI18n() (voir useI18n.js).
 * Hors composant (services) : utiliser translate().
 *
 * Ajouter une langue : créer son dictionnaire (copie de fr.js) et
 * l'ajouter à LANGUAGES ci-dessous.
 */
import fr from './fr'
import ar from './ar'
import { SERVER_MESSAGES_AR, SERVER_PATTERNS_AR } from './serverMessages'

// Langues disponibles : libellé (dans sa propre langue), sens d'écriture et format des dates/nombres
export const LANGUAGES = {
  fr: { code: 'fr', label: 'Français', short: 'FR', dir: 'ltr', locale: 'fr-FR', messages: fr },
  // nu-latn : chiffres 0-9 conservés en arabe (téléphones, matricules, années identiques partout)
  ar: { code: 'ar', label: 'العربية', short: 'ع', dir: 'rtl', locale: 'ar-u-nu-latn', messages: ar },
}

export const DEFAULT_LANGUAGE = 'fr'

const STORAGE_KEY = 'alhadi.langue'

// Fonctions à prévenir quand la langue change (composants abonnés via useI18n)
const listeners = new Set()

/** Langue mémorisée, ou français si rien n'est enregistré (ou valeur inconnue). */
function readStoredLanguage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return LANGUAGES[stored] ? stored : DEFAULT_LANGUAGE
  } catch {
    return DEFAULT_LANGUAGE
  }
}

let currentLanguage = readStoredLanguage()

/** Met à jour <html lang="…" dir="…"> selon la langue courante. */
function applyToDocument() {
  if (typeof document === 'undefined') return
  document.documentElement.lang = currentLanguage
  document.documentElement.dir = LANGUAGES[currentLanguage].dir
}

applyToDocument()

/** @returns {string} Code de la langue courante (« fr » ou « ar »). */
export function getLanguage() {
  return currentLanguage
}

/**
 * Change la langue de toute l'application.
 * @param {string} code  « fr » ou « ar »
 */
export function setLanguage(code) {
  if (!LANGUAGES[code] || code === currentLanguage) return
  currentLanguage = code
  try {
    localStorage.setItem(STORAGE_KEY, code)
  } catch {
    // Stockage indisponible : la langue reste valable jusqu'au rechargement.
  }
  applyToDocument()
  listeners.forEach((listener) => listener())
}

/**
 * Abonne une fonction aux changements de langue.
 * @returns {() => void} Fonction de désabonnement
 */
export function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Lit une clé du type « dash.sections.eleves » dans un dictionnaire. */
function lookup(messages, key) {
  return key.split('.').reduce((node, part) => (node == null ? undefined : node[part]), messages)
}

/**
 * Traduit une clé, en remplaçant les {paramètres}.
 * Si la clé manque dans la langue choisie, le texte français est utilisé.
 *
 * @example translate('dash.year.hint', { year: '2026-2027' }) // « Année 2026-2027 »
 * @param {string} key
 * @param {Record<string, string|number>} [params]
 * @param {string} [lang]  Langue forcée (par défaut : langue courante)
 * @returns {string}
 */
export function translate(key, params = {}, lang = currentLanguage) {
  const value = lookup(LANGUAGES[lang].messages, key) ?? lookup(LANGUAGES[DEFAULT_LANGUAGE].messages, key)
  if (typeof value !== 'string') return key
  return value.replace(/\{(\w+)\}/g, (match, name) => (params[name] ?? match).toString())
}

// Message générique en arabe, selon le code HTTP, quand un message serveur n'est pas connu
const STATUS_KEYS = { 401: 'errors.unauthorized', 403: 'errors.forbidden', 404: 'errors.notFound', 422: 'errors.validation', 429: 'errors.throttle' }

/**
 * Traduit un message renvoyé par le backend Laravel (qui répond en français).
 *
 * - En français : le message est affiché tel quel.
 * - En arabe : traduction des messages connus du backend ; si le serveur
 *   répond déjà en arabe, le message est gardé ; sinon :
 *     fallback « status »   -> message générique selon le code HTTP (titres d'erreur)
 *     fallback « original » -> message d'origine conservé (détail d'un champ)
 *
 * @param {string} message
 * @param {number} [status]
 * @param {{ fallback?: 'status' | 'original', lang?: string }} [options]
 */
export function translateServerMessage(message, status, { fallback = 'status', lang = currentLanguage } = {}) {
  if (lang === DEFAULT_LANGUAGE || !message) return message
  if (/[؀-ۿ]/.test(message)) return message

  const known = SERVER_MESSAGES_AR[message.trim()]
  if (known) return known

  for (const [pattern, replacement] of SERVER_PATTERNS_AR) {
    if (pattern.test(message)) return message.replace(pattern, replacement)
  }

  if (fallback === 'original') return message
  return translate(STATUS_KEYS[status] || 'errors.generic', {}, lang)
}
