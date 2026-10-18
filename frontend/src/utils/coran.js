/**
 * Référentiel des sourates (GET /v1/referentiels/sourates) :
 * { numero, nom, nom_arabe, nombre_versets }.
 */

/** Libellé d'une sourate selon la langue : « 67. Al-Mulk » ou « 67. الملك ». */
export function sourateLabel(sourate, lang) {
  return `${sourate.numero}. ${lang === 'ar' ? sourate.nom_arabe : sourate.nom}`
}

/**
 * Vérifie un passage : versets existants et fin après le début (mêmes règles que l'API).
 * @param {{ sourate_debut_id: number, verset_debut: number, sourate_fin_id: number, verset_fin: number }} range
 * @returns {string|null} clé de traduction de l'erreur (« ped.range.… »), ou null si le passage est valide
 */
export function rangeError(range, sourates) {
  const debut = sourates.find(s => s.numero === Number(range.sourate_debut_id))
  const fin = sourates.find(s => s.numero === Number(range.sourate_fin_id))
  const vDebut = Number(range.verset_debut)
  const vFin = Number(range.verset_fin)
  if (!debut || !fin || !vDebut || !vFin) return 'ped.range.incomplete'
  if (vDebut > debut.nombre_versets || vFin > fin.nombre_versets) return 'ped.range.verseTooHigh'
  if (debut.numero > fin.numero || (debut.numero === fin.numero && vDebut > vFin)) return 'ped.range.endBeforeStart'
  return null
}
