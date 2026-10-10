import { expect, type Page } from '@playwright/test';

// Gli stessi valori creati da `npm run seed:demo`.
export const DEMO = {
  password: 'Demo-Passw0rd!',
  admin: 'admin@demo.test',
  seller: 'seller@demo.test',
  customer: 'customer@demo.test',
};

export async function login(page: Page, email: string, locale: 'it' | 'en' = 'it') {
  await page.goto(`/${locale}/login`);
  await page.getByLabel(/^(Email)$/).fill(email);
  await page.getByLabel(/^(Password)$/).fill(DEMO.password);
  await page.getByRole('main').getByRole('button', { name: /Accedi|Log in/ }).click();
  await expect(page).toHaveURL(/\/account/);
}

import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

/** Variabili da process.env o .env.local (Playwright non carica .env da solo). */
export function testEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env };
  const file = existsSync('.env.local') ? '.env.local' : existsSync('.env') ? '.env' : null;
  if (file) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !line.trim().startsWith('#')) env[m[1]] ??= m[2].replace(/^["']|["']$/g, '');
    }
  }
  return env;
}

/** Client service role per preparare/verificare dati nei test (mai usato dall'app nel browser). */
export function adminDb() {
  const env = testEnv();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

/** Invia al webhook un evento Stripe firmato con il secret configurato: simula Stripe senza rete. */
export async function sendStripeEvent(baseURL: string, type: string, object: Record<string, unknown>) {
  const env = testEnv();
  const secret = (env.STRIPE_WEBHOOK_SECRET ?? '').split(',')[0].trim();
  const payload = JSON.stringify({ id: `evt_test_${Date.now()}_${Math.random().toString(36).slice(2)}`, object: 'event', type, data: { object } });
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
  return fetch(`${baseURL}/api/stripe/webhook`, { method: 'POST', headers: { 'stripe-signature': header, 'content-type': 'application/json' }, body: payload });
}
