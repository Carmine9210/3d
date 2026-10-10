/** Carrello ospite: logica pura (parsing sicuro, merge, limiti). Salvato in un cookie, mai fidato. */
export type GuestItem = { v: string; q: number; c: string };

export const GUEST_CART_MAX_ITEMS = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseGuestCart(raw?: string | null): GuestItem[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    const out: GuestItem[] = [];
    for (const it of data) {
      if (!it || typeof it !== 'object') continue;
      const { v, q, c } = it as Record<string, unknown>;
      if (typeof v !== 'string' || !UUID.test(v)) continue;
      if (typeof q !== 'number' || !Number.isInteger(q) || q < 1 || q > 99) continue;
      out.push({ v, q, c: typeof c === 'string' ? c.slice(0, 200) : '' });
      if (out.length >= GUEST_CART_MAX_ITEMS) break;
    }
    return out;
  } catch {
    return [];
  }
}

export function serializeGuestCart(items: GuestItem[]): string {
  return JSON.stringify(items.slice(0, GUEST_CART_MAX_ITEMS));
}

export function addGuestItem(items: GuestItem[], item: GuestItem, maxQty: number): GuestItem[] {
  const cap = Math.max(1, Math.min(99, maxQty));
  const next = items.map((i) => ({ ...i }));
  const existing = next.find((i) => i.v === item.v && i.c === item.c);
  if (existing) existing.q = Math.min(existing.q + item.q, cap);
  else if (next.length < GUEST_CART_MAX_ITEMS) next.push({ ...item, q: Math.min(item.q, cap) });
  return next;
}

export function setGuestQty(items: GuestItem[], index: number, qty: number): GuestItem[] {
  if (!Number.isInteger(index) || index < 0 || index >= items.length) return items;
  const q = Math.max(1, Math.min(99, Math.floor(qty)));
  return items.map((i, n) => (n === index ? { ...i, q } : i));
}

export function removeGuestItem(items: GuestItem[], index: number): GuestItem[] {
  return items.filter((_, n) => n !== index);
}

export function guestItemCount(items: GuestItem[]): number {
  return items.reduce((n, i) => n + i.q, 0);
}
