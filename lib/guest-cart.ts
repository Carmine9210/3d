import 'server-only';
import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { parseGuestCart, serializeGuestCart, type GuestItem } from './guest-cart-core';

const COOKIE = 'gc';

export async function readGuestCart(): Promise<GuestItem[]> {
  const store = await cookies();
  return parseGuestCart(store.get(COOKIE)?.value);
}

/** Solo in Server Action o Route Handler. */
export async function writeGuestCart(items: GuestItem[]) {
  const store = await cookies();
  if (items.length === 0) {
    store.delete(COOKIE);
    return;
  }
  store.set(COOKIE, serializeGuestCart(items), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
}

/** Dopo login/registrazione: porta il carrello ospite nel carrello dell'utente, rispettando lo stock. */
export async function mergeGuestCartIntoUser(supabase: SupabaseClient<Database>, userId: string) {
  const items = await readGuestCart();
  if (items.length === 0) return;
  for (const it of items) {
    const { data: variant } = await supabase.from('product_variants').select('id, stock').eq('id', it.v).maybeSingle();
    if (!variant || variant.stock < 1) continue;
    const { data: existing } = await supabase
      .from('cart_items')
      .select('id, quantity')
      .eq('user_id', userId)
      .eq('variant_id', it.v)
      .eq('customization_text', it.c)
      .maybeSingle();
    const qty = Math.min((existing?.quantity ?? 0) + it.q, variant.stock, 99);
    if (existing) await supabase.from('cart_items').update({ quantity: qty }).eq('id', existing.id);
    else await supabase.from('cart_items').insert({ user_id: userId, variant_id: it.v, quantity: qty, customization_text: it.c });
  }
  await writeGuestCart([]);
}
