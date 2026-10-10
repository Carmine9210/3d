import { describe, expect, it } from 'vitest';
import { addGuestItem, guestItemCount, parseGuestCart, removeGuestItem, serializeGuestCart, setGuestQty } from '@/lib/guest-cart-core';

const A = '6f0b1b0e-5a4f-4c0e-8f2b-0a1b2c3d4e5f';
const B = '7a1c2c1f-6b5a-4d1f-9a3c-1b2c3d4e5f60';

describe('guest cart', () => {
  it('ignora cookie corrotti o malevoli', () => {
    expect(parseGuestCart(undefined)).toEqual([]);
    expect(parseGuestCart('non json')).toEqual([]);
    expect(parseGuestCart('{"a":1}')).toEqual([]);
    expect(parseGuestCart(JSON.stringify([{ v: 'x', q: 1, c: '' }]))).toEqual([]);
    expect(parseGuestCart(JSON.stringify([{ v: A, q: 0, c: '' }]))).toEqual([]);
    expect(parseGuestCart(JSON.stringify([{ v: A, q: 500, c: '' }]))).toEqual([]);
    expect(parseGuestCart(JSON.stringify([{ v: A, q: 2.5, c: '' }]))).toEqual([]);
  });

  it('accetta elementi validi e tronca il testo di personalizzazione', () => {
    const items = parseGuestCart(JSON.stringify([{ v: A, q: 2, c: 'x'.repeat(500) }]));
    expect(items).toHaveLength(1);
    expect(items[0].c.length).toBe(200);
  });

  it('limita a 20 articoli', () => {
    const many = Array.from({ length: 40 }, () => ({ v: A, q: 1, c: '' }));
    expect(parseGuestCart(JSON.stringify(many))).toHaveLength(20);
  });

  it('somma le quantità rispettando lo stock', () => {
    let items = addGuestItem([], { v: A, q: 2, c: '' }, 3);
    items = addGuestItem(items, { v: A, q: 5, c: '' }, 3);
    expect(items).toEqual([{ v: A, q: 3, c: '' }]);
    items = addGuestItem(items, { v: A, q: 1, c: 'Mario' }, 3); // personalizzazione diversa = riga diversa
    expect(items).toHaveLength(2);
  });

  it('aggiorna e rimuove per indice, ignorando indici non validi', () => {
    let items = addGuestItem(addGuestItem([], { v: A, q: 1, c: '' }, 9), { v: B, q: 1, c: '' }, 9);
    items = setGuestQty(items, 1, 4);
    expect(items[1].q).toBe(4);
    expect(setGuestQty(items, 9, 4)).toEqual(items);
    expect(removeGuestItem(items, 0)).toEqual([{ v: B, q: 4, c: '' }]);
    expect(guestItemCount(items)).toBe(5);
  });

  it('serializza e rilegge senza perdite', () => {
    const items = [{ v: A, q: 2, c: 'ciao' }];
    expect(parseGuestCart(serializeGuestCart(items))).toEqual(items);
  });
});
