import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * Health check per monitor esterni (UptimeRobot, Better Stack…): 200 se l'app risponde e il database è raggiungibile.
 * Nessun dato sensibile nella risposta.
 */
export async function GET() {
  const started = Date.now();
  let db: 'ok' | 'error' | 'unconfigured' = 'unconfigured';
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key) {
    try {
      const supabase = createClient(url, key, { auth: { persistSession: false } });
      const res = await Promise.race([
        supabase.from('app_config').select('key').limit(1),
        new Promise<{ error: Error }>((r) => setTimeout(() => r({ error: new Error('timeout') }), 3000)),
      ]);
      db = res.error ? 'error' : 'ok';
    } catch {
      db = 'error';
    }
  }
  const ok = db === 'ok';
  return NextResponse.json(
    { ok, db, ms: Date.now() - started, time: new Date().toISOString() },
    { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
