/**
 * URL pubblico del sito, senza slash finale.
 * Priorità: NEXT_PUBLIC_SITE_URL esplicita → URL fornito da Netlify al build
 * (produzione: `URL`, deploy preview/branch: `DEPLOY_PRIME_URL`, iniettati in next.config.mjs) → localhost.
 */
export function siteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  return raw.replace(/\/+$/, '');
}
