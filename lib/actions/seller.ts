'use server';

import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/routing';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAppConfig } from '@/lib/config';
import { getSellerContext, logAudit } from '@/lib/auth';
import { productSchema, storeSchema, trackingSchema, variantSchema } from '@/lib/validators';
import { eurosToCents, randomSuffix, slugify } from '@/lib/utils';
import { z } from 'zod';
import type { Enums, TablesUpdate } from '@/types/database';
import { normalizeCode } from '@/lib/coupons';
import { notifyOrderShipped } from '@/lib/email';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

async function currentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/* ------------------------------------------------------------------ */
/* Onboarding: vendor + shop                                           */
/* ------------------------------------------------------------------ */
export async function createShop(formData: FormData) {
  const locale = await getLocale();
  const { user } = await currentUser();
  if (!user) redirect({ href: '/login?next=/seller/onboarding', locale });

  const parsed = storeSchema.safeParse({
    name: formData.get('name'),
    vendorType: formData.get('vendorType'),
    description_it: formData.get('description_it') ?? '',
    description_en: formData.get('description_en') ?? '',
    city: formData.get('city'),
    region: formData.get('region') ?? '',
    phone: formData.get('phone'),
    avg_production_days: formData.get('avg_production_days') ?? 3,
    return_policy: formData.get('return_policy') ?? '',
    taxId: formData.get('taxId'),
    acceptTerms: formData.get('acceptTerms'),
  });
  if (!parsed.success) redirect({ href: '/seller/onboarding?error=invalid', locale });
  const d = parsed.data!;

  const admin = createAdminClient();
  const existing = await getSellerContext(user!.id);
  if (existing.vendor) redirect({ href: '/seller', locale });

  const config = await getAppConfig();
  const { data: vendor, error: vErr } = await admin
    .from('vendors')
    .insert({
      user_id: user!.id,
      type: d.vendorType,
      status: 'active',
      commission_bps: config.default_commission_bps,
      tax_data: { tax_id: d.taxId },
      accepted_terms_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (vErr || !vendor) redirect({ href: '/seller/onboarding?error=generic', locale });

  const slug = `${slugify(d.name) || 'shop'}-${randomSuffix(4)}`;
  const { error: sErr } = await admin.from('stores').insert({
    vendor_id: vendor!.id,
    slug,
    name: d.name,
    description_it: d.description_it,
    description_en: d.description_en,
    city: d.city,
    region: d.region || null,
    avg_production_days: d.avg_production_days,
    return_policy: d.return_policy || null,
  });
  if (sErr) {
    await admin.from('vendors').delete().eq('id', vendor!.id);
    redirect({ href: '/seller/onboarding?error=generic', locale });
  }

  await admin.from('profiles').update({ role: 'seller', phone: d.phone }).eq('user_id', user!.id);
  await logAudit(admin, user!.id, 'seller.shop_created', 'vendor', vendor!.id);
  redirect({ href: '/seller?welcome=1', locale });
}

/* ------------------------------------------------------------------ */
/* Prodotti                                                            */
/* ------------------------------------------------------------------ */
function readProductForm(formData: FormData) {
  return productSchema.safeParse({
    title_it: (formData.get('title_it') as string) ?? '',
    title_en: (formData.get('title_en') as string) ?? '',
    description_it: (formData.get('description_it') as string) ?? '',
    description_en: (formData.get('description_en') as string) ?? '',
    category_id: formData.get('category_id'),
    price: formData.get('price'),
    production_days: formData.get('production_days') ?? 3,
    is_customizable: formData.get('is_customizable') === 'on',
    customization_note: (formData.get('customization_note') as string) ?? '',
    local_pickup: formData.get('local_pickup') === 'on',
  });
}

export async function createProduct(formData: FormData) {
  const locale = await getLocale();
  const { supabase, user } = await currentUser();
  if (!user) redirect({ href: '/login', locale });
  const { store } = await getSellerContext(user!.id);
  if (!store) redirect({ href: '/seller/onboarding', locale });

  const parsed = readProductForm(formData);
  const variant = variantSchema.safeParse({
    material: formData.get('material') ?? '',
    color: formData.get('color') ?? '',
    size: formData.get('size') ?? '',
    finish: formData.get('finish') ?? '',
    price_delta: '0',
    stock: formData.get('stock') ?? 0,
  });
  const cents = parsed.success ? eurosToCents(parsed.data.price) : NaN;
  if (!parsed.success || !variant.success || !Number.isFinite(cents) || cents < 50) {
    redirect({ href: '/seller/products/new?error=invalid', locale });
  }
  const p = parsed.data!;
  const base = slugify(p.title_it || p.title_en) || 'prodotto';

  const { data: product, error } = await supabase
    .from('products')
    .insert({
      store_id: store!.id,
      category_id: p.category_id,
      slug: `${base}-${randomSuffix(5)}`,
      title_it: p.title_it,
      title_en: p.title_en,
      description_it: p.description_it,
      description_en: p.description_en,
      base_price_cents: cents,
      production_days: p.production_days,
      is_customizable: p.is_customizable,
      customization_note: p.customization_note || null,
      local_pickup: p.local_pickup,
      status: 'draft',
    })
    .select('id')
    .single();
  if (error || !product) redirect({ href: '/seller/products/new?error=generic', locale });

  const v = variant.data!;
  await supabase.from('product_variants').insert({
    product_id: product!.id,
    material: v.material || null,
    color: v.color || null,
    size: v.size || null,
    finish: v.finish || null,
    stock: v.stock,
  });
  redirect({ href: `/seller/products/${product!.id}?created=1`, locale });
}

export async function updateProduct(formData: FormData) {
  const locale = await getLocale();
  const { supabase, user } = await currentUser();
  if (!user) redirect({ href: '/login', locale });
  const id = z.string().uuid().safeParse(formData.get('product_id'));
  if (!id.success) redirect({ href: '/seller/products', locale });

  const parsed = readProductForm(formData);
  const cents = parsed.success ? eurosToCents(parsed.data.price) : NaN;
  if (!parsed.success || !Number.isFinite(cents) || cents < 50) {
    redirect({ href: `/seller/products/${id.data}?error=invalid`, locale });
  }
  const p = parsed.data!;
  // La RLS limita l'update ai prodotti del proprio shop.
  await supabase
    .from('products')
    .update({
      category_id: p.category_id,
      title_it: p.title_it,
      title_en: p.title_en,
      description_it: p.description_it,
      description_en: p.description_en,
      base_price_cents: cents,
      production_days: p.production_days,
      is_customizable: p.is_customizable,
      customization_note: p.customization_note || null,
      local_pickup: p.local_pickup,
    })
    .eq('id', id.data!);
  revalidatePath('/', 'layout');
  redirect({ href: `/seller/products/${id.data}?saved=1`, locale });
}

export async function addVariant(formData: FormData) {
  const locale = await getLocale();
  const { supabase, user } = await currentUser();
  if (!user) redirect({ href: '/login', locale });
  const id = z.string().uuid().safeParse(formData.get('product_id'));
  if (!id.success) redirect({ href: '/seller/products', locale });
  const v = variantSchema.safeParse({
    material: formData.get('material') ?? '',
    color: formData.get('color') ?? '',
    size: formData.get('size') ?? '',
    finish: formData.get('finish') ?? '',
    price_delta: formData.get('price_delta') ?? '0',
    stock: formData.get('stock') ?? 0,
  });
  const delta = v.success ? eurosToCents(v.data.price_delta || '0') : NaN;
  if (!v.success || !Number.isFinite(delta)) redirect({ href: `/seller/products/${id.data}?error=invalid`, locale });
  await supabase.from('product_variants').insert({
    product_id: id.data!,
    material: v.data!.material || null,
    color: v.data!.color || null,
    size: v.data!.size || null,
    finish: v.data!.finish || null,
    price_delta_cents: delta,
    stock: v.data!.stock,
  });
  redirect({ href: `/seller/products/${id.data}?saved=1`, locale });
}

export async function updateVariantStock(formData: FormData) {
  const { supabase } = await currentUser();
  const parsed = z
    .object({ variant_id: z.string().uuid(), stock: z.coerce.number().int().min(0).max(100000) })
    .safeParse({ variant_id: formData.get('variant_id'), stock: formData.get('stock') });
  if (!parsed.success) return;
  await supabase.from('product_variants').update({ stock: parsed.data.stock }).eq('id', parsed.data.variant_id);
  revalidatePath('/', 'layout');
}

export async function deleteVariant(formData: FormData) {
  const { supabase } = await currentUser();
  const id = z.string().uuid().safeParse(formData.get('variant_id'));
  if (!id.success) return;
  await supabase.from('product_variants').delete().eq('id', id.data);
  revalidatePath('/', 'layout');
}

export async function uploadProductImages(formData: FormData) {
  const locale = await getLocale();
  const { supabase, user } = await currentUser();
  if (!user) redirect({ href: '/login', locale });
  const id = z.string().uuid().safeParse(formData.get('product_id'));
  if (!id.success) redirect({ href: '/seller/products', locale });

  const { data: product } = await supabase.from('products').select('id, store_id, title_it, title_en').eq('id', id.data!).maybeSingle();
  if (!product) redirect({ href: '/seller/products', locale });

  const { count } = await supabase
    .from('product_images')
    .select('id', { count: 'exact', head: true })
    .eq('product_id', product!.id);
  let order = count ?? 0;

  const MAX_IMAGES = 12;
  const alt = product!.title_it || product!.title_en;

  // 1) Percorsi già caricati dal browser direttamente su Storage (DirectUpload): li verifico e li registro.
  const prefix = `${product!.store_id}/${product!.id}/`;
  const pathRe = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/;
  const uploaded = [...new Set(formData.getAll('uploaded_path').map(String))]
    .filter((p) => p.startsWith(prefix) && pathRe.test(p));
  for (const path of uploaded) {
    if (order >= MAX_IMAGES) break;
    await supabase.from('product_images').insert({ product_id: product!.id, storage_path: path, alt, sort_order: order++ });
  }

  // 2) Fallback senza JavaScript: file inviati nel form (piccoli, il limite di Netlify è ~6 MB per richiesta).
  const files = formData.getAll('images').filter((f): f is File => f instanceof File && f.size > 0);
  for (const file of files.slice(0, 8)) {
    if (order >= MAX_IMAGES) break;
    const ext = ALLOWED_IMAGE_TYPES[file.type];
    if (!ext || file.size > MAX_IMAGE_BYTES) continue; // tipo/dimensione non validi: ignora
    const path = `${prefix}${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from('product-images').upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
    if (error) continue;
    await supabase.from('product_images').insert({ product_id: product!.id, storage_path: path, alt, sort_order: order++ });
  }
  revalidatePath('/', 'layout');
  redirect({ href: `/seller/products/${product!.id}?saved=1`, locale });
}

export async function deleteProductImage(formData: FormData) {
  const { supabase } = await currentUser();
  const id = z.string().uuid().safeParse(formData.get('image_id'));
  if (!id.success) return;
  const { data: img } = await supabase.from('product_images').select('id, storage_path').eq('id', id.data).maybeSingle();
  if (!img) return;
  // Prima la riga (la RLS consente solo i propri prodotti), poi il file se nessun'altra scheda lo usa (es. prodotti duplicati).
  const { data: removed } = await supabase.from('product_images').delete().eq('id', img.id).select('id');
  if (!removed || removed.length === 0) return;
  const { count } = await createAdminClient().from('product_images').select('id', { count: 'exact', head: true }).eq('storage_path', img.storage_path);
  if (!count) await supabase.storage.from('product-images').remove([img.storage_path]);
  revalidatePath('/', 'layout');
}

/**
 * Pubblicazione con moderazione:
 * - shop con meno di `auto_publish_threshold` prodotti già pubblicati -> "pending" (revisione admin)
 * - altrimenti pubblicazione diretta.
 * Richiede almeno una foto e lo Stripe Connect attivo.
 */
export async function publishProduct(formData: FormData) {
  const locale = await getLocale();
  const { supabase, user } = await currentUser();
  if (!user) redirect({ href: '/login', locale });
  const id = z.string().uuid().safeParse(formData.get('product_id'));
  if (!id.success) redirect({ href: '/seller/products', locale });

  const { vendor, store } = await getSellerContext(user!.id);
  if (!vendor || !store || vendor.status !== 'active') redirect({ href: '/seller', locale });
  if (!vendor!.charges_enabled) redirect({ href: `/seller/products/${id.data}?error=stripe`, locale });

  const { data: product } = await supabase
    .from('products')
    .select('id, status, store_id')
    .eq('id', id.data!)
    .eq('store_id', store!.id)
    .maybeSingle();
  if (!product || product.status === 'suspended') redirect({ href: '/seller/products', locale });

  const { count: images } = await supabase
    .from('product_images')
    .select('id', { count: 'exact', head: true })
    .eq('product_id', product!.id);
  if (!images) redirect({ href: `/seller/products/${id.data}?error=image`, locale });

  const config = await getAppConfig();
  const { count: publishedCount } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', store!.id)
    .eq('status', 'published');
  const direct = (publishedCount ?? 0) >= config.auto_publish_threshold;

  // La transizione di stato è una scrittura privilegiata (il trigger guard_products blocca i venditori).
  const admin = createAdminClient();
  await admin
    .from('products')
    .update({ status: direct ? 'published' : 'pending' })
    .eq('id', product!.id);
  await logAudit(admin, user!.id, direct ? 'product.published' : 'product.submitted', 'product', product!.id);
  revalidatePath('/', 'layout');
  redirect({ href: `/seller/products/${product!.id}?${direct ? 'published=1' : 'submitted=1'}`, locale });
}

export async function unpublishProduct(formData: FormData) {
  const locale = await getLocale();
  const { supabase, user } = await currentUser();
  if (!user) redirect({ href: '/login', locale });
  const id = z.string().uuid().safeParse(formData.get('product_id'));
  if (!id.success) redirect({ href: '/seller/products', locale });
  // published/pending -> draft è consentito al venditore (il trigger blocca solo verso published/pending/suspended).
  await supabase.from('products').update({ status: 'draft' }).eq('id', id.data!);
  revalidatePath('/', 'layout');
  redirect({ href: `/seller/products/${id.data}?saved=1`, locale });
}

/* ------------------------------------------------------------------ */
/* Ordini del venditore                                                */
/* ------------------------------------------------------------------ */
const NEXT_STATUS: Partial<Record<Enums<'order_status'>, Enums<'order_status'>>> = {
  paid: 'in_production',
  in_production: 'shipped',
  shipped: 'delivered',
};

export async function advanceOrder(formData: FormData) {
  const locale = await getLocale();
  const { user } = await currentUser();
  if (!user) redirect({ href: '/login', locale });
  const backRaw = String(formData.get('return_to') ?? '/seller/orders');
  const back = /^\/seller\/orders(\/[0-9a-f-]{36})?$/.test(backRaw) ? backRaw : '/seller/orders';
  const id = z.string().uuid().safeParse(formData.get('order_id'));
  if (!id.success) redirect({ href: back, locale });

  const { store } = await getSellerContext(user!.id);
  if (!store) redirect({ href: '/seller/onboarding', locale });

  const admin = createAdminClient();
  const { data: order } = await admin
    .from('orders')
    .select('id, status, store_id, pickup')
    .eq('id', id.data!)
    .eq('store_id', store!.id)
    .maybeSingle();
  if (!order) redirect({ href: back, locale });

  const next = NEXT_STATUS[order!.status];
  if (!next) redirect({ href: back, locale });

  const patch: TablesUpdate<'orders'> = { status: next };
  if (next === 'shipped' && !order!.pickup) {
    const t = trackingSchema.safeParse({
      carrier: formData.get('carrier'),
      tracking_code: formData.get('tracking_code'),
    });
    if (!t.success) redirect({ href: `${back}?error=tracking`, locale });
    patch.carrier = t.data!.carrier;
    patch.tracking_code = t.data!.tracking_code;
  }
  await admin.from('orders').update(patch).eq('id', order!.id);
  await logAudit(admin, user!.id, `order.${next}`, 'order', order!.id);
  if (next === 'shipped') await notifyOrderShipped(order!.id);
  revalidatePath('/', 'layout');
  redirect({ href: `${back}?saved=1`, locale });
}

/* ------------------------------------------------------------------ */
/* Risposta pubblica a una recensione                                   */
/* ------------------------------------------------------------------ */
export async function replyToReview(formData: FormData) {
  const locale = await getLocale();
  const { user } = await currentUser();
  if (!user) redirect({ href: '/login', locale });
  const { store } = await getSellerContext(user!.id);
  if (!store) redirect({ href: '/seller/onboarding', locale });

  const parsed = z
    .object({ review_id: z.string().uuid(), reply: z.string().trim().max(1500) })
    .safeParse({ review_id: formData.get('review_id'), reply: formData.get('reply') ?? '' });
  if (!parsed.success) redirect({ href: '/seller/reviews?error=invalid', locale });

  // Le recensioni sono scritte solo dal server: verifico che appartenga al mio shop, poi aggiorno con il service role.
  const admin = createAdminClient();
  const { data: review } = await admin.from('reviews').select('id, store_id').eq('id', parsed.data!.review_id).maybeSingle();
  if (!review || review.store_id !== store!.id) redirect({ href: '/seller/reviews', locale });
  const reply = parsed.data!.reply;
  await admin
    .from('reviews')
    .update({ seller_reply: reply || null, seller_replied_at: reply ? new Date().toISOString() : null })
    .eq('id', review!.id);
  await logAudit(admin, user!.id, reply ? 'review.replied' : 'review.reply_removed', 'review', review!.id);
  revalidatePath('/', 'layout');
  redirect({ href: '/seller/reviews?saved=1', locale });
}

/* ------------------------------------------------------------------ */
/* Codici sconto                                                        */
/* ------------------------------------------------------------------ */
export async function createCoupon(formData: FormData) {
  const locale = await getLocale();
  const { supabase, user } = await currentUser();
  if (!user) redirect({ href: '/login', locale });
  const { store } = await getSellerContext(user!.id);
  if (!store) redirect({ href: '/seller/onboarding', locale });

  const parsed = z
    .object({
      code: z.string().transform(normalizeCode).pipe(z.string().regex(/^[A-Z0-9_-]{3,24}$/)),
      kind: z.enum(['percent', 'fixed']),
      value: z.string().min(1),
      min_subtotal: z.string().default(''),
      expires_at: z.string().default(''),
      max_uses: z.string().default(''),
    })
    .safeParse({
      code: formData.get('code') ?? '',
      kind: formData.get('kind'),
      value: formData.get('value') ?? '',
      min_subtotal: formData.get('min_subtotal') ?? '',
      expires_at: formData.get('expires_at') ?? '',
      max_uses: formData.get('max_uses') ?? '',
    });
  if (!parsed.success) redirect({ href: '/seller/coupons?error=invalid', locale });
  const d = parsed.data!;
  const value = d.kind === 'percent' ? Math.round(Number(d.value.replace(',', '.'))) : eurosToCents(d.value);
  const minSubtotal = d.min_subtotal ? eurosToCents(d.min_subtotal) : 0;
  const maxUses = d.max_uses ? parseInt(d.max_uses, 10) : null;
  const expires = d.expires_at ? new Date(`${d.expires_at}T23:59:59`) : null;
  const invalid =
    !Number.isFinite(value) || value <= 0 || (d.kind === 'percent' && value > 90) ||
    !Number.isFinite(minSubtotal) || minSubtotal < 0 ||
    (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1)) ||
    (expires !== null && Number.isNaN(expires.getTime()));
  if (invalid) redirect({ href: '/seller/coupons?error=invalid', locale });

  // La RLS consente l'inserimento solo per il proprio shop; il trigger azzera gli utilizzi.
  const { error } = await supabase.from('coupons').insert({
    store_id: store!.id,
    code: d.code,
    kind: d.kind,
    value,
    min_subtotal_cents: minSubtotal,
    expires_at: expires ? expires.toISOString() : null,
    max_uses: maxUses,
  });
  if (error) redirect({ href: `/seller/coupons?error=${error.code === '23505' ? 'exists' : 'invalid'}`, locale });
  revalidatePath('/', 'layout');
  redirect({ href: '/seller/coupons?saved=1', locale });
}

export async function toggleCoupon(formData: FormData) {
  const { supabase } = await currentUser();
  const parsed = z
    .object({ coupon_id: z.string().uuid(), active: z.enum(['1', '0']) })
    .safeParse({ coupon_id: formData.get('coupon_id'), active: formData.get('active') });
  if (!parsed.success) return;
  await supabase.from('coupons').update({ active: parsed.data.active === '1' }).eq('id', parsed.data.coupon_id);
  revalidatePath('/', 'layout');
}

export async function deleteCoupon(formData: FormData) {
  const { supabase } = await currentUser();
  const id = z.string().uuid().safeParse(formData.get('coupon_id'));
  if (!id.success) return;
  // Gli ordini conservano codice e importo dello sconto anche se il codice viene eliminato.
  await supabase.from('coupons').delete().eq('id', id.data);
  revalidatePath('/', 'layout');
}

/** Duplica un prodotto come bozza (varianti e foto incluse): utile per varianti di colore o serie simili. */
export async function duplicateProduct(formData: FormData) {
  const locale = await getLocale();
  const { supabase, user } = await currentUser();
  if (!user) redirect({ href: '/login', locale });
  const { store } = await getSellerContext(user!.id);
  if (!store) redirect({ href: '/seller/onboarding', locale });
  const id = z.string().uuid().safeParse(formData.get('product_id'));
  if (!id.success) redirect({ href: '/seller/products', locale });

  const { data: src } = await supabase
    .from('products')
    .select('*, product_variants ( material, color, size, finish, price_delta_cents, stock, sku ), product_images ( storage_path, alt, sort_order )')
    .eq('id', id.data!)
    .eq('store_id', store!.id)
    .maybeSingle();
  if (!src) redirect({ href: '/seller/products', locale });
  const copyLabel = locale === 'en' ? ' (copy)' : ' (copia)';
  const base = slugify(src!.title_it || src!.title_en) || 'prodotto';
  const { data: copy, error } = await supabase
    .from('products')
    .insert({
      store_id: store!.id,
      category_id: src!.category_id,
      slug: `${base}-${randomSuffix(5)}`,
      title_it: src!.title_it ? `${src!.title_it}${copyLabel}`.slice(0, 120) : '',
      title_en: src!.title_en ? `${src!.title_en}${copyLabel}`.slice(0, 120) : '',
      description_it: src!.description_it,
      description_en: src!.description_en,
      base_price_cents: src!.base_price_cents,
      currency: src!.currency,
      production_days: src!.production_days,
      is_customizable: src!.is_customizable,
      customization_note: src!.customization_note,
      local_pickup: src!.local_pickup,
      status: 'draft',
    })
    .select('id')
    .single();
  if (error || !copy) redirect({ href: `/seller/products/${id.data}?error=invalid`, locale });
  const variants = src!.product_variants ?? [];
  if (variants.length) await supabase.from('product_variants').insert(variants.map((v) => ({ ...v, sku: null, product_id: copy!.id })));
  else await supabase.from('product_variants').insert({ product_id: copy!.id, stock: 0 });
  const images = src!.product_images ?? [];
  if (images.length) await supabase.from('product_images').insert(images.map((im) => ({ ...im, product_id: copy!.id })));
  await logAudit(createAdminClient(), user!.id, 'product.duplicated', 'product', copy!.id, { from: id.data! });
  revalidatePath('/', 'layout');
  redirect({ href: `/seller/products/${copy!.id}?created=1`, locale });
}
