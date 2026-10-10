import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatPrice } from '@/lib/utils';

type Locale = 'it' | 'en';

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function layout(title: string, body: string): string {
  return `<!doctype html><html><body style="margin:0;background:#F3F5F8;font-family:Arial,Helvetica,sans-serif;color:#0B1F3A">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #D9DFE8;border-radius:6px">
<tr><td style="padding:20px 24px;border-bottom:4px solid #F28C28;font-size:20px;font-weight:bold">3D Market</td></tr>
<tr><td style="padding:24px"><h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(title)}</h1>${body}</td></tr>
</table></td></tr></table></body></html>`;
}

/** Invio via Resend (REST). Non lancia mai: un'email fallita non deve bloccare un pagamento. */
export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) {
    console.info(`[email:skipped] to=${to} subject="${subject}" (RESEND_API_KEY/EMAIL_FROM non configurati)`);
    return false;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html, reply_to: process.env.SUPPORT_EMAIL || undefined }),
    });
    if (!res.ok) console.error('[email:error]', res.status, await res.text());
    return res.ok;
  } catch (err) {
    console.error('[email:error]', err);
    return false;
  }
}

type OrderRow = {
  id: string; customer_id: string; total_cents: number; currency: string; tracking_code: string | null; carrier: string | null;
  stores: { name: string; vendors: { user_id: string } | null } | null;
  order_items: { title_snapshot: string; quantity: number }[];
};

async function loadOrder(orderId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from('orders')
    .select('id, customer_id, total_cents, currency, tracking_code, carrier, stores ( name, vendors ( user_id ) ), order_items ( title_snapshot, quantity )')
    .eq('id', orderId)
    .maybeSingle();
  return { admin, order: data as unknown as OrderRow | null };
}

async function recipient(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const { data: u } = await admin.auth.admin.getUserById(userId);
  const { data: p } = await admin.from('profiles').select('locale').eq('user_id', userId).maybeSingle();
  return { email: u.user?.email ?? null, locale: ((p?.locale as Locale) ?? 'it') as Locale };
}

function itemsHtml(o: OrderRow) {
  return `<ul>${o.order_items.map((i) => `<li>${i.quantity} × ${escapeHtml(i.title_snapshot)}</li>`).join('')}</ul>`;
}

/** Ordine pagato: avvisa cliente e venditore. */
export async function notifyOrderPaid(orderId: string) {
  try {
    const { admin, order } = await loadOrder(orderId);
    if (!order) return;
    const total = (l: Locale) => formatPrice(order.total_cents, order.currency, l);

    const customer = await recipient(admin, order.customer_id);
    if (customer.email) {
      const en = customer.locale === 'en';
      await sendEmail(
        customer.email,
        en ? 'Payment received — thank you!' : 'Pagamento ricevuto — grazie!',
        layout(
          en ? 'Payment received' : 'Pagamento ricevuto',
          `<p>${en ? 'Your order from' : 'Il tuo ordine da'} <b>${escapeHtml(order.stores?.name ?? '')}</b> ${en ? 'is confirmed.' : 'è confermato.'}</p>${itemsHtml(order)}<p><b>${en ? 'Total' : 'Totale'}: ${total(customer.locale)}</b></p>`,
        ),
      );
    }

    const sellerId = order.stores?.vendors?.user_id;
    if (sellerId) {
      const seller = await recipient(admin, sellerId);
      if (seller.email) {
        const en = seller.locale === 'en';
        await sendEmail(
          seller.email,
          en ? 'New paid order' : 'Nuovo ordine pagato',
          layout(en ? 'New paid order' : 'Nuovo ordine pagato', `${itemsHtml(order)}<p>${en ? 'Open your seller area to start production.' : "Apri l'area venditore per avviare la produzione."}</p>`),
        );
      }
    }
  } catch (err) {
    console.error('[email:notifyOrderPaid]', err);
  }
}

/** Ordine spedito: avvisa il cliente con il tracking. */
export async function notifyOrderShipped(orderId: string) {
  try {
    const { admin, order } = await loadOrder(orderId);
    if (!order) return;
    const customer = await recipient(admin, order.customer_id);
    if (!customer.email) return;
    const en = customer.locale === 'en';
    const tracking = order.tracking_code
      ? `<p>${en ? 'Tracking' : 'Tracking'}: ${escapeHtml(order.carrier ?? '')} · <b>${escapeHtml(order.tracking_code)}</b></p>`
      : `<p>${en ? 'Your order is ready for pickup.' : 'Il tuo ordine è pronto per il ritiro.'}</p>`;
    await sendEmail(
      customer.email,
      en ? 'Your order is on its way' : 'Il tuo ordine è in viaggio',
      layout(en ? 'Order shipped' : 'Ordine spedito', `${itemsHtml(order)}${tracking}`),
    );
  } catch (err) {
    console.error('[email:notifyOrderShipped]', err);
  }
}

/** Rimborso emesso: avvisa il cliente. */
export async function notifyRefund(orderId: string, amountCents: number) {
  try {
    const { admin, order } = await loadOrder(orderId);
    if (!order) return;
    const customer = await recipient(admin, order.customer_id);
    if (!customer.email) return;
    const en = customer.locale === 'en';
    const amount = formatPrice(amountCents, order.currency, customer.locale);
    await sendEmail(
      customer.email,
      en ? 'Refund issued' : 'Rimborso emesso',
      layout(
        en ? 'Refund issued' : 'Rimborso emesso',
        `<p>${en ? 'We refunded' : 'Abbiamo rimborsato'} <b>${amount}</b> ${en ? 'for your order from' : 'per il tuo ordine da'} <b>${escapeHtml(order.stores?.name ?? '')}</b>.</p><p>${en ? 'It can take a few days to appear on your statement.' : 'Può richiedere alcuni giorni lavorativi prima di comparire sull’estratto conto.'}</p>`,
      ),
    );
  } catch (err) {
    console.error('[email:notifyRefund]', err);
  }
}

/** Nuovo messaggio sull'ordine: avvisa l'altra parte (cliente ↔ venditore). */
export async function notifyNewMessage(orderId: string, senderRole: 'customer' | 'seller' | 'admin', body: string) {
  try {
    const { admin, order } = await loadOrder(orderId);
    if (!order) return;
    const site = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/+$/, '');
    const targets: { userId: string; path: string }[] = [];
    if (senderRole !== 'customer') targets.push({ userId: order.customer_id, path: `/account/orders/${order.id}` });
    const sellerId = order.stores?.vendors?.user_id;
    if (senderRole !== 'seller' && sellerId) targets.push({ userId: sellerId, path: `/seller/orders/${order.id}` });
    const preview = body.length > 400 ? `${body.slice(0, 400)}…` : body;
    for (const tgt of targets) {
      const r = await recipient(admin, tgt.userId);
      if (!r.email) continue;
      const en = r.locale === 'en';
      const link = `${site}/${r.locale}${tgt.path}#messages`;
      await sendEmail(
        r.email,
        en ? `New message about your order — ${order.stores?.name ?? ''}` : `Nuovo messaggio sul tuo ordine — ${order.stores?.name ?? ''}`,
        layout(
          en ? 'New message' : 'Nuovo messaggio',
          `<blockquote style="margin:0 0 16px;padding:12px;border-left:4px solid #F28C28;background:#F3F5F8;white-space:pre-line">${escapeHtml(preview)}</blockquote><p><a href="${escapeHtml(link)}" style="color:#0B1F3A;font-weight:bold">${en ? 'Reply on 3D Market' : 'Rispondi su 3D Market'}</a></p>`,
        ),
      );
    }
  } catch (err) {
    console.error('[email:notifyNewMessage]', err);
  }
}

/** Dopo un pagamento: avvisa il venditore se qualche variante dell'ordine è scesa sotto la soglia. */
export async function notifyLowStock(orderId: string) {
  try {
    const admin = createAdminClient();
    const { data: order } = await admin
      .from('orders')
      .select('id, stores ( name, low_stock_threshold, vendors ( user_id ) ), order_items ( variant_id )')
      .eq('id', orderId)
      .maybeSingle();
    const store = order?.stores as unknown as { name: string; low_stock_threshold: number; vendors: { user_id: string } | null } | null;
    if (!order || !store?.vendors) return;
    const ids = (order.order_items ?? []).map((i) => i.variant_id).filter((v): v is string => Boolean(v));
    if (ids.length === 0) return;
    const { data: low } = await admin
      .from('product_variants')
      .select('stock, material, color, size, products ( title_it, title_en )')
      .in('id', ids)
      .lte('stock', store.low_stock_threshold);
    if (!low || low.length === 0) return;
    const r = await recipient(admin, store.vendors.user_id);
    if (!r.email) return;
    const en = r.locale === 'en';
    const site = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/+$/, '');
    const rows = low
      .map((v) => {
        const p = v.products as unknown as { title_it: string; title_en: string } | null;
        const title = (en ? p?.title_en || p?.title_it : p?.title_it || p?.title_en) ?? '';
        const variant = [v.material, v.color, v.size].filter(Boolean).join(' / ');
        return `<li>${escapeHtml(title)}${variant ? ` — ${escapeHtml(variant)}` : ''}: <b>${v.stock}</b> ${en ? 'left' : 'rimasti'}</li>`;
      })
      .join('');
    await sendEmail(
      r.email,
      en ? 'Low stock on your shop' : 'Scorte in esaurimento nel tuo shop',
      layout(
        en ? 'Low stock' : 'Scorte in esaurimento',
        `<ul>${rows}</ul><p><a href="${escapeHtml(`${site}/${r.locale}/seller/products`)}" style="color:#0B1F3A;font-weight:bold">${en ? 'Update stock' : 'Aggiorna le quantità'}</a></p>`,
      ),
    );
  } catch (err) {
    console.error('[email:notifyLowStock]', err);
  }
}
