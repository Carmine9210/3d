import { describe, expect, it } from 'vitest';
import { checkCoupon, computeDiscount, normalizeCode, orderTotals, type Coupon } from '@/lib/coupons';

const base: Coupon = { id: 'c', store_id: 's', code: 'ESTATE10', kind: 'percent', value: 10, min_subtotal_cents: 0, starts_at: null, expires_at: null, max_uses: null, uses: 0, active: true };

describe('coupons', () => {
  it('normalizza il codice', () => expect(normalizeCode('  estate 10 ')).toBe('ESTATE10'));
  it('percentuale arrotondata e importo fisso limitato al subtotale', () => {
    expect(computeDiscount({ kind: 'percent', value: 10 }, 1999)).toBe(200);
    expect(computeDiscount({ kind: 'fixed', value: 5000 }, 1200)).toBe(1200);
    expect(computeDiscount({ kind: 'percent', value: 500 }, 1000)).toBe(900); // max 90%
  });
  it('rifiuta codici non validi', () => {
    const now = new Date('2026-06-01T12:00:00Z');
    expect(checkCoupon({ ...base, active: false }, 1000, now)).toEqual({ ok: false, reason: 'inactive' });
    expect(checkCoupon({ ...base, starts_at: '2026-07-01T00:00:00Z' }, 1000, now)).toEqual({ ok: false, reason: 'not_started' });
    expect(checkCoupon({ ...base, expires_at: '2026-05-01T00:00:00Z' }, 1000, now)).toEqual({ ok: false, reason: 'expired' });
    expect(checkCoupon({ ...base, max_uses: 3, uses: 3 }, 1000, now)).toEqual({ ok: false, reason: 'used_up' });
    expect(checkCoupon({ ...base, min_subtotal_cents: 2000 }, 1000, now)).toEqual({ ok: false, reason: 'min_subtotal' });
    expect(checkCoupon(base, 1000, now)).toEqual({ ok: true, discount: 100 });
  });
  it('totali: spedizione gratuita e commissione sul netto scontato', () => {
    const t = orderTotals({ subtotal: 6500, discount: 1000, pickup: false, shippingFlat: 490, freeOver: 6000, commissionBps: 1000 });
    expect(t).toEqual({ discount: 1000, net: 5500, shipping: 490, fee: 550, total: 5990 });
    const p = orderTotals({ subtotal: 1000, discount: 0, pickup: true, shippingFlat: 490, freeOver: 6000, commissionBps: 1000 });
    expect(p.shipping).toBe(0);
  });
});
