import { describe, expect, it } from 'vitest';
import { addBusinessDays, estimateDelivery, formatDeliveryRange } from '@/lib/delivery';

describe('delivery', () => {
  it('salta i weekend', () => {
    // Venerdì 9 ottobre 2026 + 1 giorno lavorativo = lunedì 12
    expect(addBusinessDays(new Date(2026, 9, 9), 1).getDate()).toBe(12);
    expect(addBusinessDays(new Date(2026, 9, 9), 0).getDate()).toBe(9);
    expect(addBusinessDays(new Date(2026, 9, 7), 5).getDate()).toBe(14);
  });

  it('stima un intervallo coerente', () => {
    const { min, max } = estimateDelivery(3, new Date(2026, 9, 7)); // mercoledì
    expect(max.getTime()).toBeGreaterThanOrEqual(min.getTime());
    expect(min.getDate()).toBe(14); // +5 giorni lavorativi
    expect(max.getDate()).toBe(16); // +7 giorni lavorativi
  });

  it('formatta l’intervallo nella lingua giusta', () => {
    const a = new Date(2026, 9, 14);
    const b = new Date(2026, 9, 16);
    expect(formatDeliveryRange(a, b, 'it')).toMatch(/^14–16 ott/);
    expect(formatDeliveryRange(a, b, 'en')).toMatch(/^14–16 Oct/);
  });
});
