import { describe, expect, it } from 'vitest';
import { isFullRefund, isRefundable, remainingRefundable, validateRefundAmount } from '@/lib/refunds';

describe('refunds', () => {
  it('ordini rimborsabili solo dopo il pagamento', () => {
    expect(isRefundable('paid')).toBe(true);
    expect(isRefundable('delivered')).toBe(true);
    expect(isRefundable('pending_payment')).toBe(false);
    expect(isRefundable('refunded')).toBe(false);
    expect(isRefundable('cancelled')).toBe(false);
  });

  it('calcola il residuo senza andare sotto zero', () => {
    expect(remainingRefundable(5000, 1500)).toBe(3500);
    expect(remainingRefundable(5000, 9000)).toBe(0);
  });

  it('valida l’importo del rimborso', () => {
    expect(validateRefundAmount(5000, 0, 5000)).toEqual({ ok: true });
    expect(validateRefundAmount(5000, 2000, 3000)).toEqual({ ok: true });
    expect(validateRefundAmount(5000, 2000, 3001)).toEqual({ ok: false, reason: 'exceeds' });
    expect(validateRefundAmount(5000, 5000, 100)).toEqual({ ok: false, reason: 'nothing_left' });
    expect(validateRefundAmount(5000, 0, 0)).toEqual({ ok: false, reason: 'invalid' });
    expect(validateRefundAmount(5000, 0, 10.5)).toEqual({ ok: false, reason: 'invalid' });
    expect(validateRefundAmount(5000, 0, Number.NaN)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('riconosce il rimborso totale anche in più rate', () => {
    expect(isFullRefund(5000, 0, 5000)).toBe(true);
    expect(isFullRefund(5000, 0, 2000)).toBe(false);
    expect(isFullRefund(5000, 2000, 3000)).toBe(true);
  });
});
