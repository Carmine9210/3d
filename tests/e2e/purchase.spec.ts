import { expect, test } from '@playwright/test';
import { DEMO, login } from './helpers';

// Richiede `npm run seed:demo`. Il pagamento reale su Stripe non viene eseguito:
// si verifica tutto fino alla creazione dell'ordine "in attesa di pagamento".
test.describe.configure({ mode: 'serial' });

test('cliente: aggiunge al carrello, inserisce indirizzo, ottiene ordine da pagare', async ({ page }) => {
  await login(page, DEMO.customer);

  await page.goto('/it/product/demo-supporto-cuffie');
  await page.getByRole('button', { name: 'Aggiungi al carrello' }).click();
  await expect(page.getByText('Aggiunto al carrello')).toBeVisible();

  await page.goto('/it/cart');
  await expect(page.getByText('Supporto per Cuffie')).toBeVisible();
  await expect(page.getByText(/Da Demo Maker Lab/)).toBeVisible();
  await page.getByRole('link', { name: 'Vai al checkout' }).click();

  await page.getByLabel('Nome e cognome').fill('Mario Rossi');
  await page.getByLabel('Indirizzo', { exact: true }).fill('Via Roma 1');
  await page.getByLabel('Città').fill('Bari');
  await page.getByLabel('CAP').fill('70121');
  await page.getByRole('button', { name: 'Conferma e vai al pagamento' }).click();

  await expect(page).toHaveURL(/checkout\/pay/);
  await expect(page.getByText('Demo Maker Lab')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Paga ora' })).toBeVisible();
});

test('cliente: la quantità non può superare lo stock', async ({ page }) => {
  await login(page, DEMO.customer);
  await page.goto('/it/product/demo-miniatura-drago'); // stock 3
  await page.getByLabel('Quantità').fill('50');
  await page.getByRole('button', { name: 'Aggiungi al carrello' }).click();
  await expect(page.getByText('Aggiunto al carrello')).toBeVisible(); // attende la fine della Server Action
  await page.goto('/it/cart');
  const row = page.getByRole('listitem').filter({ hasText: 'Miniatura Drago' });
  await expect(row.getByLabel('Quantità')).toHaveValue('3');
});

test('cliente: non accede a venditore e admin', async ({ page }) => {
  await login(page, DEMO.customer);
  await page.goto('/it/admin');
  await expect(page).not.toHaveURL(/\/admin/);
  await page.goto('/it/seller');
  await expect(page).toHaveURL(/seller\/onboarding/);
});
