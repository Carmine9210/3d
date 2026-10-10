import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { submitReview } from '@/lib/actions/social';
import { requestRefund } from '@/lib/actions/refunds';
import { REFUND_REASONS, isRefundable, remainingRefundable } from '@/lib/refunds';
import { formatPrice } from '@/lib/utils';
import SubmitButton from '@/components/SubmitButton';
import Stars from '@/components/Stars';
import OrderMessages from '@/components/OrderMessages';

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const locale = await getLocale();
  const viewer = await requireUser(locale);
  const o = await getTranslations('orders');
  const rf = await getTranslations('refunds');
  const c = await getTranslations('common');
  const t = await getTranslations('checkout');
  const cp = await getTranslations('coupons');
  const supabase = await createClient();

  const { data: order } = await supabase
    .from('orders')
    .select('*, stores ( name, slug ), order_items ( id, product_id, title_snapshot, variant_snapshot, unit_price_cents, quantity, customization_text )')
    .eq('id', id)
    .eq('customer_id', viewer.id)
    .maybeSingle();
  if (!order) notFound();

  const { data: myReviews } = await supabase.from('reviews').select('product_id, rating, comment').eq('order_id', order.id);
  const reviewed = new Map((myReviews ?? []).map((r) => [r.product_id, r]));
  const canReview = ['shipped', 'delivered'].includes(order.status);
  const { data: requests } = await supabase
    .from('refund_requests')
    .select('id, status, reason, created_at')
    .eq('order_id', order.id)
    .order('created_at', { ascending: false });
  const openRequest = (requests ?? []).find((r) => r.status === 'open');
  const lastRequest = (requests ?? [])[0];
  const canRequestRefund = isRefundable(order.status) && !openRequest && remainingRefundable(order.total_cents, order.refunded_cents) > 0;
  const addr = order.shipping_address as unknown as Record<string, string> | null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/account" className="text-sm underline">← {c('back')}</Link>
      <h1 className="font-display text-3xl font-bold">{o('order')} · {(order.stores as any)?.name}</h1>
      {sp.reviewed && <p className="notice notice-ok" role="status">{c('saved')}</p>}
      <p><span className="rounded bg-print-tint px-2 py-0.5">{o(`status.${order.status}`)}</span></p>

      <ul className="card divide-y divide-line">
        {order.order_items.map((i: any) => (
          <li key={i.id} className="space-y-2 p-4">
            <div className="flex justify-between gap-4">
              <div>
                <p className="font-semibold">{i.quantity} × {i.title_snapshot}</p>
                {i.variant_snapshot && <p className="text-sm text-ink-mute">{i.variant_snapshot}</p>}
                {i.customization_text && <p className="text-sm text-ink-mute">“{i.customization_text}”</p>}
              </div>
              <p className="font-semibold">{formatPrice(i.unit_price_cents * i.quantity, order.currency, locale)}</p>
            </div>
            {canReview && i.product_id && (
              reviewed.has(i.product_id) ? (
                <p className="flex items-center gap-2 text-sm text-ink-soft">{o('reviewed')} <Stars value={reviewed.get(i.product_id)!.rating} /></p>
              ) : (
                <details>
                  <summary className="cursor-pointer text-sm font-semibold underline">{o('leaveReview')}</summary>
                  <form action={submitReview} className="mt-2 space-y-3">
                    <input type="hidden" name="order_id" value={order.id} />
                    <input type="hidden" name="product_id" value={i.product_id} />
                    <div>
                      <label className="label" htmlFor={`rating-${i.id}`}>{o('rating')}</label>
                      <select id={`rating-${i.id}`} name="rating" className="field !w-32" defaultValue="5">
                        {[5, 4, 3, 2, 1].map((n) => (<option key={n} value={n}>{n} / 5</option>))}
                      </select>
                    </div>
                    <div>
                      <label className="label" htmlFor={`comment-${i.id}`}>{o('comment')}</label>
                      <textarea id={`comment-${i.id}`} name="comment" rows={3} maxLength={1500} className="field" />
                    </div>
                    <SubmitButton className="btn-dark">{o('submitReview')}</SubmitButton>
                  </form>
                </details>
              )
            )}
          </li>
        ))}
      </ul>

      <dl className="card grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 p-4 text-sm">
        {order.discount_cents > 0 && (
          <><dt>{cp('discount', { code: order.coupon_code ?? '' })}</dt><dd className="text-right text-ok">−{formatPrice(order.discount_cents, order.currency, locale)}</dd></>
        )}
        <dt>{c('total')}</dt><dd className="text-right font-bold">{formatPrice(order.total_cents, order.currency, locale)}</dd>
      </dl>

      {sp.refund === 'requested' && <p className="notice notice-ok" role="status">{rf('sent')}</p>}
      {(sp.refund === 'exists' || sp.refund === 'invalid' || sp.refund === 'rate') && (
        <p className="notice notice-error" role="alert">{rf(sp.refund as 'exists')}</p>
      )}
      {order.refunded_cents > 0 && (
        <p className="notice">{rf('refundedAmount', { amount: formatPrice(order.refunded_cents, order.currency, locale) })}</p>
      )}
      {lastRequest && (
        <p className="notice">
          {rf('status')}: <b>{rf(`statusValues.${lastRequest.status}`)}</b> · {rf(`reasons.${lastRequest.reason}`)}
        </p>
      )}
      {canRequestRefund && (
        <details className="card p-4">
          <summary className="cursor-pointer font-semibold underline">{rf('request')}</summary>
          <form action={requestRefund} className="mt-3 space-y-3">
            <input type="hidden" name="order_id" value={order.id} />
            <div>
              <label className="label" htmlFor="rf-reason">{rf('reasonLabel')}</label>
              <select id="rf-reason" name="reason" className="field" required>
                {REFUND_REASONS.map((r) => (<option key={r} value={r}>{rf(`reasons.${r}`)}</option>))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="rf-details">{rf('details')}</label>
              <textarea id="rf-details" name="details" rows={3} maxLength={1000} className="field" />
            </div>
            <SubmitButton className="btn-dark">{rf('send')}</SubmitButton>
          </form>
        </details>
      )}
      {order.tracking_code && (
        <p className="notice">{o('tracking')}: {order.carrier} · {order.tracking_code}</p>
      )}
      {order.status === 'pending_payment' && (
        <Link href="/checkout/pay" className="btn-primary">{t('payNow')}</Link>
      )}
      {!['pending_payment', 'cancelled'].includes(order.status) && (
        <OrderMessages orderId={order.id} role="customer" returnTo={`/account/orders/${order.id}`} error={sp.msg} />
      )}
      {addr && (
        <section>
          <h2 className="mb-1 font-display text-lg font-bold">{o('shipTo')}</h2>
          <address className="not-italic text-sm text-ink-soft">
            {addr.full_name}<br />{addr.line1}{addr.line2 ? `, ${addr.line2}` : ''}<br />{addr.postal_code} {addr.city} {addr.province} ({addr.country})
          </address>
        </section>
      )}
    </div>
  );
}
