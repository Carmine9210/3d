'use server';

import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/routing';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSellerContext, logAudit } from '@/lib/auth';
import { enforceRateLimit } from '@/lib/rate-limit';
import { addressSchema } from '@/lib/validators';
import { z } from 'zod';
import type { TablesUpdate } from '@/types/database';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/* ------------------------------------------------------------------ */
/* Profilo cliente                                                     */
/* ------------------------------------------------------------------ */
export async function updateProfile(formData: FormData) {
  const locale = await getLocale();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect({ href: '/login', locale });

  const parsed = z
    .object({
      display_name: z.string().min(2).max(60),
      phone: z.string().max(30).default(''),
      locale: z.enum(['it', 'en']),
    })
    .safeParse({
      display_name: formData.get('display_name'),
      phone: formData.get('phone') ?? '',
      locale: formData.get('locale'),
    });
  if (!parsed.success) redirect({ href: '/account/profile?error=invalid', locale });

  await supabase
    .from('profiles')
    .update({ display_name: parsed.data!.display_name, phone: parsed.data!.phone || null, locale: parsed.data!.locale })
    .eq('user_id', user!.id);
  revalidatePath('/', 'layout');
  redirect({ href: '/account/profile?saved=1', locale: parsed.data!.locale });
}

/**
 * Eliminazione account (diritto alla cancellazione).
 * - bloccata se ci sono ordini in corso o se l'utente è venditore (si passa dall'assistenza)
 * - senza ordini: l'utente viene eliminato del tutto
 * - con ordini passati: dati personali cancellati, ordini archiviati (obblighi fiscali) e accesso disattivato
 */
export async function deleteAccount(formData: FormData) {
  const locale = await getLocale();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect({ href: '/login', locale });
  const back = '/account/profile';

  if (!(await enforceRateLimit('delete-account', 3, 60 * 60_000, user!.id))) redirect({ href: `${back}?error=invalid`, locale });
  const confirm = String(formData.get('confirm_email') ?? '').trim().toLowerCase();
  if (!user!.email || confirm !== user!.email.toLowerCase()) redirect({ href: `${back}?error=confirm`, locale });

  const admin = createAdminClient();
  const { count: vendorCount } = await admin.from('vendors').select('id', { count: 'exact', head: true }).eq('user_id', user!.id);
  if ((vendorCount ?? 0) > 0) redirect({ href: `${back}?error=seller`, locale });

  const { data: orders } = await admin.from('orders').select('id, status').eq('customer_id', user!.id);
  const inProgress = (orders ?? []).some((o) => ['pending_payment', 'paid', 'in_production', 'shipped', 'disputed'].includes(o.status));
  if (inProgress) {
    // Gli ordini in attesa di pagamento non sono un impegno: si annullano. Gli altri bloccano la cancellazione.
    const blocking = (orders ?? []).some((o) => ['paid', 'in_production', 'shipped', 'disputed'].includes(o.status));
    if (blocking) redirect({ href: `${back}?error=open_orders`, locale });
    await admin.from('orders').update({ status: 'cancelled' }).eq('customer_id', user!.id).eq('status', 'pending_payment');
  }

  await admin.from('cart_items').delete().eq('user_id', user!.id);
  await admin.from('favorites').delete().eq('user_id', user!.id);
  await admin.from('addresses').delete().eq('user_id', user!.id);
  await admin.from('profiles').update({ display_name: 'Utente eliminato', phone: null, avatar_url: null }).eq('user_id', user!.id);
  await logAudit(admin, null, 'account.deleted', 'user', user!.id);

  const hasHistory = (orders ?? []).length > 0;
  if (hasHistory) {
    await admin.auth.admin.updateUserById(user!.id, {
      email: `deleted+${user!.id}@deleted.invalid`,
      user_metadata: {},
      ban_duration: '876000h',
    });
  } else {
    await admin.auth.admin.deleteUser(user!.id);
  }
  await supabase.auth.signOut();
  redirect({ href: '/?deleted=1', locale });
}

/* ------------------------------------------------------------------ */
/* Shop: dati, logo, copertina                                          */
/* ------------------------------------------------------------------ */
async function uploadStoreImage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  storeId: string,
  kind: 'logo' | 'cover',
  file: File,
): Promise<string | null> {
  const ext = IMAGE_EXT[file.type];
  if (!ext || file.size > MAX_IMAGE_BYTES) return null;
  const path = `${storeId}/${kind}-${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('store-assets').upload(path, file, { contentType: file.type, upsert: false });
  return error ? null : path;
}

export async function updateShop(formData: FormData) {
  const locale = await getLocale();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect({ href: '/login', locale });
  const { store } = await getSellerContext(user!.id);
  if (!store) redirect({ href: '/seller/onboarding', locale });

  const parsed = z
    .object({
      name: z.string().min(2).max(60),
      description_it: z.string().max(1500).default(''),
      description_en: z.string().max(1500).default(''),
      city: z.string().min(2).max(80),
      region: z.string().max(80).default(''),
      avg_production_days: z.coerce.number().int().min(0).max(90),
      return_policy: z.string().max(1500).default(''),
      vacation_message: z.string().trim().max(300).default(''),
      low_stock_threshold: z.coerce.number().int().min(0).max(100).default(2),
    })
    .safeParse({
      vacation_message: formData.get('vacation_message') ?? '',
      low_stock_threshold: formData.get('low_stock_threshold') ?? 2,
      name: formData.get('name'),
      description_it: formData.get('description_it') ?? '',
      description_en: formData.get('description_en') ?? '',
      city: formData.get('city'),
      region: formData.get('region') ?? '',
      avg_production_days: formData.get('avg_production_days') ?? 3,
      return_policy: formData.get('return_policy') ?? '',
    });
  if (!parsed.success) redirect({ href: '/seller/settings?error=invalid', locale });

  // Carico le immagini e rimuovo le vecchie, se sostituite o eliminate.
  const { data: current } = await supabase.from('stores').select('logo_url, cover_url').eq('id', store!.id).maybeSingle();
  const patch: TablesUpdate<'stores'> = {
    name: parsed.data!.name,
    description_it: parsed.data!.description_it,
    description_en: parsed.data!.description_en,
    city: parsed.data!.city,
    region: parsed.data!.region || null,
    avg_production_days: parsed.data!.avg_production_days,
    return_policy: parsed.data!.return_policy || null,
    vacation_mode: formData.get('vacation_mode') === 'on',
    vacation_message: parsed.data!.vacation_message || null,
    low_stock_threshold: parsed.data!.low_stock_threshold,
  };
  const toRemove: string[] = [];

  for (const kind of ['logo', 'cover'] as const) {
    const column = `${kind}_url` as 'logo_url' | 'cover_url';
    const file = formData.get(kind);
    // Percorso già caricato dal browser (DirectUpload): deve stare nella cartella del proprio shop.
    const directPath = String(formData.get(`${kind}_path`) ?? '');
    const directRe = new RegExp(`^${store!.id}/${kind}-[0-9a-f-]{36}\\.(jpg|png|webp)$`);
    if (directPath && directRe.test(directPath)) {
      if (current?.[column]) toRemove.push(current[column] as string);
      patch[column] = directPath;
    } else if (file instanceof File && file.size > 0) {
      const path = await uploadStoreImage(supabase, store!.id, kind, file);
      if (path) {
        if (current?.[column]) toRemove.push(current[column] as string);
        patch[column] = path;
      }
    } else if (formData.get(`remove_${kind}`) === 'on' && current?.[column]) {
      toRemove.push(current[column] as string);
      patch[column] = null;
    }
  }

  await supabase.from('stores').update(patch).eq('id', store!.id);
  if (toRemove.length) await supabase.storage.from('store-assets').remove(toRemove);
  revalidatePath('/', 'layout');
  redirect({ href: '/seller/settings?saved=1', locale });
}

/* ------------------------------------------------------------------ */
/* Rubrica indirizzi                                                    */
/* ------------------------------------------------------------------ */
export async function saveAddress(formData: FormData) {
  const locale = await getLocale();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect({ href: '/login?next=/account/addresses', locale });

  const parsed = addressSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect({ href: '/account/addresses?error=invalid', locale });
  const id = z.string().uuid().safeParse(formData.get('address_id'));
  const makeDefault = formData.get('is_default') === 'on';

  const { count } = await supabase.from('addresses').select('id', { count: 'exact', head: true }).eq('user_id', user!.id);
  if (!id.success && (count ?? 0) >= 10) redirect({ href: '/account/addresses?error=limit', locale });
  const isDefault = makeDefault || (count ?? 0) === 0;
  if (isDefault) await supabase.from('addresses').update({ is_default: false }).eq('user_id', user!.id);

  const row = { ...parsed.data!, user_id: user!.id, ...(isDefault ? { is_default: true } : {}) };
  // La RLS garantisce che si possano toccare solo i propri indirizzi.
  if (id.success) await supabase.from('addresses').update(row).eq('id', id.data);
  else await supabase.from('addresses').insert(row);
  revalidatePath('/', 'layout');
  redirect({ href: '/account/addresses?saved=1', locale });
}

export async function deleteAddress(formData: FormData) {
  const supabase = await createClient();
  const id = z.string().uuid().safeParse(formData.get('address_id'));
  if (!id.success) return;
  await supabase.from('addresses').delete().eq('id', id.data);
  revalidatePath('/', 'layout');
}

export async function setDefaultAddress(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const id = z.string().uuid().safeParse(formData.get('address_id'));
  if (!user || !id.success) return;
  await supabase.from('addresses').update({ is_default: false }).eq('user_id', user.id);
  await supabase.from('addresses').update({ is_default: true }).eq('id', id.data);
  revalidatePath('/', 'layout');
}
