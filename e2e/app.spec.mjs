import { test, expect } from '@playwright/test';

const errors = new WeakMap();
test.beforeEach(async ({ page }) => {
  errors.set(page, []);
  page.on('pageerror', error => errors.get(page).push(error.message));
  // The app itself and all API calls are real; only decorative third-party assets
  // are blocked to keep these tests independent of external networks.
  await page.route(/^https:\/\/(fonts\.|media\.api-sports)/, route => route.abort());
});
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); });

async function register(page, username) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Connexion', exact: true }).click();
  await page.getByRole('button', { name: 'Créer un compte', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Identifiant').fill(username);
  await dialog.getByLabel('Mot de passe').fill('secret12345');
  await dialog.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(dialog).not.toBeVisible();
}
async function navigate(page, label) {
  const nav = page.viewportSize().width < 721 ? page.locator('.mobile-nav') : page.locator('.desktop-nav');
  await nav.getByRole('button', { name: label, exact: true }).click();
}

test('all eight competitions and calendar are accessible without horizontal overflow', async ({ page }) => {
  await page.goto('/');
  const picker = page.getByRole('region', { name: 'Choisir une compétition' });
  await expect(picker.locator('.competition-tile')).toHaveCount(8);
  for (const name of ['Premier League','La Liga','Serie A','Bundesliga','Ligue 1','Champions League','Europa League','Conference League']) {
    await expect(picker.getByRole('button', { name: new RegExp(name) })).toBeVisible();
  }
  await page.getByRole('button', { name: /TOUT VOIR.*7 jours/ }).click();
  await expect(page.locator('.match-card')).toHaveCount(3);
  await picker.getByRole('button', { name: /Europa League/ }).click();
  await expect(page.getByRole('heading', { name: /Aucun match de Europa League/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('register, combine two matches, persist history, logout and log back in', async ({ page }, info) => {
  const username = `combo_${info.project.name}_${Date.now()}`;
  await register(page, username);
  await page.getByRole('button', { name: /TOUT VOIR.*7 jours/ }).click();
  const cards = page.locator('.match-card');
  await cards.nth(0).locator('.compact-odds button').first().click();
  await cards.nth(1).locator('.compact-odds button').first().click();
  const slip = page.locator('.bet-slip');
  await expect(slip.locator('.selection')).toHaveCount(2);
  await expect(slip.locator('.total-line strong')).toHaveText('4.41');
  await slip.getByRole('button', { name: 'Valider mon combiné' }).click();
  await expect(page.getByRole('heading', { name: 'Historique des coupons' })).toBeVisible();
  await expect(page.locator('.balance-card strong')).toContainText('990');
  await page.reload();
  await navigate(page, 'Mes paris');
  await expect(page.getByRole('heading', { name: /Combiné #/ })).toBeVisible();
  if (info.project.name === 'mobile') await navigate(page, 'Profil');
  else await page.locator('.header-actions').getByRole('button', { name: username }).click();
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page.getByRole('button', { name: 'Connexion', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Connexion', exact: true }).click();
  await page.getByLabel('Identifiant').fill(username);
  await page.getByLabel('Mot de passe').fill('secret12345');
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await navigate(page, 'Mes paris');
  await expect(page.locator('.balance-card strong')).toContainText('990');
  await page.screenshot({ path: `test-results/${info.project.name}-wallet.png`, fullPage: true });
});

test('create a friend competition, add a member, bet from group budget and settle', async ({ page, request }, info) => {
  const username = `owner_${info.project.name}_${Date.now()}`;
  const friend = `friend_${Date.now()}`;
  expect((await request.post('/api/register', { data: { username: friend, password: 'secret12345' } })).ok()).toBe(true);
  await register(page, username);
  await navigate(page, 'Amis');
  await page.getByLabel('Nom du groupe').fill('La compétition de test');
  await page.getByLabel('Budget de départ par personne').fill('500');
  await page.getByRole('button', { name: 'Créer le groupe', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'La compétition de test' })).toBeVisible();
  await page.getByLabel('Ajouter un ami déjà inscrit').fill(friend);
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await expect(page.locator('.friends-ranking li')).toHaveCount(2);
  await page.getByRole('button', { name: /Parier dans ce groupe/ }).click();
  await page.locator('.match-card').first().locator('.compact-odds button').first().click();
  const slip = page.locator('.bet-slip');
  await slip.getByRole('button', { name: 'Simple', exact: true }).click();
  await slip.getByRole('button', { name: 'Valider mon pari simple' }).click();
  await expect(page.locator('.friend-ticket')).toHaveCount(1);
  await page.locator('.friend-settlement select').selectOption('won');
  await page.getByRole('button', { name: 'Valider le résultat' }).click();
  await expect(page.locator('.friend-ticket')).toContainText('Gagné');
  await expect(page.locator('.friends-ranking li').first()).toContainText('511');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: `test-results/${info.project.name}-friends.png`, fullPage: true });
});
