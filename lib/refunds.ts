/** Logica pura dei rimborsi (testabile, senza dipendenze server). */
export const REFUNDABLE_STATUSES = ['paid', 'in_production', 'shipped', 'delivered'] as const;
export const REFUND_REASONS = ['not_received', 'damaged', 'not_as_described', 'changed_mind', 'other'] as const;

export function isRefundable(status: string): boolean {
  return (REFUNDABLE_STATUSES as readonly string[]).includes(status);
}

export function remainingRefundable(totalCents: number, refundedCents: number): number {
  return Math.max(0, totalCents - refundedCents);
}

export type RefundCheck = { ok: true } | { ok: false; reason: 'invalid' | 'exceeds' | 'nothing_left' };

export function validateRefundAmount(totalCents: number, refundedCents: number, amountCents: number): RefundCheck {
  if (!Number.isInteger(amountCents) || amountCents <= 0) return { ok: false, reason: 'invalid' };
  const left = remainingRefundable(totalCents, refundedCents);
  if (left === 0) return { ok: false, reason: 'nothing_left' };
  if (amountCents > left) return { ok: false, reason: 'exceeds' };
  return { ok: true };
}

/** Il rimborso è totale quando copre tutto l'importo pagato. */
export function isFullRefund(totalCents: number, refundedCents: number, amountCents: number): boolean {
  return refundedCents + amountCents >= totalCents;
}
