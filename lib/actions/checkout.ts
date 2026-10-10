'use server';

import { redirect as externalRedirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/routing';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStripe } from '@/lib/stripe/server';
import { getAppConfig } from '@/lib/config';
import { addressSchema } from '@/lib/validators';
import { pickLocalized } from '@/lib/utils';
import { z } from 'zod';
import { enforceRateLimit } from '@/lib/rate-limit';
import { evaluateCoupon } from '@/lib/coupon-server';
import { normalizeCode, orderTotals } from '@/lib/coupons';
import { siteUrl } from '@/lib/site';

type CartRow = {
  id: string;
  quantity: number;
  customization_text: string | null;
  product_variants: {
    id: string;
    stock: number;
    price_delta_cents: number;
    material: string | null;
    color: string | null;
    size: string | null;
    finish: string | null;
    products: {
      id: string;
      title_it: string;
      title_en: string;
      base_price_cents: number;
      currency: string;
      local_pickup: boolean;
      status: string;
      store_id: string;
      stores: { id: string; name: string; status: string; vendor_id: string; vacation_mode: boolean } | null;
    } | null;
  } | null;
};

/** Trasforma il carrello in uno o più ordini (uno per shop) in stato pending_payment. */
export async function createOrders(formData: FormData) {
  const locale = await getLocale();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect({ href: '/login?next=/checkout', locale });
  if (!(await enforceRateLimit('create-orders', 10, 10 * 60_000, user!.id))) redirect({ href: '/checkout?error=rate', locale });

  const address = addressSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!address.success) redirect({ href: '/checkout?error=address', locale });

  // Rubrica: l'indirizzo usato diventa il predefinito. Se è già salvato lo aggiorno, altrimenti lo aggiungo.
  const a = address.data!;
  const { data: book } = await supabase.from('addresses').select('id, full_name, line1, postal_code').eq('user_id', user!.id);
  const same = (book ?? []).find(
    (b) => b.full_name.trim().toLowerCase() === a.full_name.trim().toLowerCase() && b.line1.trim().toLowerCase() === a.line1.trim().toLowerCase() && b.postal_code.trim() === a.postal_code.trim(),
  );
  await supabase.from('addresses').update({ is_default: false }).eq('user_id', user!.id);
  const addrRow = { ...a, user_id: user!.id, is_default: true };
  if (same) await supabase.from('addresses').update(addrRow).eq('id', same.id);
  else if ((book ?? []).length < 10) await supabase.from('addresses').insert(addrRow);

  const { data: rows } = await supabase
    .from('cart_items')
    .select(
      `id, quantity, customization_text,
       product_variants ( id, stock, price_delta_cents, material, color, size, finish,
         products ( id, title_it, title_en, base_price_cents, currency, local_pickup, status, store_id,
           stores ( id, name, status, vendor_id, vacation_mode ) ) )`,
    )
    .eq('user_id', user!.id);
  const cart = (rows ?? []) as unknown as CartRow[];
  if (cart.length === 0) redirect({ href: '/cart', locale });

  const admin = createAdminClient();
  const config = await getAppConfig();

  // Validazione lato server: nulla di ciò che arriva dal client è affidabile.
  const vendorIds = [...new Set(cart.map((r) => r.product_variants?.products?.stores?.vendor_id).filter(Boolean))] as string[];
  const { data: vendors } = await admin
    .from('vendors')
    .select('id, status, charges_enabled, commission_bps')
    .in('id', vendorIds);
  const vendorMap = new Map((vendors ?? []).map((v) => [v.id, v]));

  const groups = new Map<string, CartRow[]>();
  for (const row of cart) {
    const v = row.product_variants;
    const p = v?.products;
    if (!v || !p || p.status !== 'published' || p.stores?.status !== 'active' || v.stock < row.quantity) {
      redirect({ href: '/cart?error=unavailable', locale });
    }
    if (p!.stores!.vacation_mode) redirect({ href: '/cart?error=vacation', locale });
    const vendor = vendorMap.get(p!.stores!.vendor_id);
    if (!vendor || vendor.status !== 'active' || !vendor.charges_enabled) {
      redirect({ href: '/cart?error=seller', locale });
    }
    const list = groups.get(p!.store_id) ?? [];
    list.push(row);
    groups.set(p!.store_id, list);
  }

  // Codice sconto (facoltativo): valido per lo shop che lo ha emesso.
  const subtotalOf = (items: CartRow[]) =>
    items.reduce((sum, i) => sum + (i.product_variants!.products!.base_price_cents + i.product_variants!.price_delta_cents) * i.quantity, 0);
  const couponCode = normalizeCode(String(formData.get('coupon') ?? ''));
  const coupons = couponCode
    ? await evaluateCoupon(couponCode, new Map([...groups.entries()].map(([sid, items]) => [sid, subtotalOf(items)])))
    : new Map();
  if (couponCode) {
    const valid = [...coupons.values()].some((r) => r.check.ok);
    if (!valid) {
      const reason = [...coupons.values()].map((r) => (r.check.ok ? '' : r.check.reason)).find(Boolean) ?? 'not_found';
      redirect({ href: `/checkout?error=coupon&reason=${reason}&coupon=${encodeURIComponent(couponCode)}`, locale });
    }
  }

  // Annulla vecchi ordini in attesa dello stesso cliente: il carrello è la fonte di verità.
  await admin
    .from('orders')
    .update({ status: 'cancelled' })
    .eq('customer_id', user!.id)
    .eq('status', 'pending_payment');

  for (const [storeId, items] of groups) {
    const vendor = vendorMap.get(items[0].product_variants!.products!.stores!.vendor_id)!;
    const canPickup = items.every((i) => i.product_variants!.products!.local_pickup);
    const pickup = canPickup && formData.get(`pickup_${storeId}`) === 'on';

    const subtotal = subtotalOf(items);
    const applied = coupons.get(storeId);
    const discount = applied && applied.check.ok ? applied.check.discount : 0;
    const totals = orderTotals({
      subtotal,
      discount,
      pickup,
      shippingFlat: config.shipping_flat_cents,
      freeOver: config.free_shipping_over_cents,
      commissionBps: vendor.commission_bps,
    });

    const { data: order, error } = await admin
      .from('orders')
      .insert({
        customer_id: user!.id,
        store_id: storeId,
        status: 'pending_payment',
        subtotal_cents: subtotal,
        discount_cents: totals.discount,
        coupon_id: discount > 0 ? applied!.coupon.id : null,
        coupon_code: discount > 0 ? applied!.coupon.code : null,
        shipping_cents: totals.shipping,
        platform_fee_cents: totals.fee,
        total_cents: totals.total,
        currency: 'EUR',
        shipping_address: address.data,
        pickup,
      })
      .select('id')
      .single();
    if (error || !order) redirect({ href: '/checkout?error=generic', locale });

    await admin.from('order_items').insert(
      items.map((i) => {
        const p = i.product_variants!.products!;
        const v = i.product_variants!;
        return {
          order_id: order!.id,
          product_id: p.id,
          variant_id: v.id,
          title_snapshot: pickLocalized(locale, p.title_it, p.title_en),
          variant_snapshot: [v.material, v.color, v.size, v.finish].filter(Boolean).join(' / ') || null,
          unit_price_cents: p.base_price_cents + v.price_delta_cents,
          quantity: i.quantity,
          customization_text: i.customization_text || null,
        };
      }),
    );
  }
  for (const storeId of groups.keys()) {
    const { error } = await admin.rpc('track_funnel', { p_store_id: storeId, p_event: 'checkout', p_n: 1 });
    if (error) console.warn('[funnel]', error.message);
  }
  redirect({ href: '/checkout/pay', locale });
}

/** Crea una Checkout Session Stripe con destination charge + commissione di piattaforma. */
export async function payOrder(formData: FormData) {
  const locale = await getLocale();
  const orderId = z.string().uuid().safeParse(formData.get('order_id'));
  if (!orderId.success) redirect({ href: '/checkout/pay', locale });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect({ href: '/login', locale });
  if (!(await enforceRateLimit('pay-order', 20, 10 * 60_000, user!.id))) redirect({ href: '/checkout/pay?error=rate', locale });

  const admin = createAdminClient();
  const { data: order } = await admin
    .from('orders')
    .select('*, order_items(*), stores(vendor_id)')
    .eq('id', orderId.data!)
    .eq('customer_id', user!.id)
    .eq('status', 'pending_payment')
    .maybeSingle();
  if (!order) redirect({ href: '/checkout/pay', locale });

  const { data: vendor } = await admin
    .from('vendors')
    .select('stripe_account_id, charges_enabled, status')
    .eq('id', (order as any).stores.vendor_id)
    .single();
  if (!vendor?.stripe_account_id || !vendor.charges_enabled || vendor.status !== 'active') {
    redirect({ href: '/checkout/pay?error=seller', locale });
  }

  const site = siteUrl();
  const o = order as any;
  const lineItems = o.order_items.map((i: any) => ({
    quantity: i.quantity,
    price_data: {
      currency: o.currency.toLowerCase(),
      unit_amount: i.unit_price_cents,
      product_data: {
        name: i.title_snapshot,
        ...(i.variant_snapshot ? { description: i.variant_snapshot } : {}),
      },
    },
  }));
  if (o.shipping_cents > 0) {
    lineItems.push({
      quantity: 1,
      price_data: {
        currency: o.currency.toLowerCase(),
        unit_amount: o.shipping_cents,
        product_data: { name: locale === 'en' ? 'Shipping' : 'Spedizione' },
      },
    });
  }

  // Sconto: coupon Stripe monouso pari allo sconto già calcolato sull'ordine (la commissione è sul netto).
  let discounts: { coupon: string }[] | undefined;
  if (o.discount_cents > 0) {
    const coupon = await getStripe().coupons.create(
      { amount_off: o.discount_cents, currency: o.currency.toLowerCase(), duration: 'once', max_redemptions: 1, name: o.coupon_code ?? 'Sconto' },
      { idempotencyKey: `order-coupon:${o.id}:${o.discount_cents}` },
    );
    discounts = [{ coupon: coupon.id }];
  }

  const session = await getStripe().checkout.sessions.create({
    ...(discounts ? { discounts } : {}),
    mode: 'payment',
    locale: locale === 'en' ? 'en' : 'it',
    customer_email: user!.email,
    client_reference_id: o.id,
    line_items: lineItems,
    metadata: { order_id: o.id },
    payment_intent_data: {
      metadata: { order_id: o.id },
      transfer_data: { destination: vendor!.stripe_account_id! },
      ...(o.platform_fee_cents > 0 ? { application_fee_amount: o.platform_fee_cents } : {}),
    },
    success_url: `${site}/${locale}/checkout/success?order=${o.id}`,
    cancel_url: `${site}/${locale}/checkout/pay?cancelled=1`,
  });

  await admin.from('orders').update({ stripe_checkout_session_id: session.id }).eq('id', o.id);
  externalRedirect(session.url!);
}

/** Il cliente rinuncia a un ordine non ancora pagato (il carrello resta com'è). */
export async function cancelPendingOrder(formData: FormData) {
  const locale = await getLocale();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect({ href: '/login', locale });
  const id = z.string().uuid().safeParse(formData.get('order_id'));
  if (!id.success) redirect({ href: '/checkout/pay', locale });
  await createAdminClient()
    .from('orders')
    .update({ status: 'cancelled' })
    .eq('id', id.data!)
    .eq('customer_id', user!.id)
    .eq('status', 'pending_payment');
  redirect({ href: '/checkout/pay?removed=1', locale });
}
