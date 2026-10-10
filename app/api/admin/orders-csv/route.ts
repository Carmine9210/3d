import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/auth';
import { EXPORT_SELECT, csvResponse, ordersCsv, parseRange, type ExportOrder } from '@/lib/order-export';

export const dynamic = 'force-dynamic';

/** Tutti gli ordini (tutti gli shop) in CSV. Solo admin; l'export finisce nell'audit log. */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse('unauthorized', { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('role').eq('user_id', user.id).maybeSingle();
  if (profile?.role !== 'admin') return new NextResponse('forbidden', { status: 403 });

  const { from, to } = parseRange(new URL(request.url));
  const admin = createAdminClient();
  const { data } = await admin
    .from('orders')
    .select(`${EXPORT_SELECT}, stores ( name )`)
    .not('status', 'in', '(pending_payment,cancelled)')
    .gte('created_at', from.toISOString())
    .lte('created_at', to.toISOString())
    .order('created_at')
    .limit(20000);
  await logAudit(admin, user.id, 'orders.exported', 'orders', undefined, { from: from.toISOString(), to: to.toISOString(), rows: data?.length ?? 0 });
  const csv = ordersCsv((data ?? []) as unknown as ExportOrder[], true);
  return csvResponse(csv, `ordini-3dmarket-${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}.csv`);
}
