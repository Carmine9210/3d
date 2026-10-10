import { getLocale, getTranslations } from 'next-intl/server';
import { requireSeller } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatPrice, pickLocalized } from '@/lib/utils';
import { buildDailySeries, buildFunnel, conversionRate } from '@/lib/analytics';

export default async function SellerAnalytics() {
  const locale = await getLocale();
  const { store } = await requireSeller(locale);
  const t = await getTranslations('seller');
  const supabase = await createClient();

  const since = new Date();
  since.setDate(since.getDate() - 29);
  const sinceDay = since.toISOString().slice(0, 10);

  const [{ data: views }, { data: orders }, { data: funnelRows }] = await Promise.all([
    supabase
      .from('product_view_daily')
      .select('day, views, product_id, products!inner ( store_id, title_it, title_en )')
      .eq('products.store_id', store.id)
      .gte('day', sinceDay),
    supabase
      .from('orders')
      .select('status, subtotal_cents, discount_cents, platform_fee_cents, created_at, order_items ( product_id, title_snapshot, quantity )')
      .eq('store_id', store.id)
      .in('status', ['paid', 'in_production', 'shipped', 'delivered'])
      .gte('created_at', since.toISOString()),
    supabase.from('store_funnel_daily').select('cart_adds, checkouts').eq('store_id', store.id).gte('day', sinceDay),
  ]);

  const viewRows = (views ?? []) as unknown as { day: string; views: number; product_id: string; products: { title_it: string; title_en: string } }[];
  const totalViews = viewRows.reduce((s, r) => s + r.views, 0);
  const paid = orders ?? [];
  const revenue = paid.reduce((s, o) => s + o.subtotal_cents - o.discount_cents - o.platform_fee_cents, 0);
  const units = paid.reduce((s, o) => s + (o.order_items ?? []).reduce((n: number, i: { quantity: number }) => n + i.quantity, 0), 0);
  const conv = conversionRate(paid.length, totalViews);

  const series = buildDailySeries(viewRows.map((r) => ({ day: r.day, value: r.views })), 30);
  const max = Math.max(1, ...series.map((d) => d.value));

  const perProduct = new Map<string, { title: string; views: number }>();
  for (const r of viewRows) {
    const cur = perProduct.get(r.product_id) ?? { title: pickLocalized(locale, r.products.title_it, r.products.title_en), views: 0 };
    cur.views += r.views;
    perProduct.set(r.product_id, cur);
  }
  const unitsByProduct = new Map<string, number>();
  for (const o of paid) for (const i of (o.order_items ?? []) as { product_id: string | null; quantity: number }[]) {
    if (i.product_id) unitsByProduct.set(i.product_id, (unitsByProduct.get(i.product_id) ?? 0) + i.quantity);
  }
  const cartAdds = (funnelRows ?? []).reduce((n, r) => n + r.cart_adds, 0);
  const checkouts = (funnelRows ?? []).reduce((n, r) => n + r.checkouts, 0);
  const funnel = buildFunnel(totalViews, cartAdds, checkouts, paid.length);
  const top = [...perProduct.entries()].sort((a, b) => b[1].views - a[1].views).slice(0, 8);

  const stat = (label: string, value: string | number, note?: string) => (
    <div className="card p-4">
      <dt className="text-sm text-ink-mute">{label}</dt>
      <dd className="mt-1 font-display text-3xl font-bold">{value}</dd>
      {note && <p className="mt-1 text-xs text-ink-mute">{note}</p>}
    </div>
  );

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl font-bold">{t('analytics')}</h1>
        <p className="text-ink-soft">{t('last30')}</p>
      </header>

      <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {stat(t('views'), totalViews)}
        {stat(t('ordersCount'), paid.length)}
        {stat(t('conversion'), `${conv.toFixed(1)}%`, t('conversionNote'))}
        {stat(t('revenue'), formatPrice(revenue, 'EUR', locale))}
      </dl>
      <p className="-mt-4 text-sm text-ink-mute">{t('unitsSold')}: {units}</p>

      {totalViews === 0 ? (
        <p className="notice">{t('noData')}</p>
      ) : (
        <>
          <section aria-labelledby="chart-h">
            <h2 id="chart-h" className="mb-3 font-display text-xl font-bold">{t('viewsPerDay')}</h2>
            <div className="card flex h-40 items-end gap-0.5 p-3" role="img" aria-label={`${t('viewsPerDay')}: ${totalViews}`}>
              {series.map((d) => (
                <div key={d.day} title={`${d.day}: ${d.value}`} className="flex-1 rounded-t bg-print" style={{ height: `${Math.max(2, (d.value / max) * 100)}%`, opacity: d.value ? 1 : 0.25 }} />
              ))}
            </div>
          </section>

          <section aria-labelledby="funnel-h">
            <h2 id="funnel-h" className="mb-1 font-display text-xl font-bold">{t('funnel')}</h2>
            <p className="mb-3 text-sm text-ink-mute">{t('funnelNote')}</p>
            <ol className="card space-y-3 p-4">
              {funnel.map((step, i) => (
                <li key={step.key}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="font-semibold">{t(`funnelSteps.${step.key}`)}</span>
                    <span>{step.value}{i > 0 && <span className="ml-2 text-ink-mute">{step.pct.toFixed(0)}%</span>}</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded bg-line">
                    <div className="h-full rounded bg-print" style={{ width: `${funnel[0].value ? Math.max(2, (step.value / funnel[0].value) * 100) : 0}%` }} />
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="top-h">
            <h2 id="top-h" className="mb-3 font-display text-xl font-bold">{t('topProducts')}</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[24rem] text-left text-sm">
                <thead><tr className="border-b border-line"><th className="py-2">{t('products')}</th><th>{t('views')}</th><th>{t('unitsSold')}</th></tr></thead>
                <tbody>
                  {top.map(([id, p]) => (
                    <tr key={id} className="border-b border-line">
                      <td className="py-2">{p.title}</td><td>{p.views}</td><td>{unitsByProduct.get(id) ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
