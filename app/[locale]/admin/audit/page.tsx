import { getLocale, getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';

export default async function AdminAudit() {
  const locale = await getLocale();
  const t = await getTranslations('admin');
  const c = await getTranslations('common');
  const supabase = await createClient();
  const { data: logs } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(200);
  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-bold">{t('audit')}</h1>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead>
            <tr className="border-b border-line"><th className="py-2">{c('date')}</th><th>{t('action')}</th><th>{t('target')}</th><th>{t('actor')}</th></tr>
          </thead>
          <tbody>
            {logs?.map((l) => (
              <tr key={l.id} className="border-b border-line align-top">
                <td className="py-2">{new Date(l.created_at).toLocaleString(locale)}</td>
                <td>{l.action}</td>
                <td className="break-all">{l.target_type} {l.target_id}</td>
                <td className="break-all">{l.actor_id ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
