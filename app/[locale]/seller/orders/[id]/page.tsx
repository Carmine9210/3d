import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { requireSeller } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import SellerOrderCard, { type SellerOrder } from '@/components/SellerOrderCard';
import OrderMessages from '@/components/OrderMessages';

export default async function SellerOrderDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const locale = await getLocale();
  const { store } = await requireSeller(locale);
  const t = await getTranslations('seller');
  const c = await getTranslations('common');
  const o = await getTranslations('orders');
  const rf = await getTranslations('refunds');
  const supabase = await createClient();

  const { data: order } = await supabase
    .from('orders')
    .select('id, status, total_cents, refunded_cents, discount_cents, coupon_code, currency, created_at, pickup, tracking_code, carrier, shipping_address, order_items ( id, title_snapshot, variant_snapshot, quantity, customization_text )')
    .eq('id', id)
    .eq('store_id', store.id)
    .maybeSingle();
  if (!order || order.status === 'pending_payment' || order.status === 'cancelled') notFound();

  const { data: req } = await supabase.from('refund_requests').select('id, reason, details').eq('order_id', order.id).eq('status', 'open').maybeSingle();
  const back = `/seller/orders/${order.id}`;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/seller/orders" className="text-sm underline">← {t('orders')}</Link>
      <h1 className="font-display text-3xl font-bold">{o('order')} #{order.id.slice(0, 8)}</h1>
      {sp.saved && <p className="notice notice-ok" role="status">{c('saved')}</p>}
      {sp.error === 'tracking' && <p className="notice notice-error" role="alert">{t('trackingCode')}</p>}
      {sp.error && sp.error in { amount: 1, invalid: 1, exceeds: 1, nothing_left: 1, not_refundable: 1, stripe: 1 } && (
        <p className="notice notice-error" role="alert">{rf(`errors.${sp.error}`)}</p>
      )}
      <SellerOrderCard ord={order as unknown as SellerOrder} openRequest={req ?? undefined} returnTo={back} />
      <OrderMessages orderId={order.id} role="seller" returnTo={back} error={sp.msg} />
    </div>
  );
}
