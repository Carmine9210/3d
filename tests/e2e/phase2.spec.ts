import { expect, test } from '@playwright/test';
import { DEMO, adminDb, login, sendStripeEvent } from './helpers';

// Richiede `npm run seed:demo`. Copre le funzioni dello Step 7: indirizzi, reset password,
// webhook firmato, messaggi sull'ordine, risposte alle recensioni, utenti admin, funnel.
test.describe.configure({ mode: 'serial' });

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const REVIEW_TEXT = 'Stampa perfetta, arrivato in fretta.';

// Pulizia: le recensioni di prova non devono influenzare gli altri test (es. sezione recensioni in home).
test.afterAll(async () => {
  await adminDb().from('reviews').delete().eq('comment', REVIEW_TEXT);
});

test('reset password: richiesta link e pagina protetta', async ({ page }) => {
  await page.goto('/it/login');
  await page.getByRole('link', { name: 'Password dimenticata?' }).click();
  await expect(page).toHaveURL(/forgot-password/);
  await page.getByLabel('Email').fill('qualcuno@demo.test');
  await page.getByRole('button', { name: 'Invia il link' }).click();
  await expect(page.getByText('Se l’indirizzo è registrato')).toBeVisible();
  // Senza la sessione del link email la pagina di reset non è accessibile.
  await page.goto('/it/reset-password');
  await expect(page).toHaveURL(/forgot-password\?error=expired/);
});

test('rubrica indirizzi: aggiunta, predefinito, eliminazione', async ({ page }) => {
  await login(page, DEMO.customer);
  await page.goto('/it/account/addresses');
  const form = page.locator('#address-form');
  await form.getByLabel('Nome e cognome').fill('Lucia Bianchi');
  await form.getByLabel('Indirizzo', { exact: true }).fill('Corso Italia 10');
  await form.getByLabel('Città').fill('Lecce');
  await form.getByLabel('CAP').fill('73100');
  await form.getByRole('button', { name: 'Salva' }).click();
  await expect(page.getByText('Modifiche salvate.')).toBeVisible();
  const row = page.getByRole('listitem').filter({ hasText: 'Lucia Bianchi' });
  await expect(row).toBeVisible();
  if (await row.getByRole('button', { name: 'Usa come predefinito' }).count()) {
    await row.getByRole('button', { name: 'Usa come predefinito' }).click();
  }
  await expect(page.getByRole('listitem').filter({ hasText: 'Lucia Bianchi' }).getByText('Predefinito')).toBeVisible();
  await page.getByRole('listitem').filter({ hasText: 'Lucia Bianchi' }).getByRole('button', { name: 'Elimina' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Lucia Bianchi' })).toHaveCount(0);
});

test('webhook: firma non valida rifiutata', async () => {
  const res = await fetch(`${BASE}/api/stripe/webhook`, { method: 'POST', headers: { 'stripe-signature': 't=1,v1=bad' }, body: '{}' });
  expect(res.status).toBe(400);
});

let orderId = '';

test('ordine pagato via webhook, messaggi cliente ↔ venditore', async ({ page, browser }) => {
  // Carrello pulito: l'ordine deve contenere solo l'articolo di questo test (lo stock degli altri resta intatto).
  const { data: cust } = await adminDb().from('profiles').select('user_id').eq('display_name', 'Cliente Demo').single();
  await adminDb().from('cart_items').delete().eq('user_id', cust!.user_id);
  await login(page, DEMO.customer);
  await page.goto('/it/product/demo-supporto-cuffie');
  await page.getByRole('button', { name: 'Aggiungi al carrello' }).click();
  await expect(page.getByText('Aggiunto al carrello')).toBeVisible();
  await page.goto('/it/checkout');
  await page.getByLabel('Nome e cognome').fill('Mario Rossi');
  await page.getByLabel('Indirizzo', { exact: true }).fill('Via Roma 1');
  await page.getByLabel('Città').fill('Bari');
  await page.getByLabel('CAP').fill('70121');
  await page.getByRole('button', { name: 'Conferma e vai al pagamento' }).click();
  await expect(page).toHaveURL(/checkout\/pay/);

  const db = adminDb();
  const { data: order } = await db
    .from('orders')
    .select('id, total_cents')
    .eq('status', 'pending_payment')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  expect(order).toBeTruthy();
  orderId = order!.id;

  // Stripe conferma il pagamento → l'ordine diventa "Pagato" (una sola volta anche se l'evento si ripete).
  const evt = { id: 'cs_test_e2e', object: 'checkout.session', payment_status: 'paid', payment_intent: `pi_e2e_${Date.now()}`, client_reference_id: orderId, metadata: { order_id: orderId } };
  expect((await sendStripeEvent(BASE, 'checkout.session.completed', evt)).status).toBe(200);
  await page.goto(`/it/account/orders/${orderId}`);
  await expect(page.getByText('Pagato', { exact: true })).toBeVisible();

  // Cliente scrive al maker
  await page.getByLabel('Scrivi un messaggio').fill('Ciao! Potete spedire entro venerdì?');
  await page.getByRole('button', { name: 'Invia' }).click();
  await expect(page.getByText('Ciao! Potete spedire entro venerdì?')).toBeVisible();

  // Il venditore vede il badge "nuovo messaggio", apre l'ordine e risponde
  const sellerCtx = await browser.newContext();
  const seller = await sellerCtx.newPage();
  await login(seller, DEMO.seller);
  await seller.goto('/it/seller/orders');
  await expect(seller.getByText('1 nuovo messaggio').first()).toBeVisible();
  await seller.goto(`/it/seller/orders/${orderId}`);
  await expect(seller.getByText('Ciao! Potete spedire entro venerdì?')).toBeVisible();
  await seller.getByLabel('Scrivi un messaggio').fill('Certo, parte giovedì.');
  await seller.getByRole('button', { name: 'Invia' }).click();
  await expect(seller.getByText('Certo, parte giovedì.')).toBeVisible();

  // Avanzamento: in produzione → spedito con tracking (dalla pagina di dettaglio)
  await seller.getByRole('button', { name: 'Metti in produzione' }).click();
  await expect(seller.getByText('In produzione', { exact: true })).toBeVisible();
  await seller.getByLabel('Corriere').fill('BRT');
  await seller.getByLabel('Codice tracking').fill('BRT123456');
  await seller.getByRole('button', { name: 'Segna come spedito' }).click();
  await expect(seller.getByText('BRT · BRT123456')).toBeVisible();
  await sellerCtx.close();

  await page.reload();
  await expect(page.getByText('Certo, parte giovedì.')).toBeVisible();
  await expect(page.getByText('BRT · BRT123456')).toBeVisible();
});

test('recensione e risposta pubblica del venditore', async ({ page, browser }) => {
  test.skip(!orderId, 'serve l’ordine del test precedente');
  await login(page, DEMO.customer);
  await page.goto(`/it/account/orders/${orderId}`);
  const item = page.getByRole('listitem').filter({ hasText: 'Supporto per Cuffie' }).first();
  await item.getByText('Lascia una recensione').click();
  await item.getByLabel('Commento').fill(REVIEW_TEXT);
  await item.getByRole('button', { name: 'Pubblica recensione' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Supporto per Cuffie' }).getByText('Recensito')).toBeVisible();

  const sellerCtx = await browser.newContext();
  const seller = await sellerCtx.newPage();
  await login(seller, DEMO.seller);
  await seller.goto('/it/seller/reviews');
  const card = seller.getByRole('listitem').filter({ hasText: REVIEW_TEXT }).first();
  await card.getByLabel(/La tua risposta|Modifica la risposta/).fill('Grazie mille, alla prossima!');
  await card.getByRole('button', { name: 'Pubblica risposta' }).click();
  await expect(seller.getByText('Modifiche salvate.')).toBeVisible();
  await sellerCtx.close();

  await page.goto('/it/product/demo-supporto-cuffie');
  await expect(page.getByText('Risposta di Demo Maker Lab').first()).toBeVisible();
  await expect(page.getByText('Grazie mille, alla prossima!').first()).toBeVisible();
});

test('venditore: funnel nelle statistiche', async ({ page }) => {
  await login(page, DEMO.seller);
  await page.goto('/it/seller/analytics');
  await expect(page.getByRole('heading', { name: 'Percorso di acquisto' })).toBeVisible();
  await expect(page.getByText('Aggiunte al carrello')).toBeVisible();
});

test('admin: elenco utenti, nessuna azione su sé stesso', async ({ page }) => {
  await login(page, DEMO.admin);
  await page.goto('/it/admin/users');
  await expect(page.getByRole('heading', { name: 'Utenti' })).toBeVisible();
  const me = page.getByRole('listitem').filter({ hasText: DEMO.admin });
  await expect(me).toBeVisible();
  await expect(me.getByRole('button', { name: 'Blocca accesso' })).toHaveCount(0);
  await expect(page.getByRole('listitem').filter({ hasText: DEMO.customer }).getByRole('button', { name: 'Blocca accesso' })).toBeVisible();
});

test('cliente: non vede i messaggi di ordini altrui', async ({ page }) => {
  test.skip(!orderId, 'serve l’ordine del test precedente');
  // Il venditore non è il cliente: la pagina ordine del cliente deve dare 404.
  await login(page, DEMO.seller);
  const res = await page.goto(`/it/account/orders/${orderId}`);
  expect(res?.status()).toBe(404);
});

test('venditore: foto caricata direttamente su Storage dal browser', async ({ page }) => {
  await login(page, DEMO.seller);
  const db = adminDb();
  const { data: p } = await db.from('products').select('id').eq('slug', 'demo-bozza').single();
  await db.from('product_images').delete().eq('product_id', p!.id); // max 12 foto: si parte puliti
  const before = 0;
  await page.goto(`/it/seller/products/${p!.id}`);
  // PNG 1×1 valido
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await page.locator('#images').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: png });
  await expect(page).toHaveURL(/saved=1/);
  await expect.poll(async () => (await db.from('product_images').select('id').eq('product_id', p!.id)).data?.length ?? 0).toBe(before + 1);
  await expect(page.getByRole('button', { name: 'Rimuovi foto' }).first()).toBeVisible();
});
