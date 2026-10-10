// Risolve l'URL del progetto Supabase dalle variabili d'ambiente.
// Errore frequente: nella variabile dell'URL viene incollata la chiave (sb_publishable_… o JWT) invece
// dell'indirizzo. In quel caso l'URL si ricava dal "ref" contenuto nella chiave anon (JWT legacy).

function jwtRef(token) {
  try {
    return JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString()).ref;
  } catch {
    return undefined;
  }
}

/** @param {Record<string, string | undefined>} env */
export function resolveSupabaseUrl(env) {
  const candidates = [env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_URL, env.SUPABASE_DATABASE_URL].filter(Boolean);
  const url = candidates.find((v) => /^https?:\/\//.test(v));
  if (url) return url.replace(/\/+$/, '');
  const keys = [
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    env.SUPABASE_ANON_KEY,
    env.SUPABASE_SERVICE_ROLE_KEY,
    env.SUPABASE_SECRET_KEY,
    ...candidates,
  ];
  for (const key of keys) {
    const ref = key && jwtRef(key);
    if (typeof ref === 'string' && /^[a-z0-9]{20}$/.test(ref)) return `https://${ref}.supabase.co`;
  }
  return candidates[0] ?? '';
}

/** true se una delle variabili dell'URL non contiene un indirizzo (es. vi è stata incollata una chiave). */
export function supabaseUrlMisconfigured(env) {
  return [env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_URL, env.SUPABASE_DATABASE_URL].some((v) => v && !/^https?:\/\//.test(v));
}
