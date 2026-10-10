import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

// Nomi alternativi accettati: quelli dell'integrazione Supabase di Netlify e le nuove chiavi "publishable".
const supabaseUrlRaw = (
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || process.env.SUPABASE_DATABASE_URL || ''
).replace(/\/+$/, '');
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  '';
const supabaseUrl = supabaseUrlRaw ? new URL(supabaseUrlRaw) : undefined;

// Su Netlify, se NEXT_PUBLIC_SITE_URL non è impostata, si usa l'URL del deploy:
// produzione → URL, deploy preview / branch deploy → DEPLOY_PRIME_URL.
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.NETLIFY === 'true'
    ? process.env.CONTEXT === 'production'
      ? process.env.URL
      : process.env.DEPLOY_PRIME_URL || process.env.URL
    : undefined) ||
  'http://localhost:3000';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Solo valori pubblici (finiscono anche nel browser). Le chiavi segrete NON vanno mai qui.
  env: {
    NEXT_PUBLIC_SITE_URL: siteUrl.replace(/\/+$/, ''),
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrlRaw,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnonKey,
  },
  images: {
    // Immagini servite da Supabase Storage (https in produzione, http con `supabase start` in locale)
    remotePatterns: supabaseUrl
      ? [{
          protocol: supabaseUrl.protocol.replace(':', ''),
          hostname: supabaseUrl.hostname,
          ...(supabaseUrl.port ? { port: supabaseUrl.port } : {}),
          pathname: '/storage/v1/object/public/**',
        }]
      : [],
  },
  // Netlify accetta richieste fino a ~6 MB: le foto vanno direttamente su Supabase Storage (DirectUpload).
  experimental: { serverActions: { bodySizeLimit: '5mb' } },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
