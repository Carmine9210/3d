import { beforeEach, describe, expect, it } from 'vitest';
import { rateLimit, resetRateLimits } from '@/lib/rate-limit';

describe('rateLimit', () => {
  beforeEach(() => resetRateLimits());

  it('blocca oltre il limite e riparte dopo la finestra', () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) expect(rateLimit('k', 3, 60_000, t0).ok).toBe(true);
    const blocked = rateLimit('k', 3, 60_000, t0 + 10);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
    expect(rateLimit('k', 3, 60_000, t0 + 61_000).ok).toBe(true);
  });

  it('separa le chiavi', () => {
    expect(rateLimit('a', 1, 1000, 0).ok).toBe(true);
    expect(rateLimit('b', 1, 1000, 0).ok).toBe(true);
    expect(rateLimit('a', 1, 1000, 1).ok).toBe(false);
  });
});
