import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { requireSeller } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatPrice, pickLocalized } from '@/lib/utils';

export default async function SellerProducts() {
  const locale = await getLocale();
  const { store } = await requireSeller(locale);
  const t = await getTranslations('seller');
  const supabase = await createClient();
  const { data: products } = await supabase
    .from('products')
    .select('id, title_it, title_en, base_price_cents, currency, status, product_variants ( stock )')
    .eq('store_id', store.id)
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold">{t('products')}</h1>
        <Link href="/seller/products/new" className="btn-primary">{t('newProduct')}</Link>
      </div>
      {(products ?? []).length === 0 ? (
        <p className="notice">{t('noProducts')}</p>
      ) : (
        <ul className="space-y-2">
          {products!.map((p) => {
            const stock = (p.product_variants ?? []).reduce((s, v) => s + v.stock, 0);
            return (
              <li key={p.id}>
                <Link href={`/seller/products/${p.id}`} className="card flex flex-wrap items-center justify-between gap-2 p-4 hover:border-ink">
                  <span className="font-semibold">{pickLocalized(locale, p.title_it, p.title_en)}</span>
                  <span className="text-sm text-ink-mute">{stock} pz</span>
                  <span className="rounded bg-print-tint px-2 py-0.5 text-sm">{t(`productStatus.${p.status}`)}</span>
                  <span className="font-bold">{formatPrice(p.base_price_cents, p.currency, locale)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
