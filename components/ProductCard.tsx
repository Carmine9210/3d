import Image from 'next/image';
import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { formatPrice, pickLocalized, publicImageUrl } from '@/lib/utils';
import Stars from './Stars';

export type CardProduct = {
  slug: string;
  title_it: string;
  title_en: string;
  base_price_cents: number;
  currency: string;
  avg_rating: number;
  review_count: number;
  production_days: number;
  is_customizable?: boolean;
  stores?: { name: string; city: string | null } | null;
  product_images?: { storage_path: string; sort_order: number }[] | null;
  product_variants?: { stock: number }[] | null;
};

export default async function ProductCard({ product }: { product: CardProduct }) {
  const locale = await getLocale();
  const t = await getTranslations('common');
  const b = await getTranslations('badges');
  const title = pickLocalized(locale, product.title_it, product.title_en);
  const img = [...(product.product_images ?? [])].sort((a, c) => a.sort_order - c.sort_order)[0];

  const stock = product.product_variants ? product.product_variants.reduce((s, v) => s + v.stock, 0) : null;
  const soldOut = stock === 0;
  const low = stock !== null && stock > 0 && stock <= 3;

  return (
    <Link
      href={`/product/${product.slug}`}
      className={`card group flex h-full flex-col overflow-hidden transition-colors hover:border-ink ${soldOut ? 'opacity-70' : ''}`}
    >
      <div className="relative aspect-square bg-print-tint">
        {img ? (
          <Image
            src={publicImageUrl(img.storage_path)}
            alt={title}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full items-center justify-center" aria-hidden="true">
            <svg width="56" height="56" viewBox="0 0 28 28">
              <rect x="6" y="4" width="16" height="4" rx="2" fill="#0B1F3A" fillOpacity=".25" />
              <rect x="3" y="11" width="22" height="4" rx="2" fill="#F28C28" />
              <rect x="6" y="18" width="16" height="4" rx="2" fill="#0B1F3A" fillOpacity=".25" />
            </svg>
          </div>
        )}
        <div className="absolute left-2 top-2 flex flex-wrap gap-1">
          {soldOut && <span className="badge-ink">{b('soldOut')}</span>}
          {low && <span className="badge-print">{b('low')}</span>}
          {product.is_customizable && !soldOut && <span className="badge-mute">{b('custom')}</span>}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className="line-clamp-2 font-display text-lg font-semibold leading-snug">{title}</h3>
        {product.stores && (
          <p className="text-sm text-ink-mute">
            {product.stores.name}
            {product.stores.city ? `, ${product.stores.city}` : ''}
          </p>
        )}
        <div className="mt-auto flex items-end justify-between pt-2">
          <span className="text-lg font-bold">{formatPrice(product.base_price_cents, product.currency, locale)}</span>
          <span className="flex flex-col items-end gap-0.5 text-xs text-ink-mute">
            {product.review_count > 0 && <Stars value={Number(product.avg_rating)} />}
            <span>{t('days', { n: product.production_days })}</span>
          </span>
        </div>
      </div>
    </Link>
  );
}
