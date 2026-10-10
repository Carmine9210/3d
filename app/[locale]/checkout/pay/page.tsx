import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { cancelPendingOrder, payOrder } from '@/lib/actions/checkout';
import { formatPrice } from '@/lib/utils';
import SubmitButton from '@/components/SubmitButton';

export default async function PayPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const locale = await getLocale();
  await requireUser(locale);
  const sp = await searchParams;
  const t = await getTranslations('checkout');
  const cp = await getTranslations('coupons');
  const supabase = await createClient();

  const { data: orders } = await supabase
    .from('orders')
    .select('id, total_cents, discount_cents, coupon_code, currency, stores ( name ), order_items ( title_snapshot, quantity )')
    .eq('status', 'pending_payment')
    .order('created_at');

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="font-display text-3xl font-bold">{t('toPay')}</h1>
      {sp.cancelled && <p className="notice" role="status">{t('cancelled')}</p>}
      {sp.removed && <p className="notice" role="status">{t('orderRemoved')}</p>}
      {sp.error === 'seller' && <p className="notice notice-error" role="alert">{t('sellerNotReady')}</p>}
      {sp.error === 'rate' && <p className="notice notice-error" role="alert">{t('rate')}</p>}
      {(orders ?? []).length === 0 ? (
        <>
          <p className="notice notice-ok">{t('allPaid')}</p>
          <Link href="/account" className="btn-dark">{t('viewOrders')}</Link>
        </>
      ) : (
        <ul className="space-y-3">
          {(orders as any[]).map((o) => (
            <li key={o.id} className="card p-4">
              <p className="font-display text-lg font-bold">{o.stores?.name}</p>
              <ul className="my-2 text-sm text-ink-soft">
                {o.order_items.map((i: any, idx: number) => (<li key={idx}>{i.quantity} × {i.title_snapshot}</li>))}
              </ul>
              <form action={payOrder} className="flex items-center justify-between gap-4">
                <input type="hidden" name="order_id" value={o.id} />
                <span className="text-lg font-bold">{formatPrice(o.total_cents, o.currency, locale)}</span>
                <SubmitButton className="btn-primary" pendingLabel="…">{t('payNow')}</SubmitButton>
              </form>
              {o.discount_cents > 0 && <p className="mt-1 text-sm text-ok">{cp('discount', { code: o.coupon_code ?? '' })}: −{formatPrice(o.discount_cents, o.currency, locale)}</p>}
              <form action={cancelPendingOrder} className="mt-2 text-right">
                <input type="hidden" name="order_id" value={o.id} />
                <SubmitButton className="text-sm text-ink-mute underline">{t('removeOrder')}</SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
