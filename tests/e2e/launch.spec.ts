import { expect, test } from '@playwright/test';
import { DEMO, adminDb, login, sendStripeEvent } from './helpers';

// Richiede `npm run seed:demo`. Step 8: codici sconto, ferie, CSV, duplicazione, annullo ordine, health.
test.describe.configure({ mode: 'serial' });
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const CODE = 'E2ETEST15';

async function demoStore() {
  const { data } = await adminDb().from('stores').select('id').eq('slug', 'demo-maker-lab').single();
  return data!.id as string;
}
async function emptyCustomerCart() {
  const db = adminDb();
  const { data } = await db.from('profiles').select('user_id').eq('display_name', 'Cliente Demo').single();
  await db.from('cart_items').delete().eq('user_id', data!.user_id);
}

test.beforeAll(async () => {
  const db = adminDb();
  await db.from('coupons').delete().eq('code', CODE);
  await db.from('stores').update({ vacation_mode: false }).eq('slug', 'demo-maker-lab');
});
test.afterAll(async () => {
  const db = adminDb();
  await db.from('stores').update({ vacation_mode: false, vacation_message: null }).eq('slug', 'demo-maker-lab');
  await db.from('products').delete().like('title_it', '%(copia)%');
});

test('health check', async () => {
  const res = await fetch(`${BASE}/api/health`);
  expect(res.status).toBe(200);
  expect((await res.json()).db).toBe('ok');
});

test('venditore crea un codice sconto', async ({ page }) => {
  await login(page, DEMO.seller);
  await page.goto('/it/seller/coupons');
  await page.getByLabel('Codice', { exact: true }).fill(CODE.toLowerCase());
  await page.getByLabel('Sconto', { exact: true }).fill('15');
  await page.getByRole('button', { name: 'Crea codice' }).click();
  await expect(page.getByText('Modifiche salvate.')).toBeVisible();
  const row = page.getByRole('listitem').filter({ hasText: CODE });
  await expect(row.getByText('−15%')).toBeVisible();
  await expect(row.getByText('Attivo')).toBeVisible();
  // stesso codice due volte → errore chiaro
  await page.getByLabel('Codice', { exact: true }).fill(CODE);
  await page.getByLabel('Sconto', { exact: true }).fill('5');
  await page.getByRole('button', { name: 'Crea codice' }).click();
  await expect(page.getByText('Hai già un codice con questo nome.')).toBeVisible();
});

test('cliente applica il codice: sconto nel riepilogo, nell’ordine e conteggiato al pagamento', async ({ page }) => {
  await emptyCustomerCart();
  await login(page, DEMO.customer);
  await page.goto('/it/product/demo-vaso-spirale'); // 18,90 €
  await page.getByRole('button', { name: 'Aggiungi al carrello' }).click();
  await expect(page.getByText('Aggiunto al carrello')).toBeVisible();
  await page.goto('/it/checkout');

  await page.getByLabel('Codice sconto').fill('SBAGLIATO');
  await page.getByRole('button', { name: 'Applica' }).click();
  await expect(page.getByText('Codice sconto non valido')).toBeVisible();

  await page.getByLabel('Codice sconto').fill(CODE.toLowerCase());
  await page.getByRole('button', { name: 'Applica' }).click();
  await expect(page.getByText(`Sconto ${CODE}`)).toBeVisible();
  await expect(page.getByText('−2,84 €')).toBeVisible(); // 15% di 18,90 arrotondato

  await page.getByLabel('Nome e cognome').fill('Mario Rossi');
  await page.getByLabel('Indirizzo', { exact: true }).fill('Via Roma 1');
  await page.getByLabel('Città').fill('Bari');
  await page.getByLabel('CAP').fill('70121');
  await page.getByRole('button', { name: 'Conferma e vai al pagamento' }).click();
  await expect(page).toHaveURL(/checkout\/pay/);

  const db = adminDb();
  const { data: order } = await db
    .from('orders')
    .select('id, subtotal_cents, discount_cents, shipping_cents, platform_fee_cents, total_cents, coupon_code')
    .eq('status', 'pending_payment')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  // La spedizione si legge dalle impostazioni (un altro test la modifica da /admin/settings).
  const { data: cfg } = await db.from('app_config').select('value').eq('key', 'shipping_flat_cents').single();
  const ship = Number(cfg!.value);
  expect(order).toMatchObject({ subtotal_cents: 1890, discount_cents: 284, coupon_code: CODE, shipping_cents: ship, platform_fee_cents: 161, total_cents: 1890 - 284 + ship });

  const before = (await db.from('coupons').select('uses').eq('code', CODE).single()).data!.uses;
  const evt = { id: 'cs_test_cpn', object: 'checkout.session', payment_status: 'paid', payment_intent: `pi_cpn_${Date.now()}`, client_reference_id: order!.id, metadata: { order_id: order!.id } };
  expect((await sendStripeEvent(BASE, 'checkout.session.completed', evt)).status).toBe(200);
  expect((await sendStripeEvent(BASE, 'checkout.session.completed', evt)).status).toBe(200); // evento ripetuto
  const after = (await db.from('coupons').select('uses').eq('code', CODE).single()).data!.uses;
  expect(after).toBe(before + 1);

  await page.goto(`/it/account/orders/${order!.id}`);
  await expect(page.getByText(`Sconto ${CODE}`)).toBeVisible();
});

test('cliente annulla un ordine non pagato', async ({ page }) => {
  await emptyCustomerCart();
  await login(page, DEMO.customer);
  await page.goto('/it/product/demo-clip-ricambio');
  await page.getByRole('button', { name: 'Aggiungi al carrello' }).click();
  await expect(page.getByText('Aggiunto al carrello')).toBeVisible();
  await page.goto('/it/checkout');
  await page.getByLabel('Nome e cognome').fill('Mario Rossi');
  await page.getByLabel('Indirizzo', { exact: true }).fill('Via Roma 1');
  await page.getByLabel('Città').fill('Bari');
  await page.getByLabel('CAP').fill('70121');
  await page.getByRole('button', { name: 'Conferma e vai al pagamento' }).click();
  await page.getByRole('button', { name: 'Annulla questo ordine' }).click();
  await expect(page.getByText('Ordine annullato')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Paga ora' })).toHaveCount(0);
});

test('modalità ferie: prodotti visibili ma non acquistabili', async ({ page, browser }) => {
  await login(page, DEMO.seller);
  await page.goto('/it/seller/settings');
  await page.getByLabel(/Shop in ferie/).check();
  await page.getByLabel('Messaggio per i clienti').fill('Torniamo lunedì!');
  await page.getByRole('button', { name: 'Salva' }).last().click();
  await expect(page.getByText('Modifiche salvate.')).toBeVisible();
  await page.goto('/it/seller');
  await expect(page.getByText('Il tuo shop è in ferie')).toBeVisible();

  const ctx = await browser.newContext();
  const guest = await ctx.newPage();
  await guest.goto('/it/product/demo-vaso-spirale');
  await expect(guest.getByText('Demo Maker Lab è in ferie')).toBeVisible();
  await expect(guest.getByText('Torniamo lunedì!')).toBeVisible();
  await expect(guest.getByRole('button', { name: 'Aggiungi al carrello' })).toHaveCount(0);
  await guest.goto('/it/shop/demo-maker-lab');
  await expect(guest.getByText('Torniamo lunedì!')).toBeVisible();
  await ctx.close();

  await page.goto('/it/seller/settings');
  await page.getByLabel(/Shop in ferie/).uncheck();
  await page.getByRole('button', { name: 'Salva' }).last().click();
  await expect(page.getByText('Modifiche salvate.')).toBeVisible();
});

test('scorte basse in dashboard', async ({ page }) => {
  await login(page, DEMO.seller);
  await page.goto('/it/seller');
  const panel = page.getByRole('region', { name: 'Scorte in esaurimento' });
  await expect(panel).toBeVisible();
  await expect(panel.getByText('Portachiavi Geometrico')).toBeVisible(); // variante arancio a 0
});

test('duplica un prodotto come bozza', async ({ page }) => {
  await login(page, DEMO.seller);
  const { data: p } = await adminDb().from('products').select('id').eq('slug', 'demo-vaso-spirale').single();
  await page.goto(`/it/seller/products/${p!.id}`);
  await page.getByRole('button', { name: 'Duplica' }).click();
  await expect(page.getByRole('heading', { name: 'Vaso Spirale (copia)' })).toBeVisible();
  await expect(page.getByText('Bozza', { exact: true })).toBeVisible();
});

test('export CSV: venditore e admin sì, cliente no', async ({ page, browser }) => {
  await login(page, DEMO.seller);
  const res = await page.request.get('/api/seller/orders-csv');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('text/csv');
  const body = await res.text();
  expect(body.startsWith('﻿data;pagato_il;ordine;stato')).toBe(true);
  expect(body).toContain(CODE);

  const adminCtx = await browser.newContext();
  const admin = await adminCtx.newPage();
  await login(admin, DEMO.admin);
  const ares = await admin.request.get('/api/admin/orders-csv');
  expect(ares.status()).toBe(200);
  expect(await ares.text()).toContain('Demo Maker Lab');
  await adminCtx.close();

  const custCtx = await browser.newContext();
  const cust = await custCtx.newPage();
  await login(cust, DEMO.customer);
  expect((await cust.request.get('/api/admin/orders-csv')).status()).toBe(403);
  expect((await cust.request.get('/api/seller/orders-csv')).status()).toBe(403);
  await custCtx.close();
  void demoStore;
});

test('login: blocco dopo 10 tentativi falliti sullo stesso account', async ({ page }) => {
  const email = `bruteforce-${Date.now()}@demo.test`;
  for (let i = 0; i < 11; i++) {
    await page.goto('/it/login');
    await page.getByLabel(/^(Email)$/).fill(email);
    await page.getByLabel(/^(Password)$/).fill(`sbagliata-${i}`);
    await page.getByRole('main').getByRole('button', { name: 'Accedi' }).click();
    await page.waitForURL(/error=/);
  }
  await expect(page.getByText('Troppi tentativi')).toBeVisible();
});
