'use server';

import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/routing';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { readGuestCart, writeGuestCart } from '@/lib/guest-cart';
import { addGuestItem, removeGuestItem, setGuestQty } from '@/lib/guest-cart-core';
import { z } from 'zod';

const addSchema = z.object({
  variant_id: z.string().uuid(),
  product_slug: z.string().min(1),
  quantity: z.coerce.number().int().min(1).max(99),
  customization_text: z.string().max(200).default(''),
});

/** Aggiunge al carrello: utenti loggati nel database, ospiti in un cookie (unito al login). */
export async function addToCart(formData: FormData) {
  const locale = await getLocale();
  const parsed = addSchema.safeParse({
    variant_id: formData.get('variant_id'),
    product_slug: formData.get('product_slug'),
    quantity: formData.get('quantity') ?? 1,
    customization_text: (formData.get('customization_text') as string | null) ?? '',
  });
  if (!parsed.success) redirect({ href: '/cart?error=invalid', locale });
  const { variant_id, product_slug, quantity, customization_text } = parsed.data!;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // La RLS garantisce che la variante sia visibile solo se il prodotto è pubblicato.
  const { data: variant } = await supabase.from('product_variants').select('id, stock, products ( store_id, stores ( vacation_mode ) )').eq('id', variant_id).maybeSingle();
  if (!variant || variant.stock < 1) redirect({ href: `/product/${product_slug}?error=stock`, locale });
  const vp = variant!.products as unknown as { store_id: string; stores: { vacation_mode: boolean } | null } | null;
  if (vp?.stores?.vacation_mode) redirect({ href: `/product/${product_slug}?error=vacation`, locale });

  if (!user) {
    const items = await readGuestCart();
    await writeGuestCart(addGuestItem(items, { v: variant_id, q: quantity, c: customization_text }, variant!.stock));
  } else {
    const { data: existing } = await supabase
      .from('cart_items')
      .select('id, quantity')
      .eq('user_id', user.id)
      .eq('variant_id', variant_id)
      .eq('customization_text', customization_text)
      .maybeSingle();
    const newQty = Math.min((existing?.quantity ?? 0) + quantity, variant!.stock, 99);
    if (existing) await supabase.from('cart_items').update({ quantity: newQty }).eq('id', existing.id);
    else await supabase.from('cart_items').insert({ user_id: user.id, variant_id, quantity: newQty, customization_text });
  }
  // Funnel aggregato per shop e giorno (nessun dato personale). Non deve mai bloccare l'aggiunta al carrello.
  const storeId = vp?.store_id;
  if (storeId) {
    await createAdminClient()
      .rpc('track_funnel', { p_store_id: storeId, p_event: 'cart_add', p_n: 1 })
      .then(({ error }) => error && console.warn('[funnel]', error.message));
  }
  revalidatePath('/', 'layout');
  redirect({ href: `/product/${product_slug}?added=1`, locale });
}

const GUEST_PREFIX = 'guest:';

export async function updateCartItem(formData: FormData) {
  const rawId = String(formData.get('item_id') ?? '');
  const qty = z.coerce.number().int().min(1).max(99).safeParse(formData.get('quantity'));
  if (!qty.success) return;

  if (rawId.startsWith(GUEST_PREFIX)) {
    const idx = parseInt(rawId.slice(GUEST_PREFIX.length), 10);
    await writeGuestCart(setGuestQty(await readGuestCart(), idx, qty.data));
  } else {
    const id = z.string().uuid().safeParse(rawId);
    if (!id.success) return;
    const supabase = await createClient();
    await supabase.from('cart_items').update({ quantity: qty.data }).eq('id', id.data);
  }
  revalidatePath('/', 'layout');
}

export async function removeCartItem(formData: FormData) {
  const rawId = String(formData.get('item_id') ?? '');
  if (rawId.startsWith(GUEST_PREFIX)) {
    const idx = parseInt(rawId.slice(GUEST_PREFIX.length), 10);
    await writeGuestCart(removeGuestItem(await readGuestCart(), idx));
  } else {
    const id = z.string().uuid().safeParse(rawId);
    if (!id.success) return;
    const supabase = await createClient();
    await supabase.from('cart_items').delete().eq('id', id.data);
  }
  revalidatePath('/', 'layout');
}
