// Eseguito prima di `next build`. Su Netlify blocca il deploy se mancano le variabili essenziali
// o se c'è un errore pericoloso (chiave segreta in una variabile pubblica). In locale/CI avvisa soltanto.
import { resolveSupabaseUrl, supabaseUrlMisconfigured } from '../lib/supabase-url.mjs';

const env = process.env;
const onNetlify = env.NETLIFY === 'true';
const errors = [];
const warnings = [];

const url = resolveSupabaseUrl(env);
const anon =
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY;
const service = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;

function jwtRole(token) {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).role;
  } catch {
    return undefined;
  }
}

if (supabaseUrlMisconfigured(env) && /^https?:\/\//.test(url)) {
  warnings.push('NEXT_PUBLIC_SUPABASE_URL contiene una chiave invece dell\'indirizzo: uso l\'URL ricavato dalla chiave anon. Correggi la variabile con il Project URL (https://xxxx.supabase.co).');
}
if (!url) errors.push('Manca NEXT_PUBLIC_SUPABASE_URL (Supabase → Project Settings → API → Project URL).');
else {
  if (!/^https?:\/\/[^/]+\/?$/.test(url)) errors.push(`NEXT_PUBLIC_SUPABASE_URL deve essere solo l'indirizzo base (es. https://xxxx.supabase.co), trovato: ${url.replace(/\/\/([^.]{4})[^.]*/, '//$1…')}`);
  if (onNetlify && url.startsWith('http://')) errors.push('NEXT_PUBLIC_SUPABASE_URL in produzione deve iniziare con https://');
}
if (!anon) errors.push('Manca NEXT_PUBLIC_SUPABASE_ANON_KEY (Supabase → Project Settings → API → anon / publishable key).');
else if (anon.startsWith('sb_secret_') || jwtRole(anon) === 'service_role') {
  // La chiave pubblica finisce nel browser: se è quella segreta chiunque avrebbe accesso totale al database.
  errors.push('PERICOLO: in NEXT_PUBLIC_SUPABASE_ANON_KEY c\'è la chiave SEGRETA (service_role / sb_secret_). Usa la chiave anon/publishable.');
}
if (!service) warnings.push('Manca SUPABASE_SERVICE_ROLE_KEY: ordini, webhook, email e area admin non funzioneranno.');
else if (service === anon) errors.push('SUPABASE_SERVICE_ROLE_KEY è uguale alla chiave anon: copia la chiave service_role / secret.');
if (!env.STRIPE_SECRET_KEY) warnings.push('Manca STRIPE_SECRET_KEY: i pagamenti non funzioneranno.');
else if (!/^(sk|rk)_(test|live)_/.test(env.STRIPE_SECRET_KEY)) errors.push('STRIPE_SECRET_KEY deve iniziare con sk_test_ o sk_live_ (non la chiave pk_ pubblicabile).');
if (!env.STRIPE_WEBHOOK_SECRET) warnings.push('Manca STRIPE_WEBHOOK_SECRET: gli ordini non passeranno a "Pagato".');
else if (!env.STRIPE_WEBHOOK_SECRET.split(',').every((s) => s.trim().startsWith('whsec_'))) errors.push('STRIPE_WEBHOOK_SECRET: ogni valore deve iniziare con whsec_ (separati da virgola).');
if (onNetlify && env.CONTEXT === 'production' && (env.STRIPE_SECRET_KEY ?? '').startsWith('sk_test_')) warnings.push('Produzione con chiave Stripe di TEST: va bene per la prova, da cambiare prima del lancio.');
if (env.NEXT_PUBLIC_SITE_URL && /\/$/.test(env.NEXT_PUBLIC_SITE_URL)) warnings.push('NEXT_PUBLIC_SITE_URL ha lo slash finale: viene rimosso in automatico.');

for (const w of warnings) console.warn(`⚠  ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`✗  ${e}`);
  if (onNetlify) {
    console.error('\nDeploy fermato: correggi le variabili in Netlify → Site configuration → Environment variables, poi "Retry deploy". Guida: docs/DEPLOY.md');
    process.exit(1);
  }
  console.warn('\n(Build locale: si prosegue comunque. Su Netlify questi errori fermerebbero il deploy.)');
}
if (!errors.length && !warnings.length) console.log('✓  Variabili d\'ambiente a posto.');
