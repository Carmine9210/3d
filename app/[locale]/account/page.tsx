import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatPrice } from '@/lib/utils';
import ProductCard, { type CardProduct } from '@/components/ProductCard';

export default async function AccountPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const locale = await getLocale();
  const viewer = await requireUser(locale);
  const t = await getTranslations('account');
  const o = await getTranslations('orders');
  const c = await getTranslations('common');
  const au = await getTranslations('auth');
  const supabase = await createClient();

  const [{ data: orders }, { data: favs }] = await Promise.all([
    supabase
      .from('orders')
      .select('id, status, total_cents, currency, created_at, stores ( name )')
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false }),
    supabase
      .from('favorites')
      .select('products ( slug, title_it, title_en, base_price_cents, currency, avg_rating, review_count, production_days, status, stores ( name, city ), product_images ( storage_path, sort_order ) )')
      .order('created_at', { ascending: false }),
  ]);
  const favorites = (favs ?? []).map((f: any) => f.products).filter((p: any) => p && p.status === 'published') as CardProduct[];

  return (
    <div className="space-y-10">
      <header>
        <h1 className="font-display text-3xl font-bold">{viewer.displayName || c('account')}</h1>
        <p className="text-ink-soft">{viewer.email}</p>
        <nav className="mt-3 flex flex-wrap gap-2 text-sm" aria-label={c('account')}>
          <Link href="/account/profile" className="btn-ghost !py-1.5">{t('editProfile')}</Link>
          <Link href="/account/addresses" className="btn-ghost !py-1.5">{t('manageAddresses')}</Link>
          <Link href="/reset-password" className="btn-ghost !py-1.5">{au('resetTitle')}</Link>
        </nav>
      </header>
      {sp.password && <p className="notice notice-ok" role="status">{au('passwordChanged')}</p>}

      <section aria-labelledby="orders-h">
        <h2 id="orders-h" className="mb-3 font-display text-2xl font-bold">{t('orders')}</h2>
        {(orders ?? []).length === 0 ? (
          <p className="notice">{t('noOrders')}</p>
        ) : (
          <ul className="space-y-2">
            {(orders as any[]).map((ord) => (
              <li key={ord.id}>
                <Link href={`/account/orders/${ord.id}`} className="card flex flex-wrap items-center justify-between gap-2 p-4 hover:border-ink">
                  <span className="font-semibold">{ord.stores?.name}</span>
                  <span className="text-sm text-ink-mute">{new Date(ord.created_at).toLocaleDateString(locale)}</span>
                  <span className="rounded bg-print-tint px-2 py-0.5 text-sm">{o(`status.${ord.status}`)}</span>
                  <span className="font-bold">{formatPrice(ord.total_cents, ord.currency, locale)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="fav-h">
        <h2 id="fav-h" className="mb-3 font-display text-2xl font-bold">{t('favorites')}</h2>
        {favorites.length === 0 ? (
          <p className="notice">{t('noFavorites')}</p>
        ) : (
          <ul className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {favorites.map((p) => (<li key={p.slug}><ProductCard product={p} /></li>))}
          </ul>
        )}
      </section>

      <p className="text-sm text-ink-mute">
        {t('deleteData')} <Link href="/account/profile" className="font-semibold underline">{t('editProfile')}</Link>
      </p>
    </div>
  );
}
