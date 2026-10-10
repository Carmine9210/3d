import { getLocale, getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { refundOrderDirect, resolveRefundRequest } from '@/lib/actions/refunds';
import { remainingRefundable } from '@/lib/refunds';
import { formatPrice } from '@/lib/utils';
import SubmitButton from '@/components/SubmitButton';

export default async function AdminRefunds({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const locale = await getLocale();
  const sp = await searchParams;
  const t = await getTranslations('admin');
  const rf = await getTranslations('refunds');
  const c = await getTranslations('common');
  const supabase = await createClient();

  const [{ data: requests }, { data: disputed }] = await Promise.all([
    supabase
      .from('refund_requests')
      .select('id, reason, details, created_at, orders ( id, total_cents, refunded_cents, currency, stores ( name ) )')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('orders')
      .select('id, total_cents, currency, stripe_payment_intent_id, created_at, stores ( name )')
      .eq('status', 'disputed')
      .order('created_at', { ascending: false })
      .limit(100),
  ]);
  const errKey = sp.error && ['amount', 'invalid', 'exceeds', 'nothing_left', 'not_refundable', 'stripe'].includes(sp.error) ? sp.error : null;

  return (
    <div className="space-y-8">
      {sp.saved && <p className="notice notice-ok" role="status">{c('saved')}</p>}
      {errKey && <p className="notice notice-error" role="alert">{rf(`errors.${errKey}`)}</p>}

      <section aria-labelledby="req-h" className="space-y-3">
        <h1 id="req-h" className="font-display text-3xl font-bold">{t('refunds')}</h1>
        {(requests ?? []).length === 0 && <p className="notice">{rf('none')}</p>}
        <ul className="space-y-3">
          {(requests as any[] | null)?.map((r) => {
            const o = r.orders;
            return (
              <li key={r.id} className="card space-y-2 p-4">
                <p className="text-sm text-ink-mute">{o?.stores?.name} · {new Date(r.created_at).toLocaleDateString(locale)}</p>
                <p className="font-semibold">{rf('customerReason')}: {rf(`reasons.${r.reason}`)}</p>
                {r.details && <p className="whitespace-pre-line text-sm">{r.details}</p>}
                <p className="text-sm text-ink-soft">{rf('remaining', { amount: formatPrice(remainingRefundable(o.total_cents, o.refunded_cents), o.currency, locale) })}</p>
                <form action={resolveRefundRequest} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="request_id" value={r.id} />
                  <input type="hidden" name="return_to" value="/admin/refunds" />
                  <div>
                    <label className="label" htmlFor={`a-${r.id}`}>{rf('amount')}</label>
                    <input id={`a-${r.id}`} name="amount" inputMode="decimal" className="field !w-32" />
                  </div>
                  <button type="submit" name="decision" value="approve" className="btn-primary !py-2">{rf('approve')}</button>
                  <button type="submit" name="decision" value="reject" className="btn-ghost !py-2">{rf('reject')}</button>
                </form>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="disp-h" className="space-y-3">
        <h2 id="disp-h" className="font-display text-2xl font-bold">{t('disputes')}</h2>
        <p className="text-sm text-ink-soft">{t('disputesNote')}</p>
        {(disputed ?? []).length === 0 && <p className="notice">{t('nothing')}</p>}
        <ul className="space-y-2">
          {(disputed as any[] | null)?.map((o) => (
            <li key={o.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
              <span className="font-semibold">{o.stores?.name}</span>
              <span className="text-sm text-ink-mute">{new Date(o.created_at).toLocaleDateString(locale)}</span>
              <span className="font-bold">{formatPrice(o.total_cents, o.currency, locale)}</span>
              {o.stripe_payment_intent_id && (
                <a className="btn-ghost !py-1.5" href={`https://dashboard.stripe.com/payments/${o.stripe_payment_intent_id}`} target="_blank" rel="noopener noreferrer">
                  {t('openInStripe')}
                </a>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
