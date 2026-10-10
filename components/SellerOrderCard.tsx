import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { advanceOrder } from '@/lib/actions/seller';
import { refundOrderDirect, resolveRefundRequest } from '@/lib/actions/refunds';
import { isRefundable, remainingRefundable } from '@/lib/refunds';
import { formatPrice } from '@/lib/utils';
import SubmitButton from './SubmitButton';

export type SellerOrder = {
  id: string; status: string; total_cents: number; refunded_cents: number; currency: string; created_at: string;
  discount_cents?: number; coupon_code?: string | null;
  pickup: boolean; tracking_code: string | null; carrier: string | null; shipping_address: unknown;
  order_items: { id: string; title_snapshot: string; variant_snapshot: string | null; quantity: number; customization_text: string | null }[];
};
export type OpenRefund = { id: string; reason: string; details: string | null };

/** Scheda ordine lato venditore: articoli, indirizzo, rimborsi e avanzamento di stato. */
export default async function SellerOrderCard({
  ord,
  openRequest,
  unread = 0,
  returnTo,
  showDetailLink = false,
}: {
  ord: SellerOrder;
  openRequest?: OpenRefund;
  unread?: number;
  returnTo: string;
  showDetailLink?: boolean;
}) {
  const locale = await getLocale();
  const t = await getTranslations('seller');
  const o = await getTranslations('orders');
  const rf = await getTranslations('refunds');
  const m = await getTranslations('messages');
  const cp = await getTranslations('coupons');
  const a = ord.shipping_address as Record<string, string> | null;
  const openByOrder = new Map(openRequest ? [[ord.id, openRequest]] : []);
  return (
    <div className="card space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-ink-mute">{new Date(ord.created_at).toLocaleDateString(locale)}</span>
                <span className="rounded bg-print-tint px-2 py-0.5 text-sm">{o(`status.${ord.status}`)}</span>
                <span className="font-bold">{formatPrice(ord.total_cents, ord.currency, locale)}</span>
              </div>
              <ul className="text-sm">
                {ord.order_items.map((i) => (
                  <li key={i.id}>
                    {i.quantity} × {i.title_snapshot}
                    {i.variant_snapshot ? ` — ${i.variant_snapshot}` : ''}
                    {i.customization_text ? ` — “${i.customization_text}”` : ''}
                  </li>
                ))}
              </ul>
              {a && !ord.pickup && (
                <address className="not-italic text-sm text-ink-soft">
                  {a.full_name}, {a.line1}{a.line2 ? `, ${a.line2}` : ''}, {a.postal_code} {a.city} ({a.country})
                </address>
              )}
              {ord.pickup && <p className="text-sm text-ink-soft">{t('localPickup')}</p>}
              {(ord.discount_cents ?? 0) > 0 && (
                <p className="text-sm text-ok">{cp('discount', { code: ord.coupon_code ?? '' })}: −{formatPrice(ord.discount_cents!, ord.currency, locale)}</p>
              )}
              {ord.tracking_code && <p className="text-sm">{o('tracking')}: {ord.carrier} · {ord.tracking_code}</p>}
              {ord.refunded_cents > 0 && <p className="text-sm text-bad">{rf('refundedAmount', { amount: formatPrice(ord.refunded_cents, ord.currency, locale) })}</p>}

              {openByOrder.has(ord.id) && (
                <div className="rounded-card border border-print bg-print-tint p-3 text-sm">
                  <p className="font-semibold">{rf('openRequests')}: {rf(`reasons.${openByOrder.get(ord.id)!.reason}`)}</p>
                  {openByOrder.get(ord.id)!.details && <p className="mt-1 whitespace-pre-line">{openByOrder.get(ord.id)!.details}</p>}
                  <p className="mt-1 text-ink-soft">{rf('remaining', { amount: formatPrice(remainingRefundable(ord.total_cents, ord.refunded_cents), ord.currency, locale) })}</p>
                  <form action={resolveRefundRequest} className="mt-2 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="request_id" value={openByOrder.get(ord.id)!.id} />
                    <input type="hidden" name="return_to" value={returnTo} />
                    <div>
                      <label className="label" htmlFor={`amt-${ord.id}`}>{rf('amount')}</label>
                      <input id={`amt-${ord.id}`} name="amount" inputMode="decimal" className="field !w-32" />
                    </div>
                    <button type="submit" name="decision" value="approve" className="btn-primary !py-2">{rf('approve')}</button>
                    <button type="submit" name="decision" value="reject" className="btn-ghost !py-2">{rf('reject')}</button>
                  </form>
                </div>
              )}
              {!openByOrder.has(ord.id) && isRefundable(ord.status) && remainingRefundable(ord.total_cents, ord.refunded_cents) > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-ink-mute underline">{rf('refundNow')}</summary>
                  <form action={refundOrderDirect} className="mt-2 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="order_id" value={ord.id} />
                    <input type="hidden" name="return_to" value={returnTo} />
                    <div>
                      <label className="label" htmlFor={`dir-${ord.id}`}>{rf('amount')}</label>
                      <input id={`dir-${ord.id}`} name="amount" inputMode="decimal" className="field !w-32" />
                    </div>
                    <SubmitButton className="btn-danger !py-2">{rf('refundNow')}</SubmitButton>
                  </form>
                  <p className="mt-1 text-ink-mute">{rf('remaining', { amount: formatPrice(remainingRefundable(ord.total_cents, ord.refunded_cents), ord.currency, locale) })}</p>
                </details>
              )}

              {ord.status === 'paid' && (
                <form action={advanceOrder}>
                  <input type="hidden" name="order_id" value={ord.id} />
                  <input type="hidden" name="return_to" value={returnTo} />
                  <SubmitButton className="btn-dark">{t('markInProduction')}</SubmitButton>
                </form>
              )}
              {ord.status === 'in_production' && (
                <form action={advanceOrder} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="order_id" value={ord.id} />
                  <input type="hidden" name="return_to" value={returnTo} />
                  {!ord.pickup && (
                    <>
                      <div>
                        <label className="label" htmlFor={`car-${ord.id}`}>{t('carrier')}</label>
                        <input id={`car-${ord.id}`} name="carrier" required className="field" />
                      </div>
                      <div>
                        <label className="label" htmlFor={`trk-${ord.id}`}>{t('trackingCode')}</label>
                        <input id={`trk-${ord.id}`} name="tracking_code" required className="field" />
                      </div>
                    </>
                  )}
                  <SubmitButton className="btn-primary">{t('markShipped')}</SubmitButton>
                </form>
              )}
              {ord.status === 'shipped' && (
                <form action={advanceOrder}>
                  <input type="hidden" name="order_id" value={ord.id} />
                  <input type="hidden" name="return_to" value={returnTo} />
                  <SubmitButton className="btn-dark">{t('markDelivered')}</SubmitButton>
                </form>
              )}
      {showDetailLink && (
        <p className="border-t border-line pt-3 text-sm">
          <Link href={`/seller/orders/${ord.id}#messages`} className="font-semibold underline">{m('open')}</Link>
          {unread > 0 && <span className="ml-2 rounded-full bg-print px-2 py-0.5 text-xs font-bold text-ink">{m('unread', { n: unread })}</span>}
        </p>
      )}
    </div>
  );
}
