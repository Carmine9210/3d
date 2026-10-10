import { expect, test } from '@playwright/test';

// Richiede `npm run seed:demo`.
test('la home mostra i prodotti demo pubblicati ma non la bozza', async ({ page }) => {
  await page.goto('/it');
  await expect(page.getByRole('link', { name: /Vaso Spirale/ }).first()).toBeVisible();
  await expect(page.getByText('Prodotto in bozza')).toHaveCount(0);
});

test('ricerca testuale e conteggio risultati', async ({ page }) => {
  await page.goto('/it/search?q=vaso');
  await expect(page.getByText(/1 prodotto/)).toBeVisible();
  await expect(page.getByRole('link', { name: /Vaso Spirale/ })).toBeVisible();
});

test('la ricerca funziona anche sul titolo inglese', async ({ page }) => {
  await page.goto('/en/search?q=dragon');
  await expect(page.getByRole('link', { name: /Dragon Miniature/ })).toBeVisible();
});

test('filtro per prezzo massimo', async ({ page }) => {
  await page.goto('/it/search?max=10');
  await expect(page.getByRole('link', { name: /Clip di Ricambio/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Miniatura Drago/ })).toHaveCount(0);
});

test('filtro personalizzabile e materiale', async ({ page }) => {
  await page.goto('/it/search?custom=1');
  await expect(page.getByRole('link', { name: /Targa con Nome/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Vaso Spirale/ })).toHaveCount(0);
  await page.goto('/it/search?material=Resina');
  await expect(page.getByRole('link', { name: /Miniatura Drago/ })).toBeVisible();
});

test('pagina categoria e pagina shop', async ({ page }) => {
  await page.goto('/it/category/ricambi-componenti');
  await expect(page.getByRole('link', { name: /Clip di Ricambio/ })).toBeVisible();
  await page.goto('/it/shop/demo-maker-lab');
  await expect(page.getByRole('heading', { level: 1, name: 'Demo Maker Lab' })).toBeVisible();
});

test('scheda prodotto: titolo localizzato, JSON-LD e varianti esaurite disabilitate', async ({ page }) => {
  await page.goto('/en/product/demo-portachiavi');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Geometric Keyring');
  const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
  expect(JSON.parse(ld!)['@type']).toBe('Product');
});

test('un prodotto in bozza non è raggiungibile', async ({ page }) => {
  const res = await page.goto('/it/product/demo-bozza');
  expect(res?.status()).toBe(404);
});
