import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe } from '@/lib/stripe/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { stripeWebhookSecrets } from '@/lib/env';
import { notifyLowStock, notifyOrderPaid } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Webhook Stripe idempotente.
 * 1. verifica la firma; 2. registra event_id (unique) — se esiste già, ritorna 200;
 * 3. gestisce l'evento; se fallisce rimuove il record così Stripe ritenta.
 */
export async function POST(request: Request) {
  const signature = request.headers.get('stripe-signature');
  const secrets = stripeWebhookSecrets(process.env.STRIPE_WEBHOOK_SECRET);
  if (!signature || secrets.length === 0) return new NextResponse('missing signature', { status: 400 });

  // Più secret supportati: endpoint "Account" e endpoint "Connect" hanno secret diversi.
  const payload = await request.text();
  let event: Stripe.Event | null = null;
  for (const secret of secrets) {
    try {
      event = getStripe().webhooks.constructEvent(payload, signature, secret);
      break;
    } catch {
      /* prova il secret successivo */
    }
  }
  if (!event) return new NextResponse('invalid signature', { status: 400 });

  const admin = createAdminClient();
  const { error: insertError } = await admin.from('stripe_events').insert({ event_id: event.id, type: event.type });
  if (insertError) {
    if (insertError.code === '23505') return NextResponse.json({ received: true, duplicate: true });
    return new NextResponse('db error', { status: 500 });
  }

  try {
    await handleEvent(event);
  } catch (err) {
    console.error('stripe webhook failed', event.type, err);
    await admin.from('stripe_events').delete().eq('event_id', event.id);
    return new NextResponse('handler error', { status: 500 });
  }
  return NextResponse.json({ received: true });
}

async function handleEvent(event: Stripe.Event) {
  const admin = createAdminClient();

  switch (event.type) {
    // Pagamenti asincroni (es. bonifico SEPA): l'ordine diventa pagato solo quando i fondi arrivano.
    case 'checkout.session.async_payment_succeeded':
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.order_id ?? session.client_reference_id;
      if (!orderId || session.payment_status !== 'paid') return;
      const pi = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
      const { data: transitioned, error } = await admin.rpc('mark_order_paid', { p_order_id: orderId, p_payment_intent: pi ?? '' });
      if (error) throw error;
      // Email solo alla prima transizione: gli eventi ripetuti non rimandano messaggi.
      if (transitioned === true) {
        await notifyOrderPaid(orderId);
        await notifyLowStock(orderId);
      }
      return;
    }
    case 'charge.refunded': {
      const charge = event.data.object as Stripe.Charge;
      const pi = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
      if (!pi) return;
      // Stripe è la fonte di verità sull'importo rimborsato (anche per rimborsi fatti dalla dashboard Stripe).
      await admin
        .from('orders')
        .update({ refunded_cents: charge.amount_refunded, ...(charge.refunded ? { status: 'refunded' } : {}) })
        .eq('stripe_payment_intent_id', pi);
      return;
    }
    case 'charge.dispute.created': {
      const dispute = event.data.object as Stripe.Dispute;
      const pi = typeof dispute.payment_intent === 'string' ? dispute.payment_intent : dispute.payment_intent?.id;
      if (!pi) return;
      const { data: order } = await admin.from('orders').select('id, status').eq('stripe_payment_intent_id', pi).maybeSingle();
      if (!order || order.status === 'disputed') return;
      // Salvo lo stato di partenza: serve per ripristinarlo se la contestazione viene vinta.
      await admin.from('orders').update({ pre_dispute_status: order.status, status: 'disputed' }).eq('id', order.id);
      await admin.from('audit_logs').insert({ action: 'order.disputed', target_type: 'order', target_id: order.id, metadata: { dispute_id: dispute.id, reason: dispute.reason } });
      return;
    }
    case 'charge.dispute.closed': {
      const dispute = event.data.object as Stripe.Dispute;
      const pi = typeof dispute.payment_intent === 'string' ? dispute.payment_intent : dispute.payment_intent?.id;
      if (!pi) return;
      const { data: order } = await admin
        .from('orders')
        .select('id, status, total_cents, pre_dispute_status')
        .eq('stripe_payment_intent_id', pi)
        .maybeSingle();
      if (!order || order.status !== 'disputed') return;
      if (dispute.status === 'lost') {
        // Persa: il cliente riavrà l'importo dalla banca. Ordine considerato rimborsato.
        await admin.from('orders').update({ status: 'refunded', refunded_cents: order.total_cents }).eq('id', order.id);
      } else {
        // Vinta o chiusa senza esito negativo: torna allo stato precedente.
        await admin.from('orders').update({ status: order.pre_dispute_status ?? 'delivered', pre_dispute_status: null }).eq('id', order.id);
      }
      await admin.from('audit_logs').insert({ action: `order.dispute_${dispute.status}`, target_type: 'order', target_id: order.id, metadata: { dispute_id: dispute.id } });
      return;
    }
    case 'account.updated': {
      const account = event.data.object as Stripe.Account;
      await admin
        .from('vendors')
        .update({ charges_enabled: account.charges_enabled, payouts_enabled: account.payouts_enabled })
        .eq('stripe_account_id', account.id);
      return;
    }
    default:
      return;
  }
}
