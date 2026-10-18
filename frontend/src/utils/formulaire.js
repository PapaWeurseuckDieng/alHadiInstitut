/**
 * Champs réellement modifiés d'un formulaire de modification (PATCH partiel).
 * N'envoyer que ces champs évite de bloquer une correction simple sur une donnée
 * ancienne incomplète (ex. un dossier sans sexe renseigné, devenu obligatoire).
 *
 * @param {Record<string, string>} values  valeurs du formulaire
 * @param {Record<string, string>} initial valeurs au moment d'ouvrir le formulaire
 * @returns {Record<string, string|null>} champs modifiés ; une valeur vidée devient null
 */
export function champsModifies(values, initial) {
  return Object.fromEntries(
    Object.entries(values)
      .filter(([key, value]) => value !== initial[key])
      .map(([key, value]) => [key, typeof value === 'string' && value.trim() === '' ? null : value]),
  )
}
