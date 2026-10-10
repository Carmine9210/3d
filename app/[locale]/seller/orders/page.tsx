import { getLocale, getTranslations } from 'next-intl/server';
import { requireSeller } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import SellerOrderCard, { type SellerOrder } from '@/components/SellerOrderCard';
import ExportCsvForm from '@/components/ExportCsvForm';

export default async function SellerOrders({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const locale = await getLocale();
  const { store } = await requireSeller(locale);
  const sp = await searchParams;
  const t = await getTranslations('seller');
  const c = await getTranslations('common');
  const rf = await getTranslations('refunds');
  const supabase = await createClient();

  const { data: orders } = await supabase
    .from('orders')
    .select('id, status, total_cents, refunded_cents, discount_cents, coupon_code, platform_fee_cents, currency, created_at, pickup, tracking_code, carrier, shipping_address, order_items ( id, title_snapshot, variant_snapshot, quantity, customization_text )')
    .eq('store_id', store.id)
    .neq('status', 'pending_payment')
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false });

  const orderIds = (orders ?? []).map((x) => x.id);
  const { data: reqs } = orderIds.length
    ? await supabase.from('refund_requests').select('id, order_id, reason, details').in('order_id', orderIds).eq('status', 'open')
    : { data: [] as { id: string; order_id: string; reason: string; details: string | null }[] };
  const openByOrder = new Map((reqs ?? []).map((r) => [r.order_id, r]));
  // Messaggi non letti inviati dal cliente (o dall'assistenza) per ogni ordine
  const { data: unreadRows } = orderIds.length
    ? await supabase.from('order_messages').select('order_id').in('order_id', orderIds).neq('sender_role', 'seller').is('read_at', null)
    : { data: [] as { order_id: string }[] };
  const unreadByOrder = new Map<string, number>();
  for (const r of unreadRows ?? []) unreadByOrder.set(r.order_id, (unreadByOrder.get(r.order_id) ?? 0) + 1);
  const errKey = sp.error && sp.error in { amount: 1, invalid: 1, exceeds: 1, nothing_left: 1, not_refundable: 1, stripe: 1 } ? sp.error : null;

  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-bold">{t('orders')}</h1>
      <ExportCsvForm action="/api/seller/orders-csv" />
      {sp.saved && <p className="notice notice-ok" role="status">{c('saved')}</p>}
      {errKey && <p className="notice notice-error" role="alert">{rf(`errors.${errKey}`)}</p>}
      {sp.error === 'tracking' && <p className="notice notice-error" role="alert">{t('trackingCode')}</p>}
      {(orders ?? []).length === 0 && <p className="notice">{t('noOrders')}</p>}
      <ul className="space-y-3">
        {((orders ?? []) as unknown as SellerOrder[]).map((ord) => (
          <li key={ord.id}>
            <SellerOrderCard ord={ord} openRequest={openByOrder.get(ord.id)} unread={unreadByOrder.get(ord.id) ?? 0} returnTo="/seller/orders" showDetailLink />
          </li>
        ))}
      </ul>
    </div>
  );
}
