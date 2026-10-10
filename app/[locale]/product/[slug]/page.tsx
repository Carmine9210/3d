import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/auth';
import { getAppConfig } from '@/lib/config';
import { addToCart } from '@/lib/actions/cart';
import { toggleFavorite } from '@/lib/actions/social';
import { estimateDelivery, formatDeliveryRange } from '@/lib/delivery';
import { formatPrice, pickLocalized, publicImageUrl } from '@/lib/utils';
import Stars from '@/components/Stars';
import SubmitButton from '@/components/SubmitButton';
import ReportForm from '@/components/ReportForm';
import Gallery from '@/components/Gallery';
import ProductCard, { type CardProduct } from '@/components/ProductCard';
import { siteUrl } from '@/lib/site';

type Props = {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
};

async function loadProduct(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('products')
    .select(
      `*, stores!inner ( id, slug, name, city, region, status, avg_rating, review_count, vacation_mode, vacation_message ),
       product_variants ( id, material, color, size, finish, price_delta_cents, stock ),
       product_images ( id, storage_path, alt, sort_order ),
       categories ( slug, name_it, name_en )`,
    )
    .eq('slug', slug)
    .eq('status', 'published')
    .eq('stores.status', 'active')
    .maybeSingle();
  return data;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const p = await loadProduct(slug);
  if (!p) return {};
  const title = pickLocalized(locale, p.title_it, p.title_en);
  const img = [...(p.product_images ?? [])].sort((a, b) => a.sort_order - b.sort_order)[0];
  return {
    title,
    description: pickLocalized(locale, p.description_it, p.description_en).slice(0, 160),
    alternates: { canonical: `/${locale}/product/${slug}` },
    openGraph: img ? { images: [publicImageUrl(img.storage_path)] } : undefined,
  };
}

export default async function ProductPage({ params, searchParams }: Props) {
  const { locale, slug } = await params;
  const sp = await searchParams;
  const t = await getTranslations('product');
  const c = await getTranslations('common');
  const cart = await getTranslations('cart');
  const p = await loadProduct(slug);
  if (!p) notFound();

  const supabase = await createClient();
  const viewer = await getViewer();
  const config = await getAppConfig();
  const store = p.stores as unknown as { id: string; slug: string; name: string; city: string | null; avg_rating: number; review_count: number; vacation_mode: boolean; vacation_message: string | null };

  // Conteggio visite anonimo e aggregato per giorno (nessun cookie). Non conta il proprietario dello shop.
  const { data: owner } = viewer ? await supabase.rpc('owns_store', { p_store_id: store.id }) : { data: false };
  if (!owner) await supabase.rpc('track_product_view', { p_product_id: p.id });

  const title = pickLocalized(locale, p.title_it, p.title_en);
  const description = pickLocalized(locale, p.description_it, p.description_en);
  const images = [...(p.product_images ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const variants = p.product_variants ?? [];
  const category = p.categories as unknown as { slug: string; name_it: string; name_en: string } | null;

  const [{ data: reviews }, { data: related }, favorite] = await Promise.all([
    supabase.from('reviews').select('id, rating, comment, created_at, seller_reply').eq('product_id', p.id).eq('status', 'published').order('created_at', { ascending: false }).limit(20),
    supabase
      .from('products')
      .select('slug, title_it, title_en, base_price_cents, currency, avg_rating, review_count, production_days, is_customizable, stores!inner(name, city, status), product_images(storage_path, sort_order), product_variants(stock)')
      .eq('store_id', store.id)
      .eq('status', 'published')
      .neq('id', p.id)
      .limit(4),
    viewer ? supabase.from('favorites').select('id').eq('user_id', viewer.id).eq('product_id', p.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const label = (v: (typeof variants)[number]) => {
    const parts = [v.material, v.color, v.size, v.finish].filter(Boolean).join(' / ') || title;
    const delta = v.price_delta_cents ? ` (${v.price_delta_cents > 0 ? '+' : ''}${formatPrice(v.price_delta_cents, p.currency, locale)})` : '';
    return `${parts}${delta}${v.stock < 1 ? ` — ${t('outOfStock')}` : ''}`;
  };
  const firstAvailable = variants.find((v) => v.stock > 0);
  const totalStock = variants.reduce((s, v) => s + v.stock, 0);
  const inStockTotal = totalStock > 0;
  const lowStock = inStockTotal && totalStock <= 5;

  const eta = estimateDelivery(p.production_days);
  const etaText = formatDeliveryRange(eta.min, eta.max, locale);
  const shippingLine =
    p.base_price_cents >= config.free_shipping_over_cents
      ? cart('free')
      : t('shippingFrom', { amount: formatPrice(config.shipping_flat_cents, p.currency, locale) });

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: title,
    description,
    image: images.map((i) => publicImageUrl(i.storage_path)),
    offers: {
      '@type': 'Offer',
      priceCurrency: p.currency,
      price: (p.base_price_cents / 100).toFixed(2),
      availability: inStockTotal ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    },
    ...(p.review_count > 0 ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: p.avg_rating, reviewCount: p.review_count } } : {}),
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: t('home'), item: `${siteUrl()}/${locale}` },
      ...(category ? [{ '@type': 'ListItem', position: 2, name: pickLocalized(locale, category.name_it, category.name_en), item: `${siteUrl()}/${locale}/category/${category.slug}` }] : []),
      { '@type': 'ListItem', position: category ? 3 : 2, name: title },
    ],
  };

  return (
    <article className="space-y-12 pb-24 md:pb-0">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd).replace(/</g, '\\u003c') }} />

      <nav aria-label="Breadcrumb" className="-mb-6 text-sm text-ink-mute">
        <ol className="flex flex-wrap gap-1">
          <li><Link href="/" className="hover:underline">{t('home')}</Link> ›</li>
          {category && (<li><Link href={`/category/${category.slug}`} className="hover:underline">{pickLocalized(locale, category.name_it, category.name_en)}</Link> ›</li>)}
          <li aria-current="page" className="text-ink-soft">{title}</li>
        </ol>
      </nav>

      {sp.added && (
        <div className="notice notice-ok flex flex-wrap items-center justify-between gap-3" role="status">
          <span>{t('added')}</span>
          <Link href="/cart" className="btn-dark !py-1.5">{c('cart')} →</Link>
        </div>
      )}
      {sp.error === 'stock' && <p className="notice notice-error" role="alert">{t('outOfStock')}</p>}
      {sp.error === 'vacation' && <p className="notice notice-error" role="alert">{t('vacation', { store: store.name })}</p>}
      {sp.reported && <p className="notice notice-ok" role="status">{t('reportSent')}</p>}

      <div className="grid gap-8 md:grid-cols-2">
        <Gallery
          images={images.map((i) => ({ src: publicImageUrl(i.storage_path), alt: i.alt || title }))}
          emptyLabel={t('noImage')}
          labels={images.slice(0, 5).map((_, i) => t('gallery', { n: i + 1, total: images.length }))}
        />

        <div className="space-y-5">
          <div>
            <h1 className="font-display text-4xl font-bold leading-tight">{title}</h1>
            {p.review_count > 0 && (
              <p className="mt-2 flex items-center gap-2 text-sm"><Stars value={Number(p.avg_rating)} /> {t('reviewsSummary', { rating: p.avg_rating, n: p.review_count })}</p>
            )}
          </div>

          <div>
            <p className="text-4xl font-extrabold">{formatPrice(p.base_price_cents, p.currency, locale)}</p>
            <p className="mt-1 text-sm text-ink-mute">{shippingLine} · {t('freeShippingOver', { amount: formatPrice(config.free_shipping_over_cents, p.currency, locale) })}</p>
          </div>

          <div id="buy" className="scroll-mt-24 space-y-4">
            {store.vacation_mode ? (
              <div className="notice" role="status">
                <p className="font-semibold">{t('vacation', { store: store.name })}</p>
                {store.vacation_message && <p className="mt-1 text-sm">{store.vacation_message}</p>}
              </div>
            ) : inStockTotal ? (
              <form action={addToCart} className="space-y-4">
                <input type="hidden" name="product_slug" value={p.slug} />
                <div>
                  <label className="label" htmlFor="variant">{t('variant')}</label>
                  <select id="variant" name="variant_id" className="field" defaultValue={firstAvailable?.id} required>
                    {variants.map((v) => (<option key={v.id} value={v.id} disabled={v.stock < 1}>{label(v)}</option>))}
                  </select>
                </div>
                {p.is_customizable && (
                  <div>
                    <label className="label" htmlFor="custom">{t('customization')}</label>
                    <input id="custom" name="customization_text" maxLength={200} className="field" placeholder={t('customizationPlaceholder')} />
                    {p.customization_note && <p className="mt-1 text-sm text-ink-mute">{p.customization_note}</p>}
                  </div>
                )}
                <div className="flex items-end gap-3">
                  <div className="w-24">
                    <label className="label" htmlFor="qty">{c('quantity')}</label>
                    <input id="qty" name="quantity" type="number" min={1} max={99} defaultValue={1} className="field" />
                  </div>
                  <SubmitButton className="btn-primary flex-1 !py-3 text-lg">{t('addToCart')}</SubmitButton>
                </div>
                {lowStock && <p className="text-sm font-semibold text-print-dark">{t('lowStock', { n: totalStock })}</p>}
                {!viewer && <p className="text-xs text-ink-mute">{t('guestNote')}</p>}
              </form>
            ) : (
              <p className="notice">{t('outOfStock')}</p>
            )}

            <p className="flex flex-wrap items-center gap-x-2 text-sm">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="shrink-0"><path d="M3 7l9-4 9 4v10l-9 4-9-4V7z" fill="none" stroke="#0B1F3A" strokeWidth="2" /></svg>
              <span className="font-semibold">{t('delivery', { range: etaText })}</span>
              {p.local_pickup && <span className="text-ink-mute">· {t('pickupOrDelivery')}</span>}
            </p>

            <ul className="space-y-1.5 rounded-card border border-line bg-white p-3 text-sm">
              {(['trust1', 'trust2', 'trust3'] as const).map((k) => (
                <li key={k} className="flex gap-2">
                  <svg viewBox="0 0 20 20" width="18" height="18" className="mt-0.5 shrink-0" aria-hidden="true"><path d="M7.7 14.3L3.4 10l1.4-1.4 2.9 2.9 7.5-7.5L16.6 5.4z" fill="#1E7F4F" /></svg>
                  {t(k)}
                </li>
              ))}
            </ul>
          </div>

          <div className="card flex items-center justify-between gap-3 p-3 text-sm">
            <p>
              <span className="text-ink-mute">{t('madeBy')}</span>{' '}
              <Link href={`/shop/${store.slug}`} className="font-semibold underline">{store.name}</Link>
              {store.city ? <span className="text-ink-mute">, {store.city}</span> : null}
              {store.review_count > 0 && <span className="ml-2 inline-flex items-center gap-1"><Stars value={Number(store.avg_rating)} /> <span className="text-ink-mute">({store.review_count})</span></span>}
            </p>
            <Link href={`/shop/${store.slug}`} className="btn-ghost !py-1 text-sm">{t('visitShop')}</Link>
          </div>

          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-ink-mute">{t('production')}</dt>
            <dd>{c('days', { n: p.production_days })}</dd>
          </dl>

          <div className="flex flex-wrap items-center gap-4">
            {viewer && (
              <form action={toggleFavorite}>
                <input type="hidden" name="product_id" value={p.id} />
                <input type="hidden" name="product_slug" value={p.slug} />
                <button type="submit" className="btn-ghost !py-1.5 text-sm" aria-pressed={Boolean(favorite.data)}>
                  {favorite.data ? t('unfavorite') : t('favorite')}
                </button>
              </form>
            )}
            <ReportForm targetType="product" targetId={p.id} returnTo={`/product/${p.slug}`} label={t('report')} />
          </div>
          <p className="text-xs text-ink-mute">{t('safetyNote')}</p>
        </div>
      </div>

      {description && (
        <section>
          <h2 className="mb-2 font-display text-2xl font-bold">{t('description')}</h2>
          <p className="max-w-prose whitespace-pre-line leading-relaxed text-ink-soft">{description}</p>
        </section>
      )}

      <section>
        <h2 className="mb-3 font-display text-2xl font-bold">{t('reviews')}</h2>
        {(reviews ?? []).length === 0 ? (
          <p className="text-ink-soft">{t('noReviews')}</p>
        ) : (
          <ul className="max-w-prose space-y-4">
            {reviews!.map((r) => (
              <li key={r.id} className="card p-4">
                <Stars value={r.rating} />
                {r.comment && <p className="mt-2">{r.comment}</p>}
                <p className="mt-1 text-xs text-ink-mute">{new Date(r.created_at).toLocaleDateString(locale)}</p>
                {r.seller_reply && (
                  <div className="mt-3 border-l-4 border-print bg-print-tint/50 px-3 py-2 text-sm">
                    <p className="text-xs font-semibold">{t('sellerReply', { store: store.name })}</p>
                    <p className="whitespace-pre-line">{r.seller_reply}</p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {(related ?? []).length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-2xl font-bold">{t('related')}</h2>
          <ul className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {(related as unknown as CardProduct[]).map((r) => (<li key={r.slug}><ProductCard product={r} /></li>))}
          </ul>
        </section>
      )}

      {/* Barra d'acquisto fissa su mobile: il prezzo e l'azione restano sempre a portata di pollice. */}
      {inStockTotal && !store.vacation_mode && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t border-line bg-white/95 px-4 py-3 backdrop-blur md:hidden">
          <span className="text-xl font-extrabold">{formatPrice(p.base_price_cents, p.currency, locale)}</span>
          <a href="#buy" className="btn-primary flex-1">{t('buyBarCta')}</a>
        </div>
      )}
    </article>
  );
}
