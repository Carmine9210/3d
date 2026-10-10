import { expect, test } from '@playwright/test';
import { DEMO, login } from './helpers';

// Richiede `npm run seed:demo`.
test('venditore: vede dashboard, prodotti (inclusa la bozza) e ordini', async ({ page }) => {
  await login(page, DEMO.seller);
  await page.goto('/it/seller');
  await expect(page.getByRole('heading', { level: 1, name: 'Demo Maker Lab' })).toBeVisible();
  await expect(page.getByText(/Pagamenti attivi/)).toBeVisible();
  await page.goto('/it/seller/products');
  await expect(page.getByText('Prodotto in bozza')).toBeVisible();
  await page.goto('/it/seller/orders');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('venditore: non entra nell’area admin', async ({ page }) => {
  await login(page, DEMO.seller);
  await page.goto('/it/admin');
  await expect(page).not.toHaveURL(/\/admin/);
});

test('admin: panoramica, moderazione, rimborsi, impostazioni, audit', async ({ page }) => {
  await login(page, DEMO.admin);
  for (const [path, heading] of [
    ['/it/admin', null],
    ['/it/admin/products', 'Prodotti'],
    ['/it/admin/sellers', 'Venditori'],
    ['/it/admin/refunds', 'Rimborsi'],
    ['/it/admin/settings', 'Impostazioni'],
    ['/it/admin/audit', 'Audit log'],
  ] as const) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(path));
    if (heading) await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
  }
});

test('admin: modifica una variabile di business e il valore resta', async ({ page }) => {
  await login(page, DEMO.admin);
  await page.goto('/it/admin/settings');
  const shipping = page.getByLabel('Spedizione fissa (€)');
  const original = await shipping.inputValue();
  await shipping.fill('5.50');
  await page.getByRole('button', { name: 'Salva' }).click();
  await expect(page.getByText('Modifiche salvate')).toBeVisible();
  await expect(page.getByLabel('Spedizione fissa (€)')).toHaveValue('5.5');
  await page.getByLabel('Spedizione fissa (€)').fill(original);
  await page.getByRole('button', { name: 'Salva' }).click();
});

test('venditore: statistiche e impostazioni shop', async ({ page }) => {
  await login(page, DEMO.seller);
  await page.goto('/it/seller/analytics');
  await expect(page.getByRole('heading', { level: 1, name: 'Statistiche' })).toBeVisible();
  await page.goto('/it/seller/settings');
  await expect(page.getByRole('heading', { level: 1, name: 'Impostazioni shop' })).toBeVisible();
  await expect(page.getByLabel('Nome dello shop')).toHaveValue('Demo Maker Lab');
});

test('cliente: profilo, export dati e conferma obbligatoria per eliminare', async ({ page }) => {
  await login(page, DEMO.customer);
  await page.goto('/it/account/profile');
  await expect(page.getByRole('heading', { level: 1, name: 'Modifica profilo' })).toBeVisible();
  const res = await page.request.get('/api/account/export');
  expect(res.status()).toBe(200);
  const data = await res.json();
  expect(data.account.email).toBe(DEMO.customer);
  expect(data).toHaveProperty('orders');

  // Email sbagliata: l'account NON deve essere eliminato.
  await page.getByLabel('Scrivi la tua email per confermare').fill('altra@email.it');
  await page.getByRole('button', { name: 'Elimina definitivamente' }).click();
  await expect(page.getByText("L'email inserita non coincide.")).toBeVisible();
});

test('l’export dati richiede il login', async ({ request }) => {
  const res = await request.get('/api/account/export');
  expect(res.status()).toBe(401);
});
