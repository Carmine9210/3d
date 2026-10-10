import { z } from 'zod';
import { resolveSupabaseUrl } from './supabase-url.mjs';

/** Variabili d'ambiente validate. Usare `serverEnv()` solo lato server, mai nei Client Component. */
const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  STRIPE_SECRET_KEY: z.string().regex(/^(sk|rk)_(test|live)_/, 'deve iniziare con sk_test_ o sk_live_'),
  // Uno o più secret separati da virgola (endpoint "Account" + endpoint "Connect")
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.string().url().default('http://localhost:3000'),
  // Facoltative: senza RESEND_API_KEY le email vengono solo loggate
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  SUPPORT_EMAIL: z.string().optional(),
});

export type ServerEnv = z.infer<typeof schema>;

export function parseEnv(source: Record<string, string | undefined>): ServerEnv {
  const cleaned: Record<string, string | undefined> = Object.fromEntries(Object.entries(source).map(([k, v]) => [k, v === '' ? undefined : v]));
  // Nomi alternativi (integrazione Supabase di Netlify, nuove chiavi publishable/secret)
  cleaned.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= cleaned.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? cleaned.SUPABASE_ANON_KEY ?? cleaned.SUPABASE_PUBLISHABLE_KEY;
  cleaned.SUPABASE_SERVICE_ROLE_KEY ??= cleaned.SUPABASE_SECRET_KEY;
  cleaned.NEXT_PUBLIC_SUPABASE_URL = resolveSupabaseUrl(cleaned) || undefined;
  const result = schema.safeParse(cleaned);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Variabili d'ambiente non valide o mancanti:\n${lines.join('\n')}\nVedi .env.example`);
  }
  return result.data;
}

let cached: ServerEnv | null = null;
export function serverEnv(): ServerEnv {
  if (!cached) cached = parseEnv(process.env);
  return cached;
}

export function stripeWebhookSecrets(raw: string | undefined): string[] {
  return (raw ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}
