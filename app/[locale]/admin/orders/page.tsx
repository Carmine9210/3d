import { getLocale, getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { formatPrice } from '@/lib/utils';
import ExportCsvForm from '@/components/ExportCsvForm';

export default async function AdminOrders() {
  const locale = await getLocale();
  const t = await getTranslations('admin');
  const o = await getTranslations('orders');
  const c = await getTranslations('common');
  const supabase = await createClient();
  const { data: orders } = await supabase
    .from('orders')
    .select('id, status, total_cents, refunded_cents, platform_fee_cents, currency, created_at, stores ( name )')
    .order('created_at', { ascending: false })
    .limit(100);
  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-bold">{t('orders')}</h1>
      <ExportCsvForm action="/api/admin/orders-csv" />
      {(orders ?? []).length === 0 && <p className="notice">{t('nothing')}</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] text-left text-sm">
          <thead>
            <tr className="border-b border-line"><th className="py-2">{c('date')}</th><th>{c('store')}</th><th>{c('status')}</th><th>{c('total')}</th><th>{t('fees')}</th><th>{t('refunds')}</th></tr>
          </thead>
          <tbody>
            {(orders as any[] | null)?.map((ord) => (
              <tr key={ord.id} className="border-b border-line">
                <td className="py-2">{new Date(ord.created_at).toLocaleDateString(locale)}</td>
                <td>{ord.stores?.name}</td>
                <td>{o(`status.${ord.status}`)}</td>
                <td>{formatPrice(ord.total_cents, ord.currency, locale)}</td>
                <td>{formatPrice(ord.platform_fee_cents, ord.currency, locale)}</td>
                <td>{ord.refunded_cents > 0 ? formatPrice(ord.refunded_cents, ord.currency, locale) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
