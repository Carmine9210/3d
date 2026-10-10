import { getLocale, getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { sendOrderMessage } from '@/lib/actions/messages';
import { markMessagesRead, type MessageRole } from '@/lib/messages';
import SubmitButton from './SubmitButton';
import LiveRefresh from './LiveRefresh';

/** Conversazione legata a un ordine: cliente, venditore e (se interviene) assistenza. */
export default async function OrderMessages({
  orderId,
  role,
  returnTo,
  error,
}: {
  orderId: string;
  role: MessageRole;
  returnTo: string;
  error?: string;
}) {
  const locale = await getLocale();
  const t = await getTranslations('messages');
  const supabase = await createClient();
  const { data: messages } = await supabase
    .from('order_messages')
    .select('id, sender_role, body, created_at, read_at')
    .eq('order_id', orderId)
    .order('created_at');
  await markMessagesRead(orderId, role);
  const fmt = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'it-IT', { dateStyle: 'short', timeStyle: 'short' });

  return (
    <section id="messages" aria-labelledby="msg-h" className="card space-y-4 p-4">
      <LiveRefresh orderId={orderId} />
      <h2 id="msg-h" className="font-display text-xl font-bold">{t('title')}</h2>
      <p className="text-sm text-ink-mute">{t(role === 'seller' ? 'introSeller' : 'introCustomer')}</p>
      {error && <p className="notice notice-error" role="alert">{t(error === 'rate' ? 'rate' : 'invalid')}</p>}
      {(messages ?? []).length === 0 ? (
        <p className="text-sm text-ink-soft">{t('empty')}</p>
      ) : (
        <ol className="space-y-3" aria-live="polite">
          {(messages ?? []).map((m) => {
            const mine = m.sender_role === role;
            return (
              <li key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-card px-3 py-2 text-sm ${mine ? 'bg-ink text-white' : m.sender_role === 'admin' ? 'border border-print bg-print-tint' : 'bg-paper border border-line'}`}>
                  <p className={`mb-1 text-xs ${mine ? 'text-white/70' : 'text-ink-mute'}`}>
                    {mine ? t('you') : t(`role.${m.sender_role as MessageRole}`)} · {fmt.format(new Date(m.created_at))}
                    {mine && m.read_at ? ` · ${t('read')}` : ''}
                  </p>
                  <p className="whitespace-pre-line break-words">{m.body}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <form action={sendOrderMessage} className="space-y-2">
        <input type="hidden" name="order_id" value={orderId} />
        <input type="hidden" name="return_to" value={returnTo} />
        <label className="label" htmlFor={`msg-${orderId}`}>{t('write')}</label>
        <textarea id={`msg-${orderId}`} name="body" rows={3} maxLength={2000} required className="field" placeholder={t('placeholder')} />
        <SubmitButton className="btn-dark">{t('send')}</SubmitButton>
      </form>
    </section>
  );
}
