'use server';

import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/routing';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { orderRoleFor } from '@/lib/messages';
import { enforceRateLimit } from '@/lib/rate-limit';
import { notifyNewMessage } from '@/lib/email';
import { z } from 'zod';

const schema = z.object({
  order_id: z.string().uuid(),
  body: z.string().trim().min(1).max(2000),
});

export async function sendOrderMessage(formData: FormData) {
  const locale = await getLocale();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect({ href: '/login', locale });
  const backRaw = String(formData.get('return_to') ?? '/account');
  const back = backRaw.startsWith('/') && !backRaw.startsWith('//') ? backRaw : '/account';

  const parsed = schema.safeParse({ order_id: formData.get('order_id'), body: formData.get('body') });
  if (!parsed.success) redirect({ href: `${back}?msg=invalid#messages`, locale });
  if (!(await enforceRateLimit('order-message', 30, 10 * 60_000, user!.id))) redirect({ href: `${back}?msg=rate#messages`, locale });

  const admin = createAdminClient();
  const { data: order } = await admin.from('orders').select('id, customer_id, store_id, status').eq('id', parsed.data!.order_id).maybeSingle();
  if (!order || order.status === 'pending_payment' || order.status === 'cancelled') redirect({ href: back, locale });
  const role = await orderRoleFor(user!.id, order!);
  if (!role) redirect({ href: '/', locale });

  const { error } = await admin.from('order_messages').insert({
    order_id: order!.id,
    sender_id: user!.id,
    sender_role: role!,
    body: parsed.data!.body,
  });
  if (error) redirect({ href: `${back}?msg=invalid#messages`, locale });
  await notifyNewMessage(order!.id, role!, parsed.data!.body);
  revalidatePath('/', 'layout');
  redirect({ href: `${back}#messages`, locale });
}
