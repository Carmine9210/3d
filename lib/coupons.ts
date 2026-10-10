/** Codici sconto: logica pura (testabile). Importi in centesimi. */
export type Coupon = {
  id: string;
  store_id: string;
  code: string;
  kind: 'percent' | 'fixed' | string;
  value: number;
  min_subtotal_cents: number;
  starts_at: string | null;
  expires_at: string | null;
  max_uses: number | null;
  uses: number;
  active: boolean;
};

export type CouponCheck = { ok: true; discount: number } | { ok: false; reason: 'inactive' | 'not_started' | 'expired' | 'used_up' | 'min_subtotal' };

export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '').slice(0, 24);
}

/** Sconto sul subtotale (mai oltre il subtotale e mai negativo). */
export function computeDiscount(c: Pick<Coupon, 'kind' | 'value'>, subtotalCents: number): number {
  if (subtotalCents <= 0) return 0;
  const raw = c.kind === 'percent' ? Math.round((subtotalCents * Math.min(90, Math.max(0, c.value))) / 100) : c.value;
  return Math.max(0, Math.min(raw, subtotalCents));
}

export function checkCoupon(c: Coupon, subtotalCents: number, now = new Date()): CouponCheck {
  if (!c.active) return { ok: false, reason: 'inactive' };
  if (c.starts_at && new Date(c.starts_at) > now) return { ok: false, reason: 'not_started' };
  if (c.expires_at && new Date(c.expires_at) <= now) return { ok: false, reason: 'expired' };
  if (c.max_uses != null && c.uses >= c.max_uses) return { ok: false, reason: 'used_up' };
  if (subtotalCents < c.min_subtotal_cents) return { ok: false, reason: 'min_subtotal' };
  return { ok: true, discount: computeDiscount(c, subtotalCents) };
}

/**
 * Totali di un ordine con sconto.
 * - la spedizione gratuita si calcola sul subtotale già scontato
 * - la commissione di piattaforma si calcola sul subtotale scontato (spedizione esclusa)
 */
export function orderTotals(opts: {
  subtotal: number;
  discount: number;
  pickup: boolean;
  shippingFlat: number;
  freeOver: number;
  commissionBps: number;
}) {
  const discount = Math.max(0, Math.min(opts.discount, opts.subtotal));
  const net = opts.subtotal - discount;
  const shipping = opts.pickup || net >= opts.freeOver ? 0 : opts.shippingFlat;
  const fee = Math.round((net * opts.commissionBps) / 10000);
  return { discount, net, shipping, fee, total: net + shipping };
}
