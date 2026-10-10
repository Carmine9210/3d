/**
 * Rate limiting a finestra fissa.
 * - `enforceRateLimit` usa la tabella `rate_limits` su Supabase (funzione atomica `rate_limit_hit`):
 *   il limite vale per tutte le istanze serverless di Netlify.
 * - Se il database non risponde si ripiega sul contatore in memoria (per istanza), così un guasto
 *   del limiter non blocca login e pagamenti.
 */
type Bucket = { count: number; reset: number };
const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()) {
  if (buckets.size > 5000) {
    for (const [k, b] of buckets) if (b.reset <= now) buckets.delete(k);
  }
  const b = buckets.get(key);
  if (!b || b.reset <= now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterMs: 0 };
  }
  b.count += 1;
  if (b.count > limit) return { ok: false, remaining: 0, retryAfterMs: b.reset - now };
  return { ok: true, remaining: limit - b.count, retryAfterMs: 0 };
}

export function resetRateLimits() {
  buckets.clear();
}

async function clientIp(): Promise<string> {
  const { headers } = await import('next/headers');
  const h = await headers();
  return (
    h.get('x-nf-client-connection-ip') ||
    (h.get('x-forwarded-for') ?? '').split(',')[0].trim() ||
    h.get('x-real-ip') ||
    'unknown'
  );
}

/** Solo lettura: `true` se la chiave è ancora sotto il limite (non conta il tentativo). */
export async function underLimit(scope: string, limit: number, id = ''): Promise<boolean> {
  const key = `${scope}:${await clientIp()}:${id}`.slice(0, 200);
  if ((process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY) && process.env.NEXT_PUBLIC_SUPABASE_URL) {
    try {
      const { createAdminClient } = await import('@/lib/supabase/admin');
      const { data, error } = await createAdminClient().rpc('rate_limit_peek', { p_key: key, p_limit: limit });
      if (!error && typeof data === 'boolean') return data;
    } catch {
      /* fallback sotto */
    }
  }
  const b = buckets.get(key);
  return !b || b.reset <= Date.now() || b.count < limit;
}

/** Applica il limite usando IP del client (+ identificativo opzionale, es. user id). */
export async function enforceRateLimit(scope: string, limit: number, windowMs: number, id = ''): Promise<boolean> {
  // Netlify espone l'IP reale in x-nf-client-connection-ip
  const ip = await clientIp();
  const key = `${scope}:${ip}:${id}`.slice(0, 200);
  if ((process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY) && process.env.NEXT_PUBLIC_SUPABASE_URL) {
    try {
      const { createAdminClient } = await import('@/lib/supabase/admin');
      const { data, error } = await createAdminClient().rpc('rate_limit_hit', {
        p_key: key,
        p_limit: limit,
        p_window_seconds: Math.max(1, Math.round(windowMs / 1000)),
      });
      if (!error && typeof data === 'boolean') return data;
      if (error) console.warn('[rate-limit] fallback in memoria:', error.message);
    } catch (err) {
      console.warn('[rate-limit] fallback in memoria:', err);
    }
  }
  return rateLimit(key, limit, windowMs).ok;
}
