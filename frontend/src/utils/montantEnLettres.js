/**
 * Écrit un montant entier en toutes lettres, en français (reçus de paiement).
 * Règles traditionnelles : « vingt et un », « quatre-vingts », « deux cents », « mille » invariable.
 *
 * @example montantEnLettres(15000)  // « quinze mille »
 * @example montantEnLettres(281)    // « deux cent quatre-vingt-un »
 * @param {number} montant  Entier positif (FCFA : pas de centimes)
 * @returns {string}
 */
export function montantEnLettres(montant) {
  const n = Math.floor(Math.abs(Number(montant) || 0))
  if (n === 0) return 'zéro'

  const parties = []
  // Milliards, millions, milliers, puis le reste (0-999)
  const echelles = [
    [1e9, 'milliard'],
    [1e6, 'million'],
    [1e3, 'mille'],
  ]
  let reste = n
  for (const [valeur, nom] of echelles) {
    const quantite = Math.floor(reste / valeur)
    reste %= valeur
    if (quantite === 0) continue
    if (nom === 'mille') {
      // « mille » est invariable et ne prend pas « un » devant ; « cent » reste sans « s » devant « mille »
      parties.push(quantite === 1 ? 'mille' : `${centaines(quantite, false)} mille`)
    } else {
      parties.push(`${centaines(quantite, true)} ${nom}${quantite > 1 ? 's' : ''}`)
    }
  }
  if (reste > 0) parties.push(centaines(reste, true))

  return parties.join(' ')
}

// Nombres de 0 à 16, puis dizaines
const UNITES = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize']
const DIZAINES = ['', 'dix', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante']

/** 0 à 99. */
function dizaines(n) {
  if (n <= 16) return UNITES[n]
  if (n < 20) return `dix-${UNITES[n - 10]}`
  if (n < 70) {
    const d = Math.floor(n / 10)
    const u = n % 10
    if (u === 0) return DIZAINES[d]
    return u === 1 ? `${DIZAINES[d]} et un` : `${DIZAINES[d]}-${UNITES[u]}`
  }
  if (n < 80) {
    // 70-79 : soixante-dix, soixante et onze, soixante-douze...
    return n === 71 ? 'soixante et onze' : `soixante-${dizaines(n - 60)}`
  }
  // 80-99 : quatre-vingts, quatre-vingt-un, quatre-vingt-dix...
  return n === 80 ? 'quatre-vingts' : `quatre-vingt-${dizaines(n - 80)}`
}

/**
 * 1 à 999.
 * @param {boolean} final  true si rien ne suit (« deux cents ») ; false devant « mille » (« deux cent mille »)
 */
function centaines(n, final) {
  const c = Math.floor(n / 100)
  const r = n % 100
  let texte = ''
  if (c > 0) {
    texte = c === 1 ? 'cent' : `${UNITES[c]} cent${r === 0 && final ? 's' : ''}`
  }
  if (r > 0) {
    let fin = dizaines(r)
    // « quatre-vingts » perd son « s » devant « mille »
    if (!final && r === 80) fin = 'quatre-vingt'
    texte = texte ? `${texte} ${fin}` : fin
  }
  return texte
}
