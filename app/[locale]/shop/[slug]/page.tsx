import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { pickLocalized, storeAssetUrl } from '@/lib/utils';
import Stars from '@/components/Stars';
import ReportForm from '@/components/ReportForm';
import ProductCard, { type CardProduct } from '@/components/ProductCard';

type Props = { params: Promise<{ locale: string; slug: string }>; searchParams: Promise<Record<string, string | undefined>> };

async function loadStore(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase.from('stores').select('*').eq('slug', slug).eq('status', 'active').maybeSingle();
  return data;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const s = await loadStore(slug);
  if (!s) return {};
  return {
    title: s.name,
    description: pickLocalized(locale, s.description_it, s.description_en).slice(0, 160),
    alternates: { canonical: `/${locale}/shop/${slug}` },
  };
}

export default async function ShopPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const locale = await getLocale();
  const t = await getTranslations('shop');
  const p = await getTranslations('product');
  const c = await getTranslations('common');
  const store = await loadStore(slug);
  if (!store) notFound();

  const supabase = await createClient();
  const { data: products } = await supabase
    .from('products')
    .select('slug, title_it, title_en, base_price_cents, currency, avg_rating, review_count, production_days, is_customizable, stores!inner(name, city, status), product_images(storage_path, sort_order), product_variants(stock)')
    .eq('store_id', store.id)
    .eq('status', 'published')
    .order('created_at', { ascending: false });

  const about = pickLocalized(locale, store.description_it, store.description_en);
  const org = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: store.name,
    description: about,
    address: { '@type': 'PostalAddress', addressLocality: store.city, addressCountry: store.country },
  };

  return (
    <div className="space-y-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(org).replace(/</g, '\\u003c') }} />
      {sp.reported && <p className="notice notice-ok" role="status">{p('reportSent')}</p>}
      {store.vacation_mode && (
        <div className="notice" role="status">
          <p className="font-semibold">{p('vacation', { store: store.name })}</p>
          {store.vacation_message && <p className="mt-1 text-sm">{store.vacation_message}</p>}
        </div>
      )}
      <header className="card overflow-hidden">
        {store.cover_url && (
          <div className="relative aspect-[4/1] bg-print-tint">
            <Image src={storeAssetUrl(store.cover_url)} alt="" fill priority sizes="(max-width: 1152px) 100vw, 1152px" className="object-cover" />
          </div>
        )}
        <div className="p-6">
        <div className="flex items-center gap-4">
          {store.logo_url && (
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-card bg-print-tint">
              <Image src={storeAssetUrl(store.logo_url)} alt={store.name} fill sizes="64px" className="object-cover" />
            </div>
          )}
          <h1 className="font-display text-4xl font-bold">{store.name}</h1>
        </div>
        {store.review_count > 0 && (
          <p className="mt-1 flex items-center gap-2 text-sm">
            <Stars value={Number(store.avg_rating)} /> {t('rating', { rating: store.avg_rating, n: store.review_count })}
          </p>
        )}
        {about && <p className="mt-4 max-w-prose whitespace-pre-line text-ink-soft">{about}</p>}
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          {store.city && (<><dt className="text-ink-mute">{t('location')}</dt><dd>{[store.city, store.region].filter(Boolean).join(', ')}</dd></>)}
          {store.avg_production_days != null && (<><dt className="text-ink-mute">{t('avgProduction')}</dt><dd>{c('days', { n: store.avg_production_days })}</dd></>)}
          {store.return_policy && (<><dt className="text-ink-mute">{t('returns')}</dt><dd className="whitespace-pre-line">{store.return_policy}</dd></>)}
        </dl>
        <div className="mt-4">
          <ReportForm targetType="store" targetId={store.id} returnTo={`/shop/${store.slug}`} label={p('report')} />
        </div>
        </div>
      </header>

      <section>
        <h2 className="mb-4 font-display text-2xl font-bold">{t('products')}</h2>
        {(products ?? []).length === 0 ? (
          <p className="notice">{t('noProducts')}</p>
        ) : (
          <ul className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {(products as unknown as CardProduct[]).map((pr) => (
              <li key={pr.slug}><ProductCard product={pr} /></li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
