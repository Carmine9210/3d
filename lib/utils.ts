export function formatPrice(cents: number, currency = 'EUR', locale = 'it'): string {
  return new Intl.NumberFormat(locale === 'en' ? 'en-IE' : 'it-IT', {
    style: 'currency',
    currency,
  }).format(cents / 100);
}

export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function randomSuffix(len = 5): string {
  return Math.random().toString(36).slice(2, 2 + len);
}

/** Sceglie il testo nella lingua corrente, con fallback sull'altra. */
export function pickLocalized(locale: string, it?: string | null, en?: string | null): string {
  const primary = locale === 'en' ? en : it;
  const fallback = locale === 'en' ? it : en;
  return (primary && primary.trim()) || (fallback && fallback.trim()) || '';
}

export function eurosToCents(value: string | number): number {
  const n = typeof value === 'number' ? value : parseFloat(value.replace(',', '.'));
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * 100);
}

export function publicImageUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${path}`;
}

export function storeAssetUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/store-assets/${path}`;
}

/** Commissione di piattaforma in centesimi. */
export function platformFee(subtotalCents: number, commissionBps: number): number {
  return Math.round((subtotalCents * commissionBps) / 10000);
}

/** Toglie caratteri che romperebbero i filtri PostgREST `or()`/ilike. */
export function sanitizeSearch(q: string): string {
  return q.replace(/[%,()*\\]/g, ' ').trim().slice(0, 80);
}
