import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSellerContext } from '@/lib/auth';
import { EXPORT_SELECT, csvResponse, ordersCsv, parseRange, type ExportOrder } from '@/lib/order-export';

export const dynamic = 'force-dynamic';

/** Ordini del proprio shop in CSV (Excel). Client dell'utente: la RLS limita ai propri ordini. */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse('unauthorized', { status: 401 });
  const { store } = await getSellerContext(user.id);
  if (!store) return new NextResponse('forbidden', { status: 403 });

  const { from, to } = parseRange(new URL(request.url));
  const { data } = await supabase
    .from('orders')
    .select(EXPORT_SELECT)
    .eq('store_id', store.id)
    .not('status', 'in', '(pending_payment,cancelled)')
    .gte('created_at', from.toISOString())
    .lte('created_at', to.toISOString())
    .order('created_at')
    .limit(5000);
  const csv = ordersCsv((data ?? []) as unknown as ExportOrder[], false);
  return csvResponse(csv, `ordini-${store.slug}-${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}.csv`);
}
