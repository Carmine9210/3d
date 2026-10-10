import { expect, test } from '@playwright/test';

// Non richiede dati: verifica routing i18n, home e protezione delle aree riservate.
test('home in italiano e in inglese', async ({ page }) => {
  await page.goto('/it');
  await expect(page.getByRole('heading', { level: 1 })).toContainText("Dall'idea all'oggetto");
  await page.goto('/en');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('From idea to object');
});

test('il selettore lingua cambia lingua e mantiene la pagina', async ({ page }) => {
  await page.goto('/it/terms');
  await page.getByRole('button', { name: 'EN' }).click();
  await expect(page).toHaveURL(/\/en\/terms/);
});

for (const area of ['seller', 'account', 'checkout']) {
  test(`/${area} rimanda al login se anonimo`, async ({ page }) => {
    await page.goto(`/it/${area}`);
    await expect(page).toHaveURL(/login/);
  });
}

test('il carrello è accessibile senza account (carrello ospite)', async ({ page }) => {
  await page.goto('/it/cart');
  await expect(page).toHaveURL(/\/cart/);
  await expect(page.getByRole('heading', { level: 1, name: 'Il tuo carrello' })).toBeVisible();
});

test('/admin non è accessibile da anonimo', async ({ page }) => {
  await page.goto('/it/admin');
  await expect(page).not.toHaveURL(/\/admin/);
});

test('pagina 404 gestita', async ({ page }) => {
  const res = await page.goto('/it/product/non-esiste-xyz');
  expect(res?.status()).toBe(404);
});

test('pagine legali con avviso segnaposto', async ({ page }) => {
  await page.goto('/it/prohibited');
  await expect(page.getByText('TODO-LEGAL')).toBeVisible();
});
