import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

/** Chiave segreta: SUPABASE_SERVICE_ROLE_KEY (legacy) oppure SUPABASE_SECRET_KEY (nuove chiavi sb_secret_). */
export function serviceRoleKey(): string | undefined {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || undefined;
}

/** Client con service role: SOLO lato server (webhook, azioni verificate). Bypassa la RLS. */
export function createAdminClient() {
  const key = serviceRoleKey();
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY mancante: impostala nelle variabili d\'ambiente (vedi docs/DEPLOY.md).');
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
