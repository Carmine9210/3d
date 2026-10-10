import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { createClient } from '@/lib/supabase/server';
import { getAppConfig } from '@/lib/config';
import { pickLocalized } from '@/lib/utils';
import LayerObject from '@/components/LayerObject';
import ProductCard, { type CardProduct } from '@/components/ProductCard';
import CategoryTile from '@/components/CategoryTile';
import TrustBar from '@/components/TrustBar';
import Faq from '@/components/Faq';
import Stars from '@/components/Stars';

const CARD_SELECT = `slug, title_it, title_en, base_price_cents, currency, avg_rating, review_count, production_days, is_customizable,
  stores!inner ( name, city, status ), product_images ( storage_path, sort_order ), product_variants ( stock )`;

export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const locale = await getLocale();
  const t = await getTranslations('home');
  const c = await getTranslations('common');
  const acc = await getTranslations('account');
  const supabase = await createClient();
  const config = await getAppConfig();

  const [{ data: categories }, { data: latest }, { data: reviews }] = await Promise.all([
    supabase.from('categories').select('slug, name_it, name_en').order('sort_order'),
    supabase.from('products').select(CARD_SELECT).eq('status', 'published').eq('stores.status', 'active').order('created_at', { ascending: false }).limit(8),
    // Prova sociale REALE: solo recensioni vere, pubblicate e con commento.
    supabase
      .from('reviews')
      .select('id, rating, comment, created_at, products ( title_it, title_en, slug )')
      .eq('status', 'published')
      .gte('rating', 4)
      .neq('comment', '')
      .order('created_at', { ascending: false })
      .limit(3),
  ]);
  const products = (latest ?? []) as unknown as CardProduct[];
  const realReviews = (reviews ?? []) as unknown as { id: string; rating: number; comment: string; products: { title_it: string; title_en: string; slug: string } | null }[];

  const chips: [string, string][] = [
    [t('chips.vasi'), 'vaso'],
    [t('chips.ricambi'), 'ricambio'],
    [t('chips.miniature'), 'miniatura'],
    [t('chips.personalizzati'), ''],
  ];

  return (
    <div className="space-y-16">
      {sp.deleted && <p className="notice notice-ok" role="status">{acc('deleted')}</p>}

      {/* HERO: una promessa, una ricerca, una prova di fiducia */}
      <section className="grid items-center gap-8 md:grid-cols-[1.2fr_1fr]">
        <div>
          <h1 className="font-display text-5xl font-extrabold leading-[1.05] tracking-tight md:text-7xl">{t('heroTitle')}</h1>
          <p className="mt-5 max-w-xl text-lg text-ink-soft">{t('heroSub')}</p>
          <form action={`/${locale}/search`} method="get" role="search" className="mt-8 flex max-w-xl gap-2">
            <label htmlFor="hero-q" className="sr-only">{c('search')}</label>
            <input id="hero-q" name="q" type="search" className="field !py-3" placeholder={c('searchPlaceholder')} />
            <button type="submit" className="btn-primary !px-6">{c('search')}</button>
          </form>
          <p className="mt-4 flex flex-wrap items-center gap-2 text-sm text-ink-mute">
            <span>{t('popular')}:</span>
            {chips.map(([label, q]) => (
              <Link key={label} href={q ? `/search?q=${q}` : '/search?custom=1'} className="chip">{label}</Link>
            ))}
          </p>
        </div>
        <figure className="mx-auto w-full max-w-xs md:max-w-sm">
          <LayerObject className="h-auto w-full" />
          <figcaption className="mt-2 text-center text-sm text-ink-mute">{t('layerCaption')}</figcaption>
        </figure>
      </section>

      <section aria-label="Garanzie" className="card p-5">
        <TrustBar />
      </section>

      <section aria-labelledby="cats">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 id="cats" className="font-display text-2xl font-bold">{t('categories')}</h2>
          <Link href="/search" className="text-sm font-semibold underline">{t('viewAll')}</Link>
        </div>
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {categories?.map((cat, i) => (
            <li key={cat.slug}>
              <CategoryTile slug={cat.slug} name={pickLocalized(locale, cat.name_it, cat.name_en)} index={i} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="latest">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 id="latest" className="font-display text-2xl font-bold">{t('latest')}</h2>
          {products.length > 0 && <Link href="/search" className="text-sm font-semibold underline">{t('viewAll')}</Link>}
        </div>
        {products.length === 0 ? (
          <p className="notice">{t('noProducts')}</p>
        ) : (
          <ul className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {products.map((p) => (<li key={p.slug}><ProductCard product={p} /></li>))}
          </ul>
        )}
      </section>

      <section aria-labelledby="how-h">
        <h2 id="how-h" className="mb-6 font-display text-2xl font-bold">{t('howTitle')}</h2>
        <ol className="grid gap-6 md:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <li key={n} className="relative border-t-4 border-ink pt-4">
              <span className="absolute -top-1 right-0 font-display text-5xl font-extrabold text-print/30" aria-hidden="true">{n}</span>
              <h3 className="font-display text-xl font-bold">{t(`how${n}t` as 'how1t')}</h3>
              <p className="mt-1 text-ink-soft">{t(`how${n}d` as 'how1d')}</p>
            </li>
          ))}
        </ol>
      </section>

      {realReviews.length >= 2 && (
        <section aria-labelledby="rev-h">
          <h2 id="rev-h" className="mb-4 font-display text-2xl font-bold">{t('reviewsTitle')}</h2>
          <ul className="grid gap-4 md:grid-cols-3">
            {realReviews.map((r) => (
              <li key={r.id} className="card flex flex-col gap-2 p-4">
                <Stars value={r.rating} />
                <p className="line-clamp-5">“{r.comment}”</p>
                {r.products && (
                  <Link href={`/product/${r.products.slug}`} className="mt-auto text-sm text-ink-mute underline">
                    {pickLocalized(locale, r.products.title_it, r.products.title_en)}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="grid items-center gap-8 rounded-card bg-ink px-6 py-10 text-white md:grid-cols-2 md:px-12">
        <div>
          <h2 className="font-display text-3xl font-bold">{t('sellTitle')}</h2>
          <p className="mt-2 text-white/80">{t('sellText')}</p>
          <Link href="/seller/onboarding" className="btn-primary mt-6">{t('sellCta')}</Link>
        </div>
        <div>
          <h3 className="sr-only">{t('sellBenefitsTitle')}</h3>
          <ul className="space-y-3 text-white/90">
            {(['sellB1', 'sellB2', 'sellB3', 'sellB4'] as const).map((k) => (
              <li key={k} className="flex gap-3">
                <svg viewBox="0 0 20 20" width="20" height="20" className="mt-0.5 shrink-0" aria-hidden="true"><path d="M7.7 14.3L3.4 10l1.4-1.4 2.9 2.9 7.5-7.5L16.6 5.4z" fill="#F28C28" /></svg>
                <span>{t(k, { pct: config.default_commission_bps / 100 })}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <Faq />
    </div>
  );
}
