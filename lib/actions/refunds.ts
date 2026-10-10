'use server';

import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/routing';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStripe } from '@/lib/stripe/server';
import { getSellerContext, logAudit } from '@/lib/auth';
import { enforceRateLimit } from '@/lib/rate-limit';
import { notifyRefund } from '@/lib/email';
import { REFUND_REASONS, isFullRefund, isRefundable, remainingRefundable, validateRefundAmount } from '@/lib/refunds';
import { eurosToCents } from '@/lib/utils';
import { z } from 'zod';

function safeBack(v: FormDataEntryValue | null, fallback: string): string {
  const s = typeof v === 'string' ? v : '';
  return s.startsWith('/') && !s.startsWith('//') ? s : fallback;
}
const withParam = (path: string, k: string, v: string) => `${path}${path.includes('?') ? '&' : '?'}${k}=${v}`;

/** Chi sta agendo: admin oppure venditore (con il proprio shop). */
async function getActor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('profiles').select('role').eq('user_id', user.id).maybeSingle();
  const { store } = await getSellerContext(user.id);
  return { user, isAdmin: profile?.role === 'admin', storeId: store?.id ?? null };
}

type PerformResult = { ok: true; refundId: string; amountCents: number } | { ok: false; error: string };

/**
 * Esegue il rimborso su Stripe e aggiorna ordine, magazzino e audit.
 * - reverse_transfer: recupera i fondi dal conto del venditore
 * - refund_application_fee: restituisce al venditore la commissione proporzionale
 */
async function performRefund(orderId: string, amountCents: number, actorId: string): Promise<PerformResult> {
  const admin = createAdminClient();
  const { data: order } = await admin
    .from('orders')
    .select('id, status, total_cents, refunded_cents, stripe_payment_intent_id')
    .eq('id', orderId)
    .maybeSingle();
  if (!order || !isRefundable(order.status) || !order.stripe_payment_intent_id) return { ok: false, error: 'not_refundable' };

  const check = validateRefundAmount(order.total_cents, order.refunded_cents, amountCents);
  if (!check.ok) return { ok: false, error: check.reason };

  let refundId: string;
  try {
    const refund = await getStripe().refunds.create(
      {
        payment_intent: order.stripe_payment_intent_id,
        amount: amountCents,
        reverse_transfer: true,
        refund_application_fee: true,
        metadata: { order_id: order.id, actor_id: actorId },
      },
      { idempotencyKey: `refund:${order.id}:${order.refunded_cents}:${amountCents}` },
    );
    refundId = refund.id;
  } catch (err) {
    console.error('[refund:stripe]', err);
    return { ok: false, error: 'stripe' };
  }

  const full = isFullRefund(order.total_cents, order.refunded_cents, amountCents);
  const wasBeforeShipping = ['paid', 'in_production'].includes(order.status);
  await admin
    .from('orders')
    .update({ refunded_cents: order.refunded_cents + amountCents, ...(full ? { status: 'refunded' } : {}) })
    .eq('id', order.id);
  if (full && wasBeforeShipping) await admin.rpc('restock_order', { p_order_id: order.id });
  await logAudit(admin, actorId, full ? 'order.refunded' : 'order.partially_refunded', 'order', order.id, {
    amount_cents: amountCents,
    stripe_refund_id: refundId,
  });
  await notifyRefund(order.id, amountCents);
  return { ok: true, refundId, amountCents };
}

/* ------------------------------------------------------------------ */
/* Cliente: richiesta di rimborso                                       */
/* ------------------------------------------------------------------ */
export async function requestRefund(formData: FormData) {
  const locale = await getLocale();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect({ href: '/login', locale });

  const parsed = z
    .object({ order_id: z.string().uuid(), reason: z.enum(REFUND_REASONS), details: z.string().max(1000).default('') })
    .safeParse({ order_id: formData.get('order_id'), reason: formData.get('reason'), details: formData.get('details') ?? '' });
  if (!parsed.success) redirect({ href: '/account', locale });
  const { order_id, reason, details } = parsed.data!;
  const back = `/account/orders/${order_id}`;

  if (!(await enforceRateLimit('refund-request', 5, 60 * 60_000, user!.id))) redirect({ href: withParam(back, 'refund', 'rate'), locale });

  const admin = createAdminClient();
  const { data: order } = await admin
    .from('orders')
    .select('id, status, customer_id, total_cents, refunded_cents')
    .eq('id', order_id)
    .eq('customer_id', user!.id)
    .maybeSingle();
  if (!order || !isRefundable(order.status) || remainingRefundable(order.total_cents, order.refunded_cents) === 0) {
    redirect({ href: withParam(back, 'refund', 'invalid'), locale });
  }

  const { error } = await admin
    .from('refund_requests')
    .insert({ order_id, customer_id: user!.id, reason, details: details || null });
  // 23505 = esiste già una richiesta aperta per questo ordine
  if (error) redirect({ href: withParam(back, 'refund', error.code === '23505' ? 'exists' : 'invalid'), locale });

  await logAudit(admin, user!.id, 'refund.requested', 'order', order_id, { reason });
  revalidatePath('/', 'layout');
  redirect({ href: withParam(back, 'refund', 'requested'), locale });
}

/* ------------------------------------------------------------------ */
/* Venditore o admin: approva / rifiuta una richiesta                    */
/* ------------------------------------------------------------------ */
export async function resolveRefundRequest(formData: FormData) {
  const locale = await getLocale();
  const actor = await getActor();
  if (!actor) redirect({ href: '/login', locale });
  const back = safeBack(formData.get('return_to'), '/seller/orders');

  const parsed = z
    .object({ request_id: z.string().uuid(), decision: z.enum(['approve', 'reject']) })
    .safeParse({ request_id: formData.get('request_id'), decision: formData.get('decision') });
  if (!parsed.success) redirect({ href: withParam(back, 'error', 'invalid'), locale });

  const admin = createAdminClient();
  const { data: req } = await admin
    .from('refund_requests')
    .select('id, status, order_id, orders ( id, store_id, total_cents, refunded_cents )')
    .eq('id', parsed.data!.request_id)
    .maybeSingle();
  const order = (req as any)?.orders as { id: string; store_id: string; total_cents: number; refunded_cents: number } | undefined;
  if (!req || req.status !== 'open' || !order) redirect({ href: withParam(back, 'error', 'invalid'), locale });
  if (!actor!.isAdmin && order!.store_id !== actor!.storeId) redirect({ href: '/', locale });

  if (parsed.data!.decision === 'reject') {
    await admin
      .from('refund_requests')
      .update({ status: 'rejected', resolved_by: actor!.user.id, resolved_at: new Date().toISOString() })
      .eq('id', req!.id);
    await logAudit(admin, actor!.user.id, 'refund.rejected', 'order', order!.id);
    revalidatePath('/', 'layout');
    redirect({ href: withParam(back, 'saved', '1'), locale });
  }

  const raw = String(formData.get('amount') ?? '').trim();
  const amount = raw ? eurosToCents(raw) : remainingRefundable(order!.total_cents, order!.refunded_cents);
  if (!Number.isFinite(amount)) redirect({ href: withParam(back, 'error', 'amount'), locale });

  const result = await performRefund(order!.id, amount, actor!.user.id);
  if (!result.ok) redirect({ href: withParam(back, 'error', result.error), locale });

  await admin
    .from('refund_requests')
    .update({
      status: 'approved',
      refund_amount_cents: result.ok ? result.amountCents : null,
      stripe_refund_id: result.ok ? result.refundId : null,
      resolved_by: actor!.user.id,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', req!.id);
  revalidatePath('/', 'layout');
  redirect({ href: withParam(back, 'saved', '1'), locale });
}

/* ------------------------------------------------------------------ */
/* Venditore o admin: rimborso diretto (senza richiesta del cliente)     */
/* ------------------------------------------------------------------ */
export async function refundOrderDirect(formData: FormData) {
  const locale = await getLocale();
  const actor = await getActor();
  if (!actor) redirect({ href: '/login', locale });
  const back = safeBack(formData.get('return_to'), '/seller/orders');

  const id = z.string().uuid().safeParse(formData.get('order_id'));
  if (!id.success) redirect({ href: withParam(back, 'error', 'invalid'), locale });

  const admin = createAdminClient();
  const { data: order } = await admin
    .from('orders')
    .select('id, store_id, total_cents, refunded_cents')
    .eq('id', id.data!)
    .maybeSingle();
  if (!order) redirect({ href: withParam(back, 'error', 'invalid'), locale });
  if (!actor!.isAdmin && order!.store_id !== actor!.storeId) redirect({ href: '/', locale });

  const raw = String(formData.get('amount') ?? '').trim();
  const amount = raw ? eurosToCents(raw) : remainingRefundable(order!.total_cents, order!.refunded_cents);
  if (!Number.isFinite(amount)) redirect({ href: withParam(back, 'error', 'amount'), locale });

  const result = await performRefund(order!.id, amount, actor!.user.id);
  if (!result.ok) redirect({ href: withParam(back, 'error', result.error), locale });

  // Eventuale richiesta aperta del cliente: la chiudo come approvata.
  await admin
    .from('refund_requests')
    .update({
      status: 'approved',
      refund_amount_cents: amount,
      stripe_refund_id: result.ok ? result.refundId : null,
      resolved_by: actor!.user.id,
      resolved_at: new Date().toISOString(),
    })
    .eq('order_id', order!.id)
    .eq('status', 'open');
  revalidatePath('/', 'layout');
  redirect({ href: withParam(back, 'saved', '1'), locale });
}
