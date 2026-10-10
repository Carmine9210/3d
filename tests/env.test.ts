import { describe, expect, it } from 'vitest';
import { parseEnv, stripeWebhookSecrets } from '@/lib/env';

const valid = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'a'.repeat(30),
  SUPABASE_SERVICE_ROLE_KEY: 'b'.repeat(30),
  STRIPE_SECRET_KEY: 'sk_test_123',
  STRIPE_WEBHOOK_SECRET: 'whsec_1,whsec_2',
};

describe('env', () => {
  it('accetta una configurazione valida e applica i default', () => {
    const env = parseEnv(valid);
    expect(env.NEXT_PUBLIC_SITE_URL).toBe('http://localhost:3000');
  });

  it('segnala le variabili mancanti con messaggio leggibile', () => {
    expect(() => parseEnv({ ...valid, STRIPE_SECRET_KEY: undefined })).toThrow(/STRIPE_SECRET_KEY/);
    expect(() => parseEnv({ ...valid, STRIPE_SECRET_KEY: 'pk_test_x' })).toThrow(/sk_test_/);
  });

  it('tratta stringhe vuote come mancanti per le facoltative', () => {
    expect(parseEnv({ ...valid, RESEND_API_KEY: '' }).RESEND_API_KEY).toBeUndefined();
  });

  it('separa più secret del webhook', () => {
    expect(stripeWebhookSecrets('whsec_1, whsec_2 ,')).toEqual(['whsec_1', 'whsec_2']);
  });
});

describe('nomi alternativi delle variabili', () => {
  it('accetta SUPABASE_URL / publishable / secret key', () => {
    const env = parseEnv({
      SUPABASE_URL: 'https://abc.supabase.co',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_xxxxxxxxxxxxxxxxxxxx',
      SUPABASE_SECRET_KEY: 'sb_secret_xxxxxxxxxxxxxxxxxxxxxxxx',
      STRIPE_SECRET_KEY: 'sk_test_x',
      STRIPE_WEBHOOK_SECRET: 'whsec_x',
    });
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe('https://abc.supabase.co');
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toMatch(/^sb_secret_/);
  });
});

describe('URL Supabase sbagliato', () => {
  it("ricava l'URL dal ref della chiave anon se nella variabile c'è una chiave", () => {
    const anon = `x.${Buffer.from(JSON.stringify({ ref: 'abcdefghijklmnopqrst', role: 'anon' })).toString('base64url')}.y`;
    const env = parseEnv({ ...valid, NEXT_PUBLIC_SUPABASE_URL: 'sb_publishable_xxxxxxxxxxxx', NEXT_PUBLIC_SUPABASE_ANON_KEY: anon });
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe('https://abcdefghijklmnopqrst.supabase.co');
  });
});
