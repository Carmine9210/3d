import { expect, test } from '@playwright/test';
import { DEMO, login } from './helpers';

// Richiede `npm run seed:demo`. Verifica gli elementi pensati per la conversione.
test('home: fiducia, categorie, FAQ con dati strutturati e CTA venditore', async ({ page }) => {
  await page.goto('/it');
  await expect(page.getByText('Pagamento sicuro').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Come funziona' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Domande frequenti' })).toBeVisible();
  await expect(page.getByRole('main').getByRole('link', { name: 'Apri il tuo shop' })).toBeVisible();
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  expect(blocks.some((b) => JSON.parse(b)['@type'] === 'FAQPage')).toBe(true);
});

test('home: nessuna recensione inventata (solo recensioni reali)', async ({ page }) => {
  await page.goto('/it');
  // Con il solo seed demo non esistono recensioni: la sezione non deve comparire.
  await expect(page.getByRole('heading', { name: 'Cosa dicono i clienti' })).toHaveCount(0);
});

test('scheda prodotto: consegna stimata, spedizione, garanzie e breadcrumb', async ({ page }) => {
  await page.goto('/it/product/demo-vaso-spirale');
  await expect(page.getByText(/Consegna stimata/)).toBeVisible();
  await expect(page.getByText(/Spedizione gratuita sopra/)).toBeVisible();
  await expect(page.getByText('Pagamento sicuro con carta tramite Stripe')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toBeVisible();
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  expect(blocks.some((b) => JSON.parse(b)['@type'] === 'BreadcrumbList')).toBe(true);
});

test('scheda prodotto: ultimi pezzi mostrati solo con stock reale basso', async ({ page }) => {
  await page.goto('/it/product/demo-miniatura-drago'); // stock 3
  await expect(page.getByText('Ne restano solo 3')).toBeVisible();
  await page.goto('/it/product/demo-clip-ricambio'); // stock 50
  await expect(page.getByText(/Ne restano solo/)).toHaveCount(0);
});

test('card prodotto: badge Ultimi pezzi e Personalizzabile', async ({ page }) => {
  await page.goto('/it/search');
  await expect(page.getByText('Ultimi pezzi').first()).toBeVisible();
  await expect(page.getByText('Personalizzabile').first()).toBeVisible();
});

test('carrello ospite: si aggiunge senza account, resta salvato e prezzi dal database', async ({ page }) => {
  await page.goto('/it/product/demo-targa-nome');
  await page.getByLabel('Personalizzazione').fill('Mario');
  await page.getByRole('button', { name: 'Aggiungi al carrello' }).click();
  await expect(page.getByText('Aggiunto al carrello')).toBeVisible();

  await page.goto('/it/cart');
  await expect(page.getByText('Targa con Nome')).toBeVisible();
  await expect(page.getByText('“Mario”')).toBeVisible();
  await expect(page.getByText(/Ti mancano .* per la spedizione gratuita/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Accedi o registrati per pagare' })).toBeVisible();
});

test('carrello ospite: cookie manomesso viene ignorato', async ({ page, context }) => {
  await context.addCookies([{ name: 'gc', value: '[{"v":"non-un-uuid","q":9999,"c":""}]', url: 'http://localhost:3000' }]);
  await page.goto('/it/cart');
  await expect(page.getByText('Il carrello è vuoto')).toBeVisible();
});

test('carrello ospite: dopo il login il carrello viene unito a quello dell’account', async ({ page }) => {
  await page.goto('/it/product/demo-portachiavi');
  await page.getByRole('button', { name: 'Aggiungi al carrello' }).click();
  await expect(page.getByText('Aggiunto al carrello')).toBeVisible();

  await login(page, DEMO.customer);
  await page.goto('/it/cart');
  await expect(page.getByText('Portachiavi Geometrico')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Vai al checkout' })).toBeVisible();
});

test('checkout anonimo: rimanda al login e poi torna al checkout', async ({ page }) => {
  await page.goto('/it/checkout');
  await expect(page).toHaveURL(/login\?next=%2Fcheckout/);
});
