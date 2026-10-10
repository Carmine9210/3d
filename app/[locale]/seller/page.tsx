import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { requireSeller } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { syncVendorStripeStatus } from '@/lib/stripe/sync';
import { formatPrice, pickLocalized } from '@/lib/utils';

export default async function SellerDashboard({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const locale = await getLocale();
  const { vendor, store } = await requireSeller(locale);
  const sp = await searchParams;
  const t = await getTranslations('seller');
  const supabase = await createClient();

  let chargesEnabled = vendor.charges_enabled;
  let payoutsEnabled = vendor.payouts_enabled;
  if (vendor.stripe_account_id && (sp.stripe === 'return' || !chargesEnabled)) {
    try {
      const s = await syncVendorStripeStatus(vendor.id, vendor.stripe_account_id);
      chargesEnabled = s.chargesEnabled;
      payoutsEnabled = s.payoutsEnabled;
    } catch {
      /* Stripe non raggiungibile: si mostra lo stato in cache */
    }
  }

  const since = new Date();
  since.setDate(since.getDate() - 29);
  const [{ data: viewRows }, { data: orders }, { count: publishedCount }, { count: productCount }] = await Promise.all([
    supabase.from('product_view_daily').select('views, products!inner ( store_id )').eq('products.store_id', store.id).gte('day', since.toISOString().slice(0, 10)),
    supabase.from('orders').select('status, subtotal_cents, discount_cents, platform_fee_cents').eq('store_id', store.id),
    supabase.from('products').select('id', { count: 'exact', head: true }).eq('store_id', store.id).eq('status', 'published'),
    supabase.from('products').select('id', { count: 'exact', head: true }).eq('store_id', store.id),
  ]);
  const counted = (orders ?? []).filter((o) => ['paid', 'in_production', 'shipped', 'delivered'].includes(o.status));
  // Netto venditore: subtotale − sconti − commissione (spedizione esclusa)
  const revenue = counted.reduce((s, o) => s + o.subtotal_cents - o.discount_cents - o.platform_fee_cents, 0);
  const toFulfil = (orders ?? []).filter((o) => ['paid', 'in_production'].includes(o.status)).length;
  const ready = chargesEnabled;
  const views30 = (viewRows ?? []).reduce((n: number, r: { views: number }) => n + r.views, 0);

  // Scorte basse (soglia scelta dal venditore) e modalità ferie
  const { data: shopRow } = await supabase.from('stores').select('vacation_mode, low_stock_threshold').eq('id', store.id).single();
  const { data: lowRows } = await supabase
    .from('product_variants')
    .select('id, stock, material, color, size, products!inner ( id, title_it, title_en, store_id, status )')
    .eq('products.store_id', store.id)
    .in('products.status', ['published', 'pending'])
    .lte('stock', shopRow?.low_stock_threshold ?? 2)
    .order('stock')
    .limit(10);

  const stat = (label: string, value: string | number) => (
    <div className="card p-4">
      <dt className="text-sm text-ink-mute">{label}</dt>
      <dd className="mt-1 font-display text-3xl font-bold">{value}</dd>
    </div>
  );

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl font-bold">{store.name}</h1>
        <Link href={`/shop/${store.slug}`} className="text-sm underline">/shop/{store.slug}</Link>
      </header>

      {vendor.status === 'suspended' && <p className="notice notice-error" role="alert">{t('suspendedNotice')}</p>}
      {shopRow?.vacation_mode && (
        <p className="notice" role="status">{t('vacationOn')} <Link href="/seller/settings" className="font-semibold underline">{t('shopSettings')}</Link></p>
      )}
      {(lowRows ?? []).length > 0 && (
        <section className="card space-y-2 border-print p-5" aria-labelledby="low-h">
          <h2 id="low-h" className="font-display text-xl font-bold">{t('lowStockTitle')}</h2>
          <ul className="divide-y divide-line text-sm">
            {(lowRows ?? []).map((v) => {
              const pr = v.products as unknown as { id: string; title_it: string; title_en: string };
              return (
                <li key={v.id} className="flex items-center justify-between gap-3 py-2">
                  <Link href={`/seller/products/${pr.id}`} className="underline">
                    {pickLocalized(locale, pr.title_it, pr.title_en)}
                    {[v.material, v.color, v.size].filter(Boolean).length > 0 && <span className="text-ink-mute"> — {[v.material, v.color, v.size].filter(Boolean).join(' / ')}</span>}
                  </Link>
                  <span className={`rounded px-2 py-0.5 font-semibold ${v.stock === 0 ? 'bg-bad/10 text-bad' : 'bg-print-tint'}`}>{v.stock}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="card space-y-3 p-5" aria-labelledby="payout-h">
        <h2 id="payout-h" className="font-display text-xl font-bold">{t('payoutStatus')}</h2>
        <p className={ready ? 'text-ok' : 'text-ink-soft'}>{ready ? t('stripeReady') : t('stripeMissing')}</p>
        {ready && <p className="text-sm text-ink-mute">{t('payoutNote')} {payoutsEnabled ? '' : '⚠'}</p>}
        <p className="text-sm text-ink-mute">{t('commission', { pct: vendor.commission_bps / 100 })}</p>
        <div className="flex flex-wrap gap-2">
          {!ready && <a href={`/api/stripe/connect/onboarding?locale=${locale}`} className="btn-primary">{t('stripeConnect')}</a>}
          {vendor.stripe_account_id && <a href={`/api/stripe/connect/dashboard?locale=${locale}`} className="btn-ghost">{t('stripeManage')}</a>}
        </div>
      </section>

      <section aria-label={t('dashboard')}>
        <dl className="grid grid-cols-2 gap-4 md:grid-cols-5">
          {stat(t('revenue'), formatPrice(revenue, 'EUR', locale))}
          {stat(t('ordersCount'), counted.length)}
          {stat(t('toShip'), toFulfil)}
          {stat(t('publishedCount'), publishedCount ?? 0)}
          {stat(t('views'), views30)}
        </dl>
        <p className="mt-2 text-xs text-ink-mute">{t('viewsNote')}</p>
      </section>

      {(productCount ?? 0) === 0 && (
        <section className="card space-y-2 p-5">
          <p>{t('noProducts')}</p>
          <Link href="/seller/products/new" className="btn-primary">{t('newProduct')}</Link>
        </section>
      )}
    </div>
  );
}
