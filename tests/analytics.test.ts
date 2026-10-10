import { describe, expect, it } from 'vitest';
import { buildDailySeries, buildFunnel, conversionRate } from '@/lib/analytics';

describe('analytics', () => {
  it('calcola la conversione senza dividere per zero', () => {
    expect(conversionRate(5, 100)).toBe(5);
    expect(conversionRate(0, 0)).toBe(0);
    expect(conversionRate(10, 5)).toBe(100);
  });

  it('costruisce una serie continua e somma i giorni ripetuti', () => {
    const today = new Date(Date.UTC(2026, 9, 7));
    const s = buildDailySeries(
      [{ day: '2026-10-07', value: 3 }, { day: '2026-10-07', value: 2 }, { day: '2026-10-05', value: 1 }],
      5,
      today,
    );
    expect(s.map((d) => d.day)).toEqual(['2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07']);
    expect(s.map((d) => d.value)).toEqual([0, 0, 1, 0, 5]);
  });
});

describe('buildFunnel', () => {
  it('calcola la percentuale rispetto al passo precedente', () => {
    const f = buildFunnel(200, 20, 10, 5);
    expect(f.map((s) => s.key)).toEqual(['views', 'cart_adds', 'checkouts', 'paid']);
    expect(f.map((s) => Math.round(s.pct))).toEqual([100, 10, 50, 50]);
  });
  it('non divide per zero e non supera il 100%', () => {
    expect(buildFunnel(0, 0, 0, 0).map((s) => s.pct)).toEqual([100, 0, 0, 0]);
    expect(buildFunnel(1, 3, 0, 0)[1].pct).toBe(100);
  });
});
