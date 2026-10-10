import { getLocale, getTranslations } from 'next-intl/server';
import { getAppConfig } from '@/lib/config';
import { updateConfig } from '@/lib/actions/admin';
import SubmitButton from '@/components/SubmitButton';

export default async function AdminSettings({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await getLocale();
  const sp = await searchParams;
  const t = await getTranslations('admin');
  const c = await getTranslations('common');
  const cfg = await getAppConfig();

  const field = (name: string, label: string, value: number, step = '0.01') => (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <input id={name} name={name} type="number" step={step} min={0} required defaultValue={value} className="field !w-40" />
    </div>
  );

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="font-display text-3xl font-bold">{t('settings')}</h1>
      <p className="text-ink-soft">{t('settingsIntro')}</p>
      {sp.saved && <p className="notice notice-ok" role="status">{c('saved')}</p>}
      {sp.error && <p className="notice notice-error" role="alert">{c('error')}</p>}
      <form action={updateConfig} className="card space-y-4 p-5">
        {field('commission_pct', t('commissionPct'), cfg.default_commission_bps / 100)}
        <p className="-mt-2 text-sm text-ink-mute">{t('commissionNote')}</p>
        {field('auto_publish_threshold', t('autoPublish'), cfg.auto_publish_threshold, '1')}
        {field('shipping_flat_eur', t('shippingFlat'), cfg.shipping_flat_cents / 100)}
        {field('free_shipping_over_eur', t('freeShipping'), cfg.free_shipping_over_cents / 100)}
        <SubmitButton className="btn-primary">{c('save')}</SubmitButton>
      </form>
    </div>
  );
}
