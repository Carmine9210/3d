import { describe, expect, it } from 'vitest';
import { eurosToCents, formatPrice, pickLocalized, platformFee, sanitizeSearch, slugify } from '@/lib/utils';
import { productSchema, registerSchema, trackingSchema } from '@/lib/validators';

describe('utils', () => {
  it('converte euro in centesimi', () => {
    expect(eurosToCents('12,50')).toBe(1250);
    expect(eurosToCents('0.1')).toBe(10);
    expect(eurosToCents(19.99)).toBe(1999);
    expect(Number.isNaN(eurosToCents('abc'))).toBe(true);
  });

  it('calcola la commissione di piattaforma', () => {
    expect(platformFee(10000, 1000)).toBe(1000); // 10%
    expect(platformFee(1999, 500)).toBe(100); // 5% arrotondato
    expect(platformFee(5000, 0)).toBe(0);
  });

  it('crea slug puliti', () => {
    expect(slugify('Vaso Città & Più!')).toBe('vaso-citta-piu');
  });

  it('sceglie il testo nella lingua corretta con fallback', () => {
    expect(pickLocalized('en', 'Ciao', 'Hello')).toBe('Hello');
    expect(pickLocalized('en', 'Ciao', '')).toBe('Ciao');
    expect(pickLocalized('it', '', 'Hello')).toBe('Hello');
  });

  it('sanifica la ricerca', () => {
    expect(sanitizeSearch('a%b,c(d)')).not.toMatch(/[%,()]/);
  });

  it('formatta i prezzi', () => {
    expect(formatPrice(1250, 'EUR', 'it')).toContain('12,50');
  });
});

describe('validators', () => {
  it('rifiuta password corte', () => {
    expect(registerSchema.safeParse({ email: 'a@b.it', password: '123', displayName: 'Mario' }).success).toBe(false);
  });

  it('richiede almeno un titolo prodotto', () => {
    const base = {
      title_it: '', title_en: '', description_it: '', description_en: '',
      category_id: '6f0b1b0e-5a4f-4c0e-8f2b-0a1b2c3d4e5f', price: '10', production_days: 3,
      is_customizable: false, local_pickup: false,
    };
    expect(productSchema.safeParse(base).success).toBe(false);
    expect(productSchema.safeParse({ ...base, title_en: 'Vase' }).success).toBe(true);
  });

  it('valida il tracking', () => {
    expect(trackingSchema.safeParse({ carrier: 'BRT', tracking_code: 'ABC123' }).success).toBe(true);
    expect(trackingSchema.safeParse({ carrier: '', tracking_code: '' }).success).toBe(false);
  });
});
