import { getTranslations } from 'next-intl/server';

/** Form GET verso l'endpoint CSV con intervallo di date (predefinito: ultimi 90 giorni). */
export default async function ExportCsvForm({ action }: { action: string }) {
  const t = await getTranslations('export');
  const today = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);
  return (
    <form method="get" action={action} className="card flex flex-wrap items-end gap-3 p-4">
      <div>
        <label className="label" htmlFor="exp-from">{t('from')}</label>
        <input id="exp-from" name="from" type="date" defaultValue={from} className="field" />
      </div>
      <div>
        <label className="label" htmlFor="exp-to">{t('to')}</label>
        <input id="exp-to" name="to" type="date" defaultValue={today} className="field" />
      </div>
      <button type="submit" className="btn-ghost">{t('download')}</button>
      <p className="w-full text-xs text-ink-mute">{t('hint')}</p>
    </form>
  );
}
