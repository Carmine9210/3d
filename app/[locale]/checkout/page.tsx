import { getLocale, getTranslations } from 'next-intl/server';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getAppConfig } from '@/lib/config';
import { Link, redirect } from '@/i18n/routing';
import { createOrders } from '@/lib/actions/checkout';
import { formatPrice, pickLocalized } from '@/lib/utils';
import SubmitButton from '@/components/SubmitButton';
import { evaluateCoupon } from '@/lib/coupon-server';
import { normalizeCode, orderTotals } from '@/lib/coupons';

type Item = {
  id: string; quantity: number; customization_text: string | null;
  product_variants: {
    price_delta_cents: number;
    products: { title_it: string; title_en: string; base_price_cents: number; local_pickup: boolean; stores: { id: string; name: string } | null } | null;
  } | null;
};

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const locale = await getLocale();
  const viewer = await requireUser(locale, '/checkout');
  const sp = await searchParams;
  const t = await getTranslations('checkout');
  const cart = await getTranslations('cart');
  const cp = await getTranslations('coupons');
  const supabase = await createClient();
  const config = await getAppConfig();

  const { data } = await supabase
    .from('cart_items')
    .select('id, quantity, customization_text, product_variants ( price_delta_cents, products ( title_it, title_en, base_price_cents, local_pickup, stores ( id, name ) ) )')
    .order('created_at');
  const items = ((data ?? []) as unknown as Item[]).filter((i) => i.product_variants?.products?.stores);
  if (items.length === 0) redirect({ href: '/cart', locale });

  const stores = new Map<string, { name: string; pickup: boolean; subtotal: number; lines: { title: string; qty: number }[] }>();
  for (const it of items) {
    const p = it.product_variants!.products!;
    const sid = p.stores!.id;
    const prev = stores.get(sid) ?? { name: p.stores!.name, pickup: true, subtotal: 0, lines: [] };
    prev.pickup = prev.pickup && p.local_pickup;
    prev.subtotal += (p.base_price_cents + it.product_variants!.price_delta_cents) * it.quantity;
    prev.lines.push({ title: pickLocalized(locale, p.title_it, p.title_en), qty: it.quantity });
    stores.set(sid, prev);
  }
  // Anteprima del codice sconto (?coupon=CODICE): stesso calcolo del server al momento dell'ordine.
  const couponCode = normalizeCode(sp.coupon ?? '');
  const couponResults = couponCode ? await evaluateCoupon(couponCode, new Map([...stores.entries()].map(([id, s]) => [id, s.subtotal]))) : new Map();
  const couponOk = [...couponResults.values()].some((r) => r.check.ok);
  const couponReason = couponCode && !couponOk ? ([...couponResults.values()].map((r) => (r.check.ok ? '' : r.check.reason)).find(Boolean) ?? 'not_found') : null;
  const totalsFor = (id: string, subtotal: number) => {
    const r = couponResults.get(id);
    return orderTotals({
      subtotal,
      discount: r && r.check.ok ? r.check.discount : 0,
      pickup: false,
      shippingFlat: config.shipping_flat_cents,
      freeOver: config.free_shipping_over_cents,
      commissionBps: 0,
    });
  };
  let grand = 0;
  for (const [id, s] of stores.entries()) grand += totalsFor(id, s.subtotal).total;

  // Rubrica: si parte dall'indirizzo predefinito, oppure da quello scelto con ?addr=<id>.
  const { data: book } = await supabase.from('addresses').select('*').eq('user_id', viewer.id).order('is_default', { ascending: false }).order('created_at').limit(10);
  const addr = (book ?? []).find((a) => a.id === sp.addr) ?? (book ?? [])[0] ?? null;

  const f = (name: string, label: string, opts: { required?: boolean; value?: string | null; auto?: string } = {}) => (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <input id={name} name={name} defaultValue={opts.value ?? ''} required={opts.required ?? true} autoComplete={opts.auto} className="field" />
    </div>
  );

  const steps = [t('stepCart'), t('stepAddress'), t('stepPayment')];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <ol className="flex items-center gap-2 text-sm" aria-label="Steps">
        {steps.map((s, i) => (
          <li key={s} aria-current={i === 1 ? 'step' : undefined} className="flex items-center gap-2">
            <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${i < 1 ? 'bg-ok text-white' : i === 1 ? 'bg-print text-ink' : 'bg-line text-ink-mute'}`}>{i < 1 ? '✓' : i + 1}</span>
            <span className={i === 1 ? 'font-semibold' : 'text-ink-mute'}>{s}</span>
            {i < steps.length - 1 && <span className="mx-1 h-px w-6 bg-line" aria-hidden="true" />}
          </li>
        ))}
      </ol>
      <h1 className="font-display text-3xl font-bold">{t('title')}</h1>
      {sp.error && (
        <p className="notice notice-error" role="alert">
          {sp.error === 'rate'
            ? t('rate')
            : sp.error === 'coupon'
              ? cp(`reasons.${(sp.reason ?? 'not_found') as 'not_found'}`)
              : `${t('address')}: ${locale === 'en' ? 'please check the fields.' : 'controlla i campi.'}`}
        </p>
      )}

      <div className="grid gap-6 md:grid-cols-[1fr_20rem]">
        <form action={createOrders} className="space-y-4">
          <fieldset className="card space-y-3 p-5">
            <legend className="px-1 font-display text-lg font-bold">{t('address')}</legend>
            {(book ?? []).length > 1 && (
              <nav aria-label={t('savedAddresses')} className="flex flex-wrap gap-2 text-sm">
                {(book ?? []).map((a) => (
                  <Link key={a.id} href={`/checkout?addr=${a.id}`} aria-current={a.id === addr?.id} className={`rounded-full border px-3 py-1 ${a.id === addr?.id ? 'border-ink bg-ink text-white' : 'border-line hover:border-ink'}`}>
                    {a.full_name} · {a.city}
                  </Link>
                ))}
              </nav>
            )}
            {f('full_name', t('fullName'), { value: addr?.full_name ?? viewer.displayName, auto: 'name' })}
            {f('line1', t('line1'), { value: addr?.line1, auto: 'address-line1' })}
            {f('line2', t('line2'), { value: addr?.line2, required: false, auto: 'address-line2' })}
            <div className="grid grid-cols-2 gap-3">
              {f('city', t('city'), { value: addr?.city, auto: 'address-level2' })}
              {f('postal_code', t('postalCode'), { value: addr?.postal_code, auto: 'postal-code' })}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {f('province', t('province'), { value: addr?.province, required: false })}
              {f('country', t('country'), { value: addr?.country ?? 'IT', auto: 'country' })}
            </div>
            {f('phone', t('phone'), { value: addr?.phone, required: false, auto: 'tel' })}
          </fieldset>
          {[...stores.entries()].filter(([, s]) => s.pickup).map(([id, s]) => (
            <label key={id} className="card flex items-center gap-3 p-4">
              <input type="checkbox" name={`pickup_${id}`} />
              <span>{cart('pickup')} — {s.name}</span>
            </label>
          ))}
          {couponOk && <input type="hidden" name="coupon" value={couponCode} />}
          <SubmitButton className="btn-primary w-full !py-3 text-lg">{t('createOrders')}</SubmitButton>
          <p className="text-center text-xs text-ink-mute">{t('secureNote')}</p>
        </form>

        <aside aria-labelledby="sum-h" className="card h-fit space-y-3 p-4 md:sticky md:top-28">
          <h2 id="sum-h" className="font-display text-lg font-bold">{t('summary')}</h2>
          {[...stores.entries()].map(([id, s]) => {
            const tot = totalsFor(id, s.subtotal);
            return (
              <div key={id} className="space-y-1 border-b border-line pb-3 text-sm last:border-0">
                <p className="font-semibold">{s.name}</p>
                <ul className="text-ink-soft">{s.lines.map((l, i) => (<li key={i}>{l.qty} × {l.title}</li>))}</ul>
                <p className="flex justify-between"><span>{cart('subtotal')}</span><span>{formatPrice(s.subtotal, 'EUR', locale)}</span></p>
                {tot.discount > 0 && (
                  <p className="flex justify-between font-semibold text-ok"><span>{cp('discount', { code: couponCode })}</span><span>−{formatPrice(tot.discount, 'EUR', locale)}</span></p>
                )}
                <p className="flex justify-between"><span>{t('shippingLabel')}</span><span>{tot.shipping === 0 ? cart('free') : formatPrice(tot.shipping, 'EUR', locale)}</span></p>
              </div>
            );
          })}
          <p className="flex justify-between text-lg font-bold"><span>{locale === 'en' ? 'Total' : 'Totale'}</span><span>{formatPrice(grand, 'EUR', locale)}</span></p>
          <form method="get" className="space-y-2 border-t border-line pt-3">
            {sp.addr && <input type="hidden" name="addr" value={sp.addr} />}
            <label className="label" htmlFor="coupon">{cp('label')}</label>
            <div className="flex gap-2">
              <input id="coupon" name="coupon" defaultValue={couponCode} maxLength={24} autoComplete="off" className="field uppercase" />
              <button type="submit" className="btn-ghost !px-3">{cp('apply')}</button>
            </div>
            {couponOk && <p className="text-xs text-ok" role="status">{cp('applied')}</p>}
            {couponReason && sp.error !== 'coupon' && <p className="text-xs text-bad" role="alert">{cp(`reasons.${couponReason as 'not_found'}`)}</p>}
          </form>
        </aside>
      </div>
    </div>
  );
}
