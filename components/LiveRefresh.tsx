'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserClient } from '@/lib/supabase/browser';

/** Ricarica i dati della pagina quando arriva un nuovo messaggio sull'ordine (Supabase Realtime, soggetto a RLS). */
export default function LiveRefresh({ orderId }: { orderId: string }) {
  const router = useRouter();
  useEffect(() => {
    const supabase = getBrowserClient();
    const channel = supabase
      .channel(`order-messages-${orderId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'order_messages', filter: `order_id=eq.${orderId}` }, () => router.refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId, router]);
  return null;
}
