import { test, expect } from '@playwright/test'

/*
 * Nouveautés de l'espace direction : inscription avec photo et paiement, photo et
 * réinitialisation du mot de passe d'un compte, rubrique Dépenses.
 * Même API jetable que dashboard.spec.js (voir setup.js) ; ce fichier s'exécute après lui.
 */

const password = 'Browser!Secure2026'

// Vraie image PNG 1×1 (le navigateur la convertit en JPEG avant l'envoi)
const photo = {
  name: 'eleve.png',
  mimeType: 'image/png',
  buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'),
}

async function login(page, telephone = '770990001', secret = password) {
  await page.goto('/login')
  await page.getByLabel('Numéro de téléphone').fill(telephone)
  await page.getByLabel('Mot de passe', { exact: true }).fill(secret)
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
  await expect(page).toHaveURL(/tableau-de-bord/)
}

/** Choisit un tuteur existant par la recherche (nom, prénom ou téléphone). */
async function chooseTuteur(scope, query, name) {
  await scope.getByLabel('Compte du tuteur').selectOption('existant')
  await scope.getByRole('combobox', { name: /Tuteur actif/ }).fill(query)
  await scope.getByRole('option', { name: new RegExp(name) }).click()
}

/** Ouvre le menu « ⋮ » d'une ligne puis choisit une action. */
async function rowAction(page, row, menuName, action) {
  await row.getByRole('button', { name: menuName }).click()
  await page.getByRole('menuitem', { name: action, exact: true }).click()
}

/** Mois courant en toutes lettres, comme affiché par l'interface (ex. « octobre 2026 »). */
function currentMonthLabel() {
  return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(new Date())
}

test('inscription avec photo, frais fixés et mensualité : reçus imprimables, élève à jour, reçus du tuteur', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await login(page)

  await page.getByRole('navigation').getByRole('button', { name: 'Élèves', exact: true }).click()
  await page.getByRole('button', { name: 'Inscrire un élève', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Prénom', { exact: false }).first().fill('PhotoPay')
  await dialog.getByLabel(/^Nom/).first().fill('TestBrowser')
  await dialog.getByLabel('Sexe *').first().selectOption('M')
  await dialog.getByLabel('Classe *').selectOption({ label: 'Halaqa Al-Furqan · Débutant' })
  await chooseTuteur(dialog, 'Aminata', 'Aminata Fall')

  // Photo : aperçu après réduction dans le navigateur
  await dialog.getByLabel('Choisir une image').setInputFiles(photo)
  await expect(dialog.getByRole('img', { name: 'Aperçu de la photo' })).toBeVisible()

  // Paiement : frais d'inscription de la classe (5 000, non modifiables) + mensualité du mois courant
  await expect(dialog.getByLabel('Frais d’inscription payés maintenant')).toBeChecked()
  await expect(dialog.getByRole('status', { name: 'Frais d’inscription' })).toHaveText(/5\s?000 FCFA/)
  const month = currentMonthLabel()
  await dialog.getByRole('group', { name: 'Mensualités payées' }).getByLabel(month, { exact: true }).check()
  await expect(dialog.getByLabel(`Montant pour ${month}`)).toHaveValue('10000')
  await expect(dialog.getByText(/Total encaissé :\s*15\s?000 FCFA/)).toBeVisible()

  await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click()

  // Étape « reçus » : la fenêtre reste ouverte avec le lien d'impression
  await expect(dialog.getByRole('heading', { name: 'Inscription et paiement enregistrés' })).toBeVisible()
  const receiptLink = dialog.getByRole('link', { name: 'Imprimer le reçu', exact: true })
  await expect(receiptLink).toHaveAttribute('href', /^\/recus\/\d+$/)
  const feesLink = dialog.getByRole('link', { name: 'Imprimer le reçu des frais' })
  await expect(feesLink).toHaveAttribute('href', /^\/recus\/inscription\/\d+$/)
  const feesHref = await feesLink.getAttribute('href')
  await dialog.getByRole('button', { name: 'Terminer' }).click()

  // L'élève apparaît dans la liste avec sa photo
  const row = page.getByRole('row').filter({ hasText: 'PhotoPay TestBrowser' })
  await expect(row).toBeVisible()
  await expect(row.locator('img')).toHaveAttribute('src', /\/storage\/photos\/eleves\//)

  // La rubrique Paiements le voit déjà à jour pour le mois courant
  await page.getByRole('navigation').getByRole('button', { name: 'Finances', exact: true }).click()
  await page.getByRole('tab', { name: 'Paiements' }).click()
  await page.getByLabel('Rechercher un élève par nom ou matricule').fill('PhotoPay')
  await page.getByRole('button', { name: 'Rechercher', exact: true }).click()
  await expect(page.getByRole('row').filter({ hasText: 'PhotoPay TestBrowser' }).getByText('Payé', { exact: true })).toBeVisible()

  // Reçu détaillé des frais d'inscription
  await page.goto(feesHref)
  await expect(page.getByRole('heading', { name: 'Reçu de paiement' })).toBeVisible()
  await expect(page.getByText(/^Frais d’inscription \d{4}-\d{4}$/)).toBeVisible()
  await expect(page.getByText(/^INS-\d{4}-\d{6}$/)).toBeVisible()

  // Le tuteur retrouve tous ses reçus dans son espace et ouvre le reçu détaillé
  await page.goto('/tableau-de-bord')
  await page.getByRole('button', { name: 'Se déconnecter' }).click()
  await login(page, '770990003')
  const recus = page.getByRole('region', { name: 'Mes reçus' })
  await expect(recus.getByRole('row').filter({ hasText: 'PhotoPay TestBrowser' })).toHaveCount(2)
  const tuteurFeesLink = recus.getByRole('row').filter({ hasText: /Frais d’inscription/ }).filter({ hasText: 'PhotoPay' }).getByRole('link')
  await expect(tuteurFeesLink).toHaveAttribute('href', feesHref)
  await page.goto(feesHref)
  await expect(page.getByText(/^INS-\d{4}-\d{6}$/)).toBeVisible()
  // Le tuteur n'a pas le bouton d'annulation
  await expect(page.getByRole('button', { name: 'Annuler ce reçu' })).toHaveCount(0)

  expect(errors).toEqual([])
})

test('un paiement refusé laisse le formulaire ouvert et n’inscrit pas l’élève', async ({ page }) => {
  await login(page)
  await page.getByRole('navigation').getByRole('button', { name: 'Élèves', exact: true }).click()
  await page.getByRole('button', { name: 'Inscrire un élève', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Prénom', { exact: false }).first().fill('Refuse')
  await dialog.getByLabel(/^Nom/).first().fill('TestBrowser')
  await dialog.getByLabel('Sexe *').first().selectOption('F')
  await dialog.getByLabel('Classe *').selectOption({ label: 'Halaqa Al-Furqan · Débutant' })
  await chooseTuteur(dialog, 'Fall', 'Aminata Fall')
  const month = currentMonthLabel()
  await dialog.getByRole('group', { name: 'Mensualités payées' }).getByLabel(month, { exact: true }).check()
  // Plus que la mensualité : refusé par le serveur
  await dialog.getByLabel(`Montant pour ${month}`).fill('99999')
  await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click()

  await expect(dialog.getByRole('alert')).toContainText('dépasse le reste à payer')
  await expect(dialog.getByLabel(`Montant pour ${month}`)).toHaveAttribute('aria-invalid', 'true')
  await dialog.getByRole('button', { name: 'Annuler' }).click()
  await page.getByLabel('Rechercher un élève par nom ou matricule').fill('Refuse')
  await page.getByRole('button', { name: 'Rechercher', exact: true }).click()
  await expect(page.getByText('Aucun résultat')).toBeVisible()
})

test('la direction change la photo d’un compte et réinitialise un mot de passe oublié', async ({ page }) => {
  await login(page)
  await page.getByRole('navigation').getByRole('button', { name: 'Comptes', exact: true }).click()
  const oustazRow = page.getByRole('row').filter({ hasText: 'Ibrahima Diop' })

  // Photo du compte (menu « ⋮ » de la ligne)
  await rowAction(page, oustazRow, 'Actions pour Ibrahima Diop', 'Changer la photo')
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Choisir une image').setInputFiles(photo)
  await dialog.getByRole('button', { name: 'Enregistrer la photo' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Photo enregistrée.' })).toBeVisible()
  await expect(oustazRow.locator('img')).toHaveAttribute('src', /\/storage\/photos\/comptes\//)

  // Réinitialisation : fenêtre de confirmation
  await rowAction(page, oustazRow, 'Actions pour Ibrahima Diop', 'Réinitialiser')
  const confirmation = page.getByRole('dialog', { name: 'Réinitialiser le mot de passe de Ibrahima Diop ?' })
  await expect(confirmation.getByText(/redeviendra « passer »/)).toBeVisible()
  await confirmation.getByRole('button', { name: 'Réinitialiser' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Mot de passe réinitialisé.' })).toContainText('passer')
  await expect(oustazRow.getByText('Mot de passe à changer')).toBeVisible()
  // Pas de réinitialisation ni d'archivage de son propre compte
  await page.getByRole('row').filter({ hasText: 'Mamadou Ndiaye' }).getByRole('button', { name: 'Actions pour Mamadou Ndiaye' }).click()
  await expect(page.getByRole('menuitem', { name: /Réinitialiser|Archiver/ })).toHaveCount(0)
  await page.keyboard.press('Escape')

  // L'oustaz se reconnecte avec « passer » : changement de mot de passe imposé
  await page.getByRole('button', { name: 'Se déconnecter' }).click()
  await login(page, '770990002', 'passer')
  await expect(page.getByText('Un dernier pas avant de commencer')).toBeVisible()
})

test('dépenses : saisie, validation, rejet motivé et indicateurs de la période', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await login(page)
  await page.getByRole('navigation').getByRole('button', { name: 'Finances', exact: true }).click()
  await page.getByRole('tab', { name: 'Dépenses' }).click()
  await expect(page.getByRole('tab', { name: 'Dépenses', selected: true })).toBeVisible()

  // Saisie : contrôle local puis enregistrement « en attente »
  await page.getByRole('button', { name: 'Nouvelle dépense' }).click()
  let dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Enregistrer la dépense' }).click()
  await expect(dialog.getByText('Choisissez une catégorie.')).toBeVisible()
  await dialog.getByLabel('Catégorie').selectOption('fournitures')
  await dialog.getByLabel('Montant (FCFA)').fill('25000')
  await dialog.getByLabel('Bénéficiaire').fill('Librairie Al-Maarif')
  await dialog.getByRole('button', { name: 'Enregistrer la dépense' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Dépense enregistrée.' })).toBeVisible()

  const row = page.getByRole('row').filter({ hasText: 'Librairie Al-Maarif' })
  await expect(row.getByText('En attente')).toBeVisible()

  // Correction tant qu'elle est en attente (menu « ⋮ »)
  await rowAction(page, row, /Actions pour la dépense/, 'Modifier')
  dialog = page.getByRole('dialog')
  await dialog.getByLabel('Montant (FCFA)').fill('30000')
  await dialog.getByRole('button', { name: 'Enregistrer la dépense' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Dépense modifiée.' })).toBeVisible()
  await expect(row.getByText(/30\s?000 FCFA/)).toBeVisible()

  // Validation (fenêtre de confirmation) : comptée dans les dépenses validées
  await rowAction(page, row, /Actions pour la dépense/, 'Valider')
  await page.getByRole('dialog', { name: 'Valider cette dépense ?' }).getByRole('button', { name: 'Valider' }).click()
  await expect(row.getByText('Validée')).toBeVisible()
  await expect(row.getByRole('button', { name: /Actions pour la dépense/ })).toHaveCount(0)
  await expect(page.getByLabel('Indicateurs de la période').getByText(/30\s?000 FCFA/).first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Dépenses validées par catégorie' })).toBeVisible()

  // Rejet : motif obligatoire
  await page.getByRole('button', { name: 'Nouvelle dépense' }).click()
  dialog = page.getByRole('dialog')
  await dialog.getByLabel('Catégorie').selectOption('autre')
  await dialog.getByLabel('Montant (FCFA)').fill('1000')
  await dialog.getByLabel('Description').fill('Saisie de test en double')
  await dialog.getByRole('button', { name: 'Enregistrer la dépense' }).click()
  const second = page.getByRole('row').filter({ hasText: 'Saisie de test en double' })
  await rowAction(page, second, /Actions pour la dépense/, 'Rejeter')
  dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Rejeter la dépense' }).click()
  await expect(dialog.getByText('Indiquez le motif du rejet (3 caractères minimum).')).toBeVisible()
  await dialog.getByLabel('Motif du rejet').fill('Doublon')
  await dialog.getByRole('button', { name: 'Rejeter la dépense' }).click()
  await expect(second.getByText('Rejetée')).toBeVisible()
  await expect(second.getByText('Motif : Doublon')).toBeVisible()

  // Filtre « En attente » : plus aucune dépense
  await page.getByRole('button', { name: 'En attente', exact: true }).click()
  await expect(page.getByText('Aucune dépense ne correspond à ces filtres.')).toBeVisible()

  expect(errors).toEqual([])
})
