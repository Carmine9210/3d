import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkCoupon, normalizeCode, type Coupon, type CouponCheck } from '@/lib/coupons';

export type CouponResult = { coupon: Coupon; check: CouponCheck };

/**
 * Cerca il codice negli shop del carrello e lo valida per ciascuno (codici unici per shop).
 * Letto con il service role: i codici non sono pubblici.
 */
export async function evaluateCoupon(rawCode: string, subtotalsByStore: Map<string, number>): Promise<Map<string, CouponResult>> {
  const out = new Map<string, CouponResult>();
  const code = normalizeCode(rawCode);
  if (!code || subtotalsByStore.size === 0) return out;
  const { data } = await createAdminClient()
    .from('coupons')
    .select('id, store_id, code, kind, value, min_subtotal_cents, starts_at, expires_at, max_uses, uses, active')
    .eq('code', code)
    .in('store_id', [...subtotalsByStore.keys()]);
  for (const c of (data ?? []) as Coupon[]) {
    out.set(c.store_id, { coupon: c, check: checkCoupon(c, subtotalsByStore.get(c.store_id) ?? 0) });
  }
  return out;
}
