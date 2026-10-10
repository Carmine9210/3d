import { getLocale, getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { resolveReport } from '@/lib/actions/admin';
import SubmitButton from '@/components/SubmitButton';

export default async function AdminReports() {
  const locale = await getLocale();
  const t = await getTranslations('admin');
  const r = await getTranslations('reportReasons');
  const supabase = await createClient();
  const { data: reports } = await supabase.from('reports').select('*').eq('status', 'open').order('created_at', { ascending: false }).limit(100);

  const btn = (id: string, decision: string, label: string, cls: string) => (
    <form action={resolveReport}>
      <input type="hidden" name="report_id" value={id} />
      <input type="hidden" name="decision" value={decision} />
      <SubmitButton className={cls}>{label}</SubmitButton>
    </form>
  );

  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-bold">{t('reports')}</h1>
      {(reports ?? []).length === 0 && <p className="notice">{t('nothing')}</p>}
      <ul className="space-y-2">
        {reports?.map((rep) => (
          <li key={rep.id} className="card space-y-2 p-4">
            <p className="text-sm text-ink-mute">{rep.target_type} · {rep.target_id} · {new Date(rep.created_at).toLocaleDateString(locale)}</p>
            <p className="font-semibold">{t('reason')}: {r(rep.reason as 'other')}</p>
            {rep.details && <p className="whitespace-pre-line text-sm">{rep.details}</p>}
            <div className="flex flex-wrap gap-2">
              {btn(rep.id, 'suspend_target', t('hideTarget'), 'btn-danger !py-1.5')}
              {btn(rep.id, 'resolve', t('resolve'), 'btn-ghost !py-1.5')}
              {btn(rep.id, 'dismiss', t('dismiss'), 'btn-ghost !py-1.5')}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
