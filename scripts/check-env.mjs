// Uso: npm run check-env   (legge .env.local se presente)
import { readFileSync, existsSync } from 'node:fs';

const file = existsSync('.env.local') ? '.env.local' : existsSync('.env') ? '.env' : null;
const env = { ...process.env };
if (file) {
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !line.trim().startsWith('#')) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const required = [
  ['NEXT_PUBLIC_SUPABASE_URL', (v) => /^https?:\/\//.test(v)],
  ['NEXT_PUBLIC_SUPABASE_ANON_KEY', (v) => v.length > 20],
  ['SUPABASE_SERVICE_ROLE_KEY', (v) => v.length > 20],
  ['STRIPE_SECRET_KEY', (v) => /^sk_(test|live)_/.test(v)],
  ['STRIPE_WEBHOOK_SECRET', (v) => v.split(',').every((s) => s.trim().startsWith('whsec_'))],
];
// Su Netlify NEXT_PUBLIC_SITE_URL può mancare: viene ricavata da URL / DEPLOY_PRIME_URL al build.
if (env.NETLIFY !== 'true' || env.NEXT_PUBLIC_SITE_URL) {
  required.push(['NEXT_PUBLIC_SITE_URL', (v) => /^https?:\/\//.test(v) && !v.endsWith('/')]);
}
const optional = ['RESEND_API_KEY', 'EMAIL_FROM', 'SUPPORT_EMAIL'];

let bad = 0;
console.log(`Controllo variabili (${file ?? 'solo process.env'})\n`);
for (const [key, ok] of required) {
  const v = env[key];
  if (!v) { console.log(`  ✗ ${key}  mancante`); bad++; }
  else if (!ok(v)) { console.log(`  ✗ ${key}  formato non valido`); bad++; }
  else console.log(`  ✓ ${key}`);
}
for (const key of optional) console.log(`  ${env[key] ? '✓' : '·'} ${key}  ${env[key] ? '' : '(facoltativa)'}`);
if ((env.STRIPE_SECRET_KEY ?? '').startsWith('sk_live_') && (env.NEXT_PUBLIC_SITE_URL ?? '').includes('localhost')) {
  console.log('\n  ⚠ Chiave Stripe LIVE con URL localhost: controlla di non mischiare ambienti.'); bad++;
}
console.log(bad ? `\n${bad} problema/i trovato/i.` : '\nTutto a posto.');
process.exit(bad ? 1 : 0);
