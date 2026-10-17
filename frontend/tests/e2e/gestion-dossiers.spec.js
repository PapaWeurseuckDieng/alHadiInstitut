import { test, expect } from '@playwright/test'

/*
 * Détail, modification et archivage (élève, compte, classe), synthèse d'un enfant
 * pour son tuteur et Élève du mois.
 * S'exécute après espace-oustaz.spec.js (fiche validée, appel et exemplarité d'Awa Sarr)
 * et avant inscription-depenses.spec.js (ordre alphabétique des fichiers).
 */

const password = 'Browser!Secure2026'

async function login(page, telephone = '770990001', secret = password) {
  await page.goto('/login')
  await page.getByLabel('Numéro de téléphone').fill(telephone)
  await page.getByLabel('Mot de passe', { exact: true }).fill(secret)
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
  await expect(page).toHaveURL(/tableau-de-bord/)
}

async function openSection(page, name) {
  await page.getByRole('navigation').getByRole('button', { name, exact: true }).click()
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible()
}

/** Admin : rubrique regroupée (Finances, Pédagogie) puis onglet. */
async function openTab(page, section, tab) {
  await page.getByRole('navigation').getByRole('button', { name: section, exact: true }).click()
  await page.getByRole('tab', { name: tab, exact: true }).click()
  await expect(page.getByRole('tab', { name: tab, exact: true, selected: true })).toBeVisible()
}

async function search(page, label, text) {
  await page.getByLabel(label).fill(text)
  await page.getByRole('button', { name: 'Rechercher', exact: true }).click()
}

test('fiche élève : consultation, modification puis archivage', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await login(page)
  await openSection(page, 'Élèves')
  await search(page, 'Rechercher un élève par nom ou matricule', 'Cheikh')
  await page.getByRole('button', { name: 'Voir le détail de Cheikh Mbaye' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Cheikh Mbaye' })).toBeVisible()
  await expect(dialog.getByText('Aminata Fall')).toBeVisible()
  await expect(dialog.getByText('2026-2027')).toBeVisible()

  // Modification
  await dialog.getByRole('button', { name: 'Modifier' }).click()
  await dialog.getByLabel('Adresse').fill('Thiès')
  await dialog.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(dialog.getByRole('status').filter({ hasText: 'Fiche élève modifiée.' })).toBeVisible()
  await expect(dialog.getByText('Thiès')).toBeVisible()

  // Archivage avec motif
  await dialog.getByRole('button', { name: 'Archiver' }).click()
  await expect(dialog.getByText(/disparaîtra des listes/)).toBeVisible()
  await dialog.getByLabel('Motif (facultatif)').fill('Départ de l’institut')
  await dialog.getByRole('button', { name: 'Archiver l’élève' }).click()
  await expect(dialog.getByRole('status').filter({ hasText: 'Élève archivé.' })).toBeVisible()
  await expect(dialog.getByText('Archivé', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Modifier' })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Fermer', exact: true }).click()

  // Masqué par défaut, visible avec « Afficher les archivés »
  await expect(page.getByText('Aucun résultat')).toBeVisible()
  await page.getByLabel('Afficher les archivés').check()
  await expect(page.getByRole('row').filter({ hasText: 'Cheikh Mbaye' }).getByText('Archivé')).toBeVisible()

  expect(errors).toEqual([])
})

test('fiche élève : affectation, changement de classe et gestion des tuteurs', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await login(page)
  await openSection(page, 'Élèves')
  await search(page, 'Rechercher un élève par nom ou matricule', 'Binta')
  await page.getByRole('button', { name: 'Voir le détail de Binta Kane' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Binta Kane' })).toBeVisible()

  // Inscription sans classe : affectation, puis transfert dans une autre classe
  await dialog.getByRole('button', { name: 'Affecter à une classe' }).click()
  await dialog.getByLabel('Nouvelle classe').selectOption({ label: 'Halaqa Al-Falah · Intermédiaire' })
  await dialog.getByRole('button', { name: 'Changer de classe' }).click()
  await expect(dialog.getByRole('status').filter({ hasText: 'Élève transféré dans la classe Halaqa Al-Falah.' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Changer de classe' }).click()
  await dialog.getByLabel('Nouvelle classe').selectOption({ label: 'Halaqa Al-Furqan · Débutant' })
  await dialog.getByLabel('Motif (facultatif)').fill('Niveau mieux adapté')
  await dialog.getByRole('button', { name: 'Changer de classe' }).last().click()
  await expect(dialog.getByRole('status').filter({ hasText: 'Halaqa Al-Furqan' })).toBeVisible()
  await expect(dialog.getByText(/Halaqa Al-Furqan/).first()).toBeVisible()

  // Rattacher un nouveau tuteur, le désigner payeur, retirer l'ancien
  await dialog.getByRole('button', { name: 'Rattacher un tuteur' }).click()
  await dialog.getByLabel('Compte du tuteur').selectOption('creer')
  await dialog.getByLabel('Prénom').fill('Ousmane')
  await dialog.getByLabel(/^Nom/).fill('Kane')
  await dialog.getByLabel('Téléphone').fill('770990099')
  await dialog.getByLabel('Sexe').selectOption('M')
  await dialog.getByLabel('Lien de parenté').fill('Père')
  await dialog.getByRole('button', { name: 'Rattacher le tuteur' }).click()
  await expect(dialog.getByRole('status').filter({ hasText: 'Tuteur créé et rattaché.' })).toBeVisible()
  await expect(dialog.getByText('Ousmane Kane · Père')).toBeVisible()

  await dialog.getByRole('button', { name: 'Désigner Ousmane Kane comme payeur' }).click()
  await expect(dialog.getByRole('status').filter({ hasText: 'Rattachement modifié.' })).toBeVisible()

  await dialog.getByRole('button', { name: 'Retirer Aminata Fall de cet élève' }).click()
  await page.getByRole('dialog', { name: 'Retirer Aminata Fall des tuteurs ?' }).getByRole('button', { name: 'Retirer', exact: true }).click()
  await expect(dialog.getByRole('status').filter({ hasText: 'Tuteur retiré de cet élève.' })).toBeVisible()
  await expect(dialog.getByText('Aminata Fall')).toHaveCount(0)
  // Dernier tuteur : plus de bouton « Retirer »
  await expect(dialog.getByRole('button', { name: /Retirer Ousmane Kane/ })).toHaveCount(0)

  expect(errors).toEqual([])
})

test('journal détaillé des rappels WhatsApp', async ({ page }) => {
  await login(page)
  await openTab(page, 'Finances', 'Paiements')
  await page.getByRole('button', { name: 'Envoyer les rappels' }).click()
  await page.getByRole('dialog', { name: /^Envoyer les rappels de/ }).getByRole('button', { name: 'Envoyer les rappels' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'rappel(s) envoyé(s)' })).toBeVisible()

  await page.getByRole('button', { name: 'Journal des rappels' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Journal des rappels WhatsApp' })).toBeVisible()
  await expect(dialog.getByText('Manuel · Mamadou Ndiaye').first()).toBeVisible()
  await expect(dialog.getByText('Simulé').first()).toBeVisible()
  await dialog.getByText('Voir le message envoyé').first().click()
  await expect(dialog.getByText(/L'Institut Al-Hadi vous rappelle/).first()).toBeVisible()
  // Filtre : aucun échec en mode simulation
  await dialog.getByRole('button', { name: /^Échec/ }).click()
  await expect(dialog.getByText('Aucun rappel avec ce statut.')).toBeVisible()
})

test('fiche compte : profession, archivage, pas d’archivage de son propre compte', async ({ page }) => {
  await login(page)
  await openSection(page, 'Comptes')

  // Tuteur : profession
  await page.getByRole('button', { name: 'Voir le détail de Aminata Fall' }).click()
  let dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Modifier' }).click()
  await dialog.getByLabel('Profession').fill('Commerçante')
  await dialog.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(dialog.getByRole('status').filter({ hasText: 'Compte modifié.' })).toBeVisible()
  await expect(dialog.getByText('Commerçante')).toBeVisible()
  await dialog.getByRole('button', { name: 'Fermer', exact: true }).click()

  // Archivage d'un autre compte
  await page.getByRole('button', { name: 'Voir le détail de Fatou Sarr' }).click()
  dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Archiver' }).click()
  await dialog.getByRole('button', { name: 'Archiver le compte' }).click()
  await expect(dialog.getByRole('status').filter({ hasText: 'Compte archivé.' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Fermer', exact: true }).click()
  await expect(page.getByRole('row').filter({ hasText: 'Fatou Sarr' })).toHaveCount(0)

  // Son propre compte : modifiable, mais pas archivable
  await page.getByRole('button', { name: 'Voir le détail de Mamadou Ndiaye' }).click()
  dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('button', { name: 'Modifier' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Archiver' })).toHaveCount(0)
})

test('fiche classe : élèves inscrits, ouverture de la fiche d’un élève et modification', async ({ page }) => {
  await login(page)
  await openSection(page, 'Classes')
  await page.getByRole('button', { name: 'Voir le détail de Halaqa Al-Baqarah' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Ibrahima Diop')).toBeVisible()
  await expect(dialog.getByText('Aliou Ba')).toBeVisible()

  // Un clic sur un élève ouvre sa fiche ; « Fermer » revient à la classe
  await dialog.getByRole('button', { name: 'Voir le détail de Aliou Ba' }).click()
  await expect(dialog.getByRole('heading', { name: 'Aliou Ba' })).toBeVisible()
  await expect(dialog.getByRole('heading', { name: 'Inscriptions' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Fermer', exact: true }).click()
  await expect(dialog.getByRole('heading', { name: 'Halaqa Al-Baqarah' })).toBeVisible()

  // Menu « ⋮ » de la liste : « Modifier » ouvre directement la modification
  await dialog.getByRole('button', { name: 'Fermer', exact: true }).click()
  await page.getByRole('button', { name: 'Actions pour Halaqa Al-Baqarah' }).click()
  await page.getByRole('menuitem', { name: 'Modifier' }).click()
  await expect(dialog.getByLabel('Frais d’inscription')).toBeVisible()
  await dialog.getByLabel('Frais d’inscription').fill('7500')
  await dialog.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(dialog.getByRole('status').filter({ hasText: 'Classe modifiée.' })).toBeVisible()
  await expect(dialog.getByText(/7\s?500 FCFA/)).toBeVisible()

  await dialog.getByRole('button', { name: 'Modifier' }).click()
  await expect(dialog.getByLabel('Oustaz responsable')).toHaveValue(/\d+/)
  await dialog.getByLabel('Niveau').fill('Avancé 2')
  await dialog.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(dialog.getByRole('status').filter({ hasText: 'Classe modifiée.' })).toBeVisible()
  await expect(dialog.getByText(/Avancé 2/)).toBeVisible()
})

test('le tuteur consulte la progression de son enfant', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await login(page, '770990003')
  await page.getByRole('button', { name: 'Voir la progression de Awa Sarr' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Progression de Awa Sarr' })).toBeVisible()
  // Données saisies par l'oustaz (espace-oustaz.spec.js) : récitation 3/4, présente, exemplarité, fiche validée
  await expect(dialog.getByText('15 / 20')).toBeVisible()
  await expect(dialog.getByText('100 %')).toBeVisible()
  await expect(dialog.getByRole('region', { name: 'Comportement du mois' }).getByText('3/4').first()).toBeVisible()
  await expect(dialog.getByText('Validée')).toBeVisible()
  await expect(dialog.getByText(/D Al-Mulk 1 → 10/)).toBeVisible()

  expect(errors).toEqual([])
})

test('la direction consulte l’Élève du mois par classe et la classe exemplaire', async ({ page }) => {
  await login(page)
  await openTab(page, 'Pédagogie', 'Élève du mois')
  // Awa Sarr est classée (ou, si sa fiche date du mois précédent, listée parmi les non classés)
  await expect(page.getByText('Awa Sarr').first()).toBeVisible()
  await expect(page.getByText('Score = 50 % exemplarité + 30 % objectifs (fiches validées) + 20 % récitation.')).toBeVisible()
  // Affichage par classe (par défaut) puis classement général
  await expect(page.getByRole('tab', { name: 'Par classe', selected: true })).toBeVisible()
  await page.getByRole('tab', { name: 'Classement général' }).click()
  await expect(page.getByRole('tab', { name: 'Classement général', selected: true })).toBeVisible()
  // Quand des élèves sont classés : meilleur des meilleurs et classe exemplaire, dont on ouvre la fiche
  const best = page.getByRole('region', { name: /Halaqa/ }).filter({ hasText: 'Classe exemplaire' })
  if (await best.count()) {
    await expect(page.getByText('Meilleur des meilleurs')).toBeVisible()
    await best.getByRole('button', { name: 'Voir la classe' }).click()
    await expect(page.getByRole('dialog').getByRole('heading', { name: 'Élèves de la classe' })).toBeVisible()
  }
})

test('diplômes : délivrance depuis la fiche élève, liste, annulation et consultation par le tuteur', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await login(page)
  await openSection(page, 'Élèves')
  await search(page, 'Rechercher un élève par nom ou matricule', 'Awa')
  await page.getByRole('button', { name: 'Voir le détail de Awa Sarr' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Délivrer un diplôme' }).click()
  await dialog.getByLabel('Type de diplôme').selectOption('hifz_partiel')
  await dialog.getByLabel('Mention').selectOption('tres_bien')
  await dialog.getByRole('button', { name: 'Délivrer le diplôme' }).click()
  await expect(dialog.getByRole('status').filter({ hasText: 'Diplôme délivré.' })).toBeVisible()
  const print = dialog.getByRole('link', { name: /^Imprimer le diplôme DIP-/ })
  await expect(print).toHaveAttribute('href', /^\/diplomes\/\d+$/)
  const href = await print.getAttribute('href')
  await expect(dialog.getByText('Attestation de mémorisation partielle du Coran')).toBeVisible()
  await dialog.getByRole('button', { name: 'Fermer', exact: true }).click()

  // Rubrique Diplômes : la ligne apparaît ; un second diplôme est annulé avec un motif
  await openTab(page, 'Pédagogie', 'Diplômes')
  await expect(page.getByRole('row').filter({ hasText: 'Awa Sarr' }).getByText('Très bien')).toBeVisible()
  await page.getByRole('button', { name: 'Délivrer un diplôme' }).click()
  const deliver = page.getByRole('dialog')
  await deliver.getByLabel('Élève').fill('Omar')
  await deliver.getByRole('button', { name: /Omar Gueye/ }).click()
  await deliver.getByLabel('Type de diplôme').selectOption('tajwid')
  await deliver.getByRole('button', { name: 'Délivrer le diplôme' }).click()
  await expect(deliver.getByRole('heading', { name: 'Diplôme délivré' })).toBeVisible()
  await deliver.getByRole('button', { name: 'Terminer' }).click()
  const omar = page.getByRole('row').filter({ hasText: 'Omar Gueye' })
  await omar.getByRole('button', { name: /^Actions pour DIP-/ }).click()
  await page.getByRole('menuitem', { name: 'Annuler le diplôme' }).click()
  const confirmation = page.getByRole('dialog', { name: /^Annuler le diplôme DIP-/ })
  await expect(confirmation.getByRole('button', { name: 'Annuler le diplôme' })).toBeDisabled()
  await confirmation.getByLabel('Motif de l’annulation').fill('Erreur de saisie')
  await confirmation.getByRole('button', { name: 'Annuler le diplôme' }).click()
  await expect(omar.getByText('Annulé')).toBeVisible()

  // Diplôme imprimable
  await page.goto(href)
  await expect(page.getByRole('heading', { name: 'Attestation de mémorisation partielle du Coran' })).toBeVisible()
  await expect(page.getByText('Awa Sarr')).toBeVisible()
  await expect(page.getByText('Très bien')).toBeVisible()

  // Le tuteur retrouve le diplôme de son enfant
  await page.goto('/tableau-de-bord')
  await page.getByRole('button', { name: 'Se déconnecter' }).click()
  await login(page, '770990003')
  await expect(page.getByRole('link', { name: 'Imprimer le diplôme « Attestation de mémorisation partielle du Coran »' })).toHaveAttribute('href', href)

  expect(errors).toEqual([])
})
