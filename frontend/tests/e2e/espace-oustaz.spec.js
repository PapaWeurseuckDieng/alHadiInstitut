import { test, expect } from '@playwright/test'

/*
 * Espace Oustaz : planning, appel, suivi coranique (fiche hebdomadaire) et exemplarité,
 * puis validation de la fiche par la direction.
 * Même API jetable que dashboard.spec.js. Ce fichier doit s'exécuter AVANT
 * inscription-depenses.spec.js, qui réinitialise le mot de passe de l'oustaz de test.
 */

const password = 'Browser!Secure2026'
const OUSTAZ = '770990002'
const CLASSE = 'Halaqa Al-Falah · Intermédiaire'

async function login(page, telephone, secret = password) {
  await page.goto('/login')
  await page.getByLabel('Numéro de téléphone').fill(telephone)
  await page.getByLabel('Mot de passe', { exact: true }).fill(secret)
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
  await expect(page).toHaveURL(/tableau-de-bord/)
}

const pad = n => String(n).padStart(2, '0')
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** Samedi qui ouvre la semaine de cours en cours (jeudi/vendredi → semaine qui vient de finir). */
function samediCourant() {
  const d = new Date()
  d.setDate(d.getDate() - ((d.getDay() + 1) % 7))
  return d
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

test('l’oustaz organise son planning et fait l’appel d’une séance', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await login(page, OUSTAZ)

  // Raccourcis de l'accueil vers l'espace pédagogique
  await expect(page.getByRole('region', { name: 'Actions rapides' }).getByRole('button', { name: /Appel/ })).toBeVisible()

  // Planning : séance du samedi
  await openSection(page, 'Planning')
  await page.getByLabel('Classe').selectOption({ label: CLASSE })
  await page.getByRole('button', { name: 'Ajouter une séance' }).click()
  let dialog = page.getByRole('dialog')
  await dialog.getByLabel('Jour').selectOption('samedi')
  await dialog.getByLabel('Activité').fill('Hifz')
  await dialog.getByLabel('Début').fill('08:00')
  await dialog.getByLabel('Fin', { exact: true }).fill('10:00')
  await dialog.getByRole('button', { name: 'Enregistrer la séance' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Séance ajoutée' })).toBeVisible()
  const samedi = page.getByRole('group', { name: 'Samedi' })
  await samedi.getByRole('button', { name: /Modifier la séance Hifz/ }).click()
  dialog = page.getByRole('dialog')
  await dialog.getByLabel('Activité').fill('Hifz et révision')
  await dialog.getByRole('button', { name: 'Enregistrer la séance' }).click()
  await expect(samedi.getByText('Hifz et révision')).toBeVisible()

  // Appel : jeudi = pas de cours
  await openSection(page, 'Appel')
  await page.getByLabel('Classe').selectOption({ label: CLASSE })
  const jeudi = samediCourant()
  jeudi.setDate(jeudi.getDate() - 2)
  await page.getByLabel('Date du cours').fill(iso(jeudi))
  await expect(page.getByText('Pas de cours ce jour-là')).toBeVisible()

  // Appel du samedi : tous présents sauf Mariama absente
  await page.getByLabel('Date du cours').fill(iso(samediCourant()))
  await expect(page.getByText('Awa Sarr', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Tous présents' }).click()
  await page.getByRole('group', { name: 'Présence de Mariama Diop' }).getByLabel('Absent').check()
  await expect(page.getByText('Absent : 1')).toBeVisible()
  await page.getByRole('button', { name: 'Enregistrer l’appel' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Présences enregistrées.' })).toBeVisible()

  // L'appel enregistré est rechargé
  await openSection(page, 'Planning')
  await openSection(page, 'Appel')
  await page.getByLabel('Classe').selectOption({ label: CLASSE })
  await page.getByLabel('Date du cours').fill(iso(samediCourant()))
  await expect(page.getByRole('group', { name: 'Présence de Mariama Diop' }).getByLabel('Absent')).toBeChecked()
  await expect(page.getByRole('group', { name: 'Présence de Awa Sarr' }).getByLabel('Présent')).toBeChecked()

  expect(errors).toEqual([])
})

test('l’oustaz remplit et valide sa fiche ; la direction consulte et rouvre sur demande', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await login(page, OUSTAZ)
  await openSection(page, 'Suivi coranique')
  await page.getByLabel('Classe').selectOption({ label: CLASSE })

  // Création : objectif Al-Mulk 1 → 10
  await page.getByRole('button', { name: 'Créer la fiche de Awa Sarr' }).click()
  let dialog = page.getByRole('dialog')
  await dialog.getByLabel('Sourate (Du)').selectOption({ label: '67. Al-Mulk' })
  await dialog.getByLabel('Verset (Du)').fill('1')
  await expect(dialog.getByLabel('Sourate (au)')).toHaveValue('67')
  await dialog.getByLabel('Verset (au)').fill('99')
  await dialog.getByRole('button', { name: 'Créer et remplir la fiche' }).click()
  await expect(dialog.getByText('Le verset dépasse le nombre de versets de la sourate.')).toBeVisible()
  await dialog.getByLabel('Verset (au)').fill('10')
  await dialog.getByRole('button', { name: 'Créer et remplir la fiche' }).click()

  // Fiche ouverte : samedi, nouvelle leçon (préremplie avec l'objectif) + récitation 3
  dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Fiche de Awa Sarr' })).toBeVisible()
  const firstDay = dialog.locator('.ped-fiche-day').first()
  await firstDay.getByLabel(/Nouvelle leçon/).check()
  await expect(firstDay.getByLabel('Verset (au)')).toHaveValue('10')
  await firstDay.getByRole('group', { name: 'Récitation' }).getByLabel('3', { exact: true }).check()
  await firstDay.getByRole('button', { name: /Enregistrer le Samedi/ }).click()
  await expect(firstDay.getByText('Enregistré')).toBeVisible()

  // Validation par l'oustaz (fenêtre de confirmation) : la fiche est figée
  await dialog.getByRole('button', { name: 'Valider la fiche' }).click()
  let confirmation = page.getByRole('dialog', { name: 'Valider la fiche de Awa Sarr ?' })
  await confirmation.getByRole('button', { name: 'Valider la fiche' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Fiche hebdomadaire validée.' })).toBeVisible()
  await expect(dialog.getByText(/Fiche validée : elle compte pour l’Élève du mois/)).toBeVisible()
  await expect(firstDay.getByLabel(/Nouvelle leçon/)).toBeDisabled()

  // Erreur repérée : l'oustaz demande une modification (motif facultatif)
  await dialog.getByRole('button', { name: 'Demander une modification' }).click()
  confirmation = page.getByRole('dialog', { name: 'Demander une modification ?' })
  await confirmation.getByLabel('Motif (facultatif)').fill('Erreur de verset')
  await confirmation.getByRole('button', { name: 'Demander une modification' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Demande de modification envoyée à l’administration.' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Fermer', exact: true }).click()
  await expect(page.getByRole('row').filter({ hasText: 'Awa Sarr' }).getByText('Modification demandée')).toBeVisible()

  // Direction : consultation seulement, puis réouverture de la fiche demandée
  await page.getByRole('button', { name: 'Se déconnecter' }).click()
  await login(page, '770990001')
  await openTab(page, 'Pédagogie', 'Suivi coranique')
  await page.getByLabel('Classe').selectOption({ label: `${CLASSE} · Ibrahima Diop` })
  await expect(page.getByRole('button', { name: /Créer la fiche/ })).toHaveCount(0)
  const requests = page.getByRole('region', { name: 'Demandes de modification (1)' })
  await expect(requests.getByText(/Erreur de verset/)).toBeVisible()
  await requests.getByRole('button', { name: 'Examiner la fiche de Awa Sarr' }).click()
  dialog = page.getByRole('dialog')
  await expect(dialog.getByText(/Modification demandée le/)).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Valider la fiche' })).toHaveCount(0)
  await expect(dialog.locator('.ped-fiche-day').first().getByLabel(/Nouvelle leçon/)).toBeDisabled()
  await dialog.getByRole('button', { name: 'Autoriser la modification' }).click()
  confirmation = page.getByRole('dialog', { name: 'Rouvrir la fiche de Awa Sarr ?' })
  await confirmation.getByRole('button', { name: 'Autoriser la modification' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Modification autorisée' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Fermer', exact: true }).click()
  await expect(page.getByRole('row').filter({ hasText: 'Awa Sarr' }).getByText('Brouillon')).toBeVisible()
  await expect(page.getByRole('region', { name: /Demandes de modification/ })).toHaveCount(0)

  // L'oustaz corrige et valide de nouveau
  await page.getByRole('button', { name: 'Se déconnecter' }).click()
  await login(page, OUSTAZ)
  await openSection(page, 'Suivi coranique')
  await page.getByLabel('Classe').selectOption({ label: CLASSE })
  await page.getByRole('button', { name: 'Ouvrir la fiche de Awa Sarr' }).click()
  dialog = page.getByRole('dialog')
  await expect(dialog.getByText(/Rouverte le/)).toBeVisible()
  await dialog.getByRole('button', { name: 'Valider la fiche' }).click()
  await page.getByRole('dialog', { name: 'Valider la fiche de Awa Sarr ?' }).getByRole('button', { name: 'Valider la fiche' }).click()
  await expect(dialog.getByText(/Fiche validée : elle compte/)).toBeVisible()
  await dialog.getByRole('button', { name: 'Fermer', exact: true }).click()
  await expect(page.getByRole('row').filter({ hasText: 'Awa Sarr' }).getByText('Validée')).toBeVisible()

  expect(errors).toEqual([])
})

test('l’oustaz note l’exemplarité du mois et retrouve ses notes', async ({ page }) => {
  await login(page, OUSTAZ)
  await openSection(page, 'Exemplarité')
  await page.getByLabel('Classe').selectOption({ label: CLASSE })

  const notes = { 'Assiduité et ponctualité': '4', 'Discipline et comportement': '3', 'Propreté et hygiène': '4', 'Camaraderie et respect': '2', 'Prières et dévotion': '3' }
  for (const [critere, note] of Object.entries(notes)) {
    await page.getByLabel(`${critere} de Awa Sarr`).selectOption(note)
  }
  // Total lisible : 16 / 20, barre à 80 sur 100 et niveau « Bien »
  const awa = page.getByRole('row').filter({ hasText: 'Awa Sarr' })
  await expect(awa.getByText('16 / 20')).toBeVisible()
  await expect(awa.getByRole('meter', { name: 'Exemplarité : 80 sur 100' })).toBeVisible()
  await expect(awa.getByText('Bien', { exact: true })).toBeVisible()

  // Ligne incomplète : signalée, rien n'est envoyé
  await page.getByLabel('Assiduité et ponctualité de Mariama Diop').selectOption('2')
  await page.getByRole('button', { name: 'Enregistrer (2)' }).click()
  await expect(page.getByText('Notez les cinq critères.')).toBeVisible()
  await page.getByLabel('Assiduité et ponctualité de Mariama Diop').selectOption('')

  // Il faut tout de même compléter Mariama ou annuler : on complète
  for (const critere of Object.keys(notes)) {
    await page.getByLabel(`${critere} de Mariama Diop`).selectOption('2')
  }
  await page.getByRole('button', { name: 'Enregistrer (2)' }).click()
  await expect(page.getByRole('status').filter({ hasText: '2 évaluation(s) enregistrée(s)' })).toBeVisible()

  // Rechargement : les notes sont conservées
  await openSection(page, 'Appel')
  await openSection(page, 'Exemplarité')
  await page.getByLabel('Classe').selectOption({ label: CLASSE })
  await expect(page.getByLabel('Discipline et comportement de Awa Sarr')).toHaveValue('3')
  await expect(page.getByLabel('Prières et dévotion de Mariama Diop')).toHaveValue('2')
})

test('la direction voit l’espace pédagogique de toutes les classes', async ({ page }) => {
  await login(page, '770990001')
  const nav = page.getByRole('navigation')
  await expect(nav.getByText('Pédagogie')).toBeVisible()
  await openTab(page, 'Pédagogie', 'Planning')
  await page.getByLabel('Classe').selectOption({ label: `${CLASSE} · Ibrahima Diop` })
  await expect(page.getByRole('group', { name: 'Samedi' }).getByText('Hifz et révision')).toBeVisible()
})
