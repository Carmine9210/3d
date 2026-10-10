// Funzione schedulata Netlify: ogni ora annulla gli ordini mai pagati (> 48 h)
// e pulisce contatori di rate limit ed eventi Stripe vecchi. Gira solo sui deploy di produzione.
import { createClient } from '@supabase/supabase-js';
import { resolveSupabaseUrl } from '../../lib/supabase-url.mjs';

export default async function handler() {
  const url = resolveSupabaseUrl(process.env);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    console.error('[cleanup] NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY mancanti');
    return new Response('missing env', { status: 500 });
  }
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.rpc('cleanup_stale', { p_hours: 48 });
  if (error) {
    console.error('[cleanup] errore', error.message);
    return new Response('error', { status: 500 });
  }
  console.info(`[cleanup] ordini scaduti annullati: ${data ?? 0}`);
  return new Response('ok');
}

export const config = { schedule: '@hourly' };
