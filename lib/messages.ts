import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSellerContext } from '@/lib/auth';

export type MessageRole = 'customer' | 'seller' | 'admin';

/** Ruolo di chi sta guardando l'ordine (null = nessun accesso). Ricontrollato sul server a ogni azione. */
export async function orderRoleFor(userId: string, order: { customer_id: string; store_id: string }): Promise<MessageRole | null> {
  if (order.customer_id === userId) return 'customer';
  const { store } = await getSellerContext(userId);
  if (store?.id === order.store_id) return 'seller';
  const supabase = await createClient();
  const { data: profile } = await supabase.from('profiles').select('role').eq('user_id', userId).maybeSingle();
  return profile?.role === 'admin' ? 'admin' : null;
}

/** Segna come letti i messaggi ricevuti dall'altra parte. */
export async function markMessagesRead(orderId: string, role: MessageRole) {
  const admin = createAdminClient();
  await admin
    .from('order_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('order_id', orderId)
    .neq('sender_role', role)
    .is('read_at', null);
}
