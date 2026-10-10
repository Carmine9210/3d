import { getTranslations } from 'next-intl/server';
import { submitReport } from '@/lib/actions/social';
import SubmitButton from './SubmitButton';

export default async function ReportForm({
  targetType,
  targetId,
  returnTo,
  label,
}: {
  targetType: 'product' | 'store' | 'review';
  targetId: string;
  returnTo: string;
  label: string;
}) {
  const t = await getTranslations('reportReasons');
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-ink-mute underline">{label}</summary>
      <form action={submitReport} className="card mt-2 space-y-3 p-3">
        <input type="hidden" name="target_type" value={targetType} />
        <input type="hidden" name="target_id" value={targetId} />
        <input type="hidden" name="return_to" value={returnTo} />
        <div>
          <label className="label" htmlFor={`reason-${targetId}`}>{label}</label>
          <select id={`reason-${targetId}`} name="reason" className="field" required>
            {(['counterfeit', 'dangerous', 'illegal', 'misleading', 'other'] as const).map((r) => (
              <option key={r} value={r}>{t(r)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor={`details-${targetId}`}>{t('details')}</label>
          <textarea id={`details-${targetId}`} name="details" rows={3} maxLength={1000} className="field" />
        </div>
        <SubmitButton className="btn-ghost">{t('send')}</SubmitButton>
      </form>
    </details>
  );
}
