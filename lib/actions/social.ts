'use server';

import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/routing';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { reportSchema, reviewSchema } from '@/lib/validators';
import { z } from 'zod';
import { enforceRateLimit } from '@/lib/rate-limit';

export async function toggleFavorite(formData: FormData) {
  const locale = await getLocale();
  const productId = z.string().uuid().safeParse(formData.get('product_id'));
  const slug = String(formData.get('product_slug') ?? '');
  if (!productId.success) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect({ href: `/login?next=${encodeURIComponent(`/product/${slug}`)}`, locale });

  const { data: existing } = await supabase
    .from('favorites')
    .select('id')
    .eq('user_id', user!.id)
    .eq('product_id', productId.data)
    .maybeSingle();
  if (existing) await supabase.from('favorites').delete().eq('id', existing.id);
  else await supabase.from('favorites').insert({ user_id: user!.id, product_id: productId.data });
  revalidatePath('/', 'layout');
}

export async function submitReport(formData: FormData) {
  const locale = await getLocale();
  const slug = String(formData.get('return_to') ?? '/');
  const back = slug.startsWith('/') && !slug.startsWith('//') ? slug : '/';
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect({ href: `/login?next=${encodeURIComponent(back)}`, locale });
  if (!(await enforceRateLimit('report', 10, 60 * 60_000, user!.id))) redirect({ href: back, locale });

  const parsed = reportSchema.safeParse({
    target_type: formData.get('target_type'),
    target_id: formData.get('target_id'),
    reason: formData.get('reason'),
    details: formData.get('details') ?? '',
  });
  if (!parsed.success) redirect({ href: back, locale });

  await supabase.from('reports').insert({
    reporter_id: user!.id,
    target_type: parsed.data!.target_type,
    target_id: parsed.data!.target_id,
    reason: parsed.data!.reason,
    details: parsed.data!.details || null,
  });
  redirect({ href: `${back}${back.includes('?') ? '&' : '?'}reported=1`, locale });
}

/** Recensione consentita solo su ordini propri, pagati e contenenti quel prodotto. */
export async function submitReview(formData: FormData) {
  const locale = await getLocale();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect({ href: '/login', locale });

  const ids = z
    .object({ order_id: z.string().uuid(), product_id: z.string().uuid() })
    .safeParse({ order_id: formData.get('order_id'), product_id: formData.get('product_id') });
  const review = reviewSchema.safeParse({ rating: formData.get('rating'), comment: formData.get('comment') ?? '' });
  if (!ids.success || !review.success) redirect({ href: '/account', locale });

  const admin = createAdminClient();
  const { data: order } = await admin
    .from('orders')
    .select('id, store_id, status, order_items!inner(product_id)')
    .eq('id', ids.data!.order_id)
    .eq('customer_id', user!.id)
    .eq('order_items.product_id', ids.data!.product_id)
    .in('status', ['shipped', 'delivered'])
    .maybeSingle();
  if (!order) redirect({ href: '/account', locale });

  await admin.from('reviews').upsert(
    {
      order_id: order!.id,
      product_id: ids.data!.product_id,
      store_id: order!.store_id,
      customer_id: user!.id,
      rating: review.data!.rating,
      comment: review.data!.comment,
    },
    { onConflict: 'order_id,product_id' },
  );
  revalidatePath('/', 'layout');
  redirect({ href: `/account/orders/${order!.id}?reviewed=1`, locale });
}
