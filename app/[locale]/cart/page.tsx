import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { getViewer } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getAppConfig } from '@/lib/config';
import { readGuestCart } from '@/lib/guest-cart';
import { removeCartItem, updateCartItem } from '@/lib/actions/cart';
import { formatPrice, pickLocalized } from '@/lib/utils';
import SubmitButton from '@/components/SubmitButton';
import TrustBar from '@/components/TrustBar';

type Variant = {
  id: string; stock: number; price_delta_cents: number;
  material: string | null; color: string | null; size: string | null; finish: string | null;
  products: {
    slug: string; title_it: string; title_en: string; base_price_cents: number; currency: string;
    stores: { id: string; name: string } | null;
  } | null;
};
type Row = { id: string; quantity: number; customization_text: string | null; product_variants: Variant | null };

const VARIANT_SELECT = `id, stock, price_delta_cents, material, color, size, finish,
  products ( slug, title_it, title_en, base_price_cents, currency, stores ( id, name ) )`;

export default async function CartPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const locale = await getLocale();
  const sp = await searchParams;
  const t = await getTranslations('cart');
  const c = await getTranslations('common');
  const a = await getTranslations('auth');
  const supabase = await createClient();
  const config = await getAppConfig();
  const viewer = await getViewer();

  let rows: Row[] = [];
  if (viewer) {
    const { data } = await supabase
      .from('cart_items')
      .select(`id, quantity, customization_text, product_variants ( ${VARIANT_SELECT} )`)
      .order('created_at');
    rows = (data ?? []) as unknown as Row[];
  } else {
    // Carrello ospite: cookie + dati reali dal database (mai fidarsi dei prezzi nel cookie).
    const guest = await readGuestCart();
    if (guest.length > 0) {
      const { data } = await supabase
        .from('product_variants')
        .select(VARIANT_SELECT)
        .in('id', [...new Set(guest.map((g) => g.v))]);
      const byId = new Map(((data ?? []) as unknown as Variant[]).map((v) => [v.id, v]));
      rows = guest
        .map((g, i) => ({ id: `guest:${i}`, quantity: g.q, customization_text: g.c || null, product_variants: byId.get(g.v) ?? null }))
        .filter((r) => r.product_variants);
    }
  }
  rows = rows.filter((r) => r.product_variants?.products);

  if (rows.length === 0) {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-10 text-center">
        <h1 className="font-display text-3xl font-bold">{t('title')}</h1>
        <p className="text-ink-soft">{t('empty')}</p>
        <Link href="/search" className="btn-primary">{c('search')}</Link>
      </div>
    );
  }

  const groups = new Map<string, { name: string; rows: Row[] }>();
  for (const r of rows) {
    const store = r.product_variants!.products!.stores!;
    const g = groups.get(store.id) ?? { name: store.name, rows: [] };
    g.rows.push(r);
    groups.set(store.id, g);
  }
  const lineTotal = (r: Row) => (r.product_variants!.products!.base_price_cents + r.product_variants!.price_delta_cents) * r.quantity;

  let grand = 0;
  const sellerMsg = locale === 'en' ? "One of the sellers can't accept payments yet." : 'Uno dei venditori non può ancora ricevere pagamenti.';

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-bold">{t('title')}</h1>
      {sp.error === 'unavailable' && <p className="notice notice-error" role="alert">{t('unavailable')}</p>}
      {sp.error === 'seller' && <p className="notice notice-error" role="alert">{sellerMsg}</p>}
      {sp.error === 'vacation' && <p className="notice notice-error" role="alert">{t('vacation')}</p>}
      {groups.size > 1 && <p className="notice">{t('separateOrders')}</p>}

      {[...groups.entries()].map(([storeId, g]) => {
        const subtotal = g.rows.reduce((s, r) => s + lineTotal(r), 0);
        const free = subtotal >= config.free_shipping_over_cents;
        const shipping = free ? 0 : config.shipping_flat_cents;
        const missing = config.free_shipping_over_cents - subtotal;
        const progress = Math.min(100, Math.round((subtotal / config.free_shipping_over_cents) * 100));
        grand += subtotal + shipping;
        return (
          <section key={storeId} className="card p-4" aria-label={g.name}>
            <h2 className="mb-3 font-display text-xl font-bold">{t('from', { store: g.name })}</h2>

            {/* Soglia spedizione gratuita: dati reali dalle impostazioni, non un trucco */}
            <div className="mb-3" role="status">
              <p className={`text-sm font-semibold ${free ? 'text-ok' : 'text-ink-soft'}`}>
                {free ? t('freeReached') : t('freeProgress', { amount: formatPrice(missing, 'EUR', locale) })}
              </p>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-line" aria-hidden="true">
                <div className={`h-full rounded-full ${free ? 'bg-ok' : 'bg-print'}`} style={{ width: `${progress}%` }} />
              </div>
            </div>

            <ul className="divide-y divide-line">
              {g.rows.map((r) => {
                const p = r.product_variants!.products!;
                const v = r.product_variants!;
                const vlabel = [v.material, v.color, v.size, v.finish].filter(Boolean).join(' / ');
                return (
                  <li key={r.id} className="flex flex-wrap items-center gap-4 py-3">
                    <div className="min-w-0 flex-1">
                      <Link href={`/product/${p.slug}`} className="font-semibold underline">{pickLocalized(locale, p.title_it, p.title_en)}</Link>
                      {vlabel && <p className="text-sm text-ink-mute">{vlabel}</p>}
                      {r.customization_text && <p className="text-sm text-ink-mute">“{r.customization_text}”</p>}
                    </div>
                    <form action={updateCartItem} className="flex items-center gap-2">
                      <input type="hidden" name="item_id" value={r.id} />
                      <label className="sr-only" htmlFor={`q-${r.id}`}>{c('quantity')}</label>
                      <input id={`q-${r.id}`} name="quantity" type="number" min={1} max={Math.max(1, v.stock)} defaultValue={r.quantity} className="field !w-20" />
                      <SubmitButton className="btn-ghost !px-3 !py-2 text-sm">{t('update')}</SubmitButton>
                    </form>
                    <p className="w-24 text-right font-semibold">{formatPrice(lineTotal(r), p.currency, locale)}</p>
                    <form action={removeCartItem}>
                      <input type="hidden" name="item_id" value={r.id} />
                      <SubmitButton className="text-sm text-bad underline">{t('remove')}</SubmitButton>
                    </form>
                  </li>
                );
              })}
            </ul>
            <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-6 text-sm">
              <dt>{t('subtotal')}</dt><dd className="text-right">{formatPrice(subtotal, 'EUR', locale)}</dd>
              <dt>{t('shipping')}</dt><dd className="text-right">{shipping === 0 ? t('free') : formatPrice(shipping, 'EUR', locale)}</dd>
            </dl>
          </section>
        );
      })}

      <div className="card space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-2xl font-bold">{c('total')}: {formatPrice(grand, 'EUR', locale)}</p>
          {viewer ? (
            <Link href="/checkout" className="btn-primary !px-8 !py-3 text-lg">{t('checkout')}</Link>
          ) : (
            <Link href="/register?next=/checkout" className="btn-primary !px-8 !py-3 text-lg">{t('loginToCheckout')}</Link>
          )}
        </div>
        {!viewer && (
          <p className="text-sm text-ink-soft">
            {t('guestHint')} {a('haveAccount')} <Link href="/login?next=/checkout" className="font-semibold underline">{c('login')}</Link>
          </p>
        )}
        <TrustBar compact />
        <p className="text-xs text-ink-mute">{t('secure')}</p>
      </div>
      <Link href="/search" className="inline-block text-sm font-semibold underline">← {t('continue')}</Link>
    </div>
  );
}
