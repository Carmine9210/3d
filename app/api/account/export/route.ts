import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Esporta i dati personali dell'utente (portabilità GDPR). Usa il client dell'utente: la RLS limita i dati ai suoi. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse('unauthorized', { status: 401 });

  const [profile, addresses, orders, favorites, reviews, refunds] = await Promise.all([
    supabase.from('profiles').select('display_name, phone, locale, role, created_at').eq('user_id', user.id).maybeSingle(),
    supabase.from('addresses').select('*').eq('user_id', user.id),
    supabase
      .from('orders')
      .select('id, status, total_cents, shipping_cents, refunded_cents, currency, shipping_address, tracking_code, carrier, created_at, paid_at, stores ( name ), order_items ( title_snapshot, variant_snapshot, unit_price_cents, quantity, customization_text )')
      .eq('customer_id', user.id),
    supabase.from('favorites').select('created_at, products ( slug, title_it, title_en )').eq('user_id', user.id),
    supabase.from('reviews').select('product_id, rating, comment, created_at').eq('customer_id', user.id),
    supabase.from('refund_requests').select('order_id, reason, details, status, created_at').eq('customer_id', user.id),
  ]);

  const payload = {
    exported_at: new Date().toISOString(),
    account: { id: user.id, email: user.email, created_at: user.created_at },
    profile: profile.data,
    addresses: addresses.data ?? [],
    orders: orders.data ?? [],
    favorites: favorites.data ?? [],
    reviews: reviews.data ?? [],
    refund_requests: refunds.data ?? [],
  };
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="3d-market-my-data.json"',
      'Cache-Control': 'no-store',
    },
  });
}
