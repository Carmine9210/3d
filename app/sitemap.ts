import type { MetadataRoute } from 'next';
import { createClient } from '@supabase/supabase-js';
import { siteUrl } from '@/lib/site';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const locales = ['it', 'en'];
  const entries: MetadataRoute.Sitemap = locales.map((l) => ({ url: `${base}/${l}`, changeFrequency: 'daily', priority: 1 }));

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return entries;
  const supabase = createClient<any>(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  const [{ data: products }, { data: stores }, { data: categories }] = await Promise.all([
    supabase.from('products').select('slug, updated_at').eq('status', 'published').limit(5000),
    supabase.from('stores').select('slug, updated_at').eq('status', 'active').limit(5000),
    supabase.from('categories').select('id, slug'),
  ]);

  // Solo categorie con almeno un prodotto pubblicato (niente pagine vuote).
  const { data: used } = await supabase.from('products').select('category_id').eq('status', 'published').limit(10000);
  const usedIds = new Set((used ?? []).map((r) => r.category_id));

  for (const l of locales) {
    for (const p of products ?? []) entries.push({ url: `${base}/${l}/product/${p.slug}`, lastModified: p.updated_at });
    for (const s of stores ?? []) entries.push({ url: `${base}/${l}/shop/${s.slug}`, lastModified: s.updated_at });
    for (const c of categories ?? []) if (usedIds.has(c.id)) entries.push({ url: `${base}/${l}/category/${c.slug}` });
  }
  return entries;
}
