import Image from 'next/image';
import { getLocale, getTranslations } from 'next-intl/server';
import { requireSeller } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { updateShop } from '@/lib/actions/account';
import { storeAssetUrl } from '@/lib/utils';
import SubmitButton from '@/components/SubmitButton';
import DirectUpload from '@/components/DirectUpload';

export default async function ShopSettings({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const locale = await getLocale();
  const { store } = await requireSeller(locale);
  const sp = await searchParams;
  const t = await getTranslations('seller');
  const c = await getTranslations('common');
  const supabase = await createClient();
  const { data: s } = await supabase.from('stores').select('*').eq('id', store.id).single();
  if (!s) return null;

  const text = (name: string, label: string, value: string | null, required = true) => (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <input id={name} name={name} defaultValue={value ?? ''} required={required} className="field" />
    </div>
  );

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="font-display text-3xl font-bold">{t('shopSettings')}</h1>
      {sp.saved && <p className="notice notice-ok" role="status">{c('saved')}</p>}
      {sp.error && <p className="notice notice-error" role="alert">{c('error')}</p>}
      <form action={updateShop} className="space-y-4">
        <fieldset className="card space-y-4 p-5">
          <div>
            <p className="label">{t('cover')}</p>
            {s.cover_url && (
              <div className="relative mb-2 aspect-[3/1] overflow-hidden rounded-card bg-print-tint">
                <Image src={storeAssetUrl(s.cover_url)} alt="" fill sizes="(max-width: 768px) 100vw, 42rem" className="object-cover" />
              </div>
            )}
            <DirectUpload
              id="cover-upload"
              bucket="store-assets"
              prefix={s.id}
              filePrefix="cover-"
              name="cover_path"
              labels={{ choose: t('cover'), uploading: t('uploading'), failed: t('uploadFailed'), invalid: t('uploadPartial'), done: t('uploadReady') }}
            />
            <p className="mt-1 text-xs text-ink-mute">{t('imageHint')}</p>
            {s.cover_url && <label className="mt-1 flex items-center gap-2 text-sm"><input type="checkbox" name="remove_cover" /> {t('removeCover')}</label>}
          </div>
          <div>
            <p className="label">{t('logo')}</p>
            {s.logo_url && (
              <div className="relative mb-2 h-20 w-20 overflow-hidden rounded-card bg-print-tint">
                <Image src={storeAssetUrl(s.logo_url)} alt="" fill sizes="80px" className="object-cover" />
              </div>
            )}
            <DirectUpload
              id="logo-upload"
              bucket="store-assets"
              prefix={s.id}
              filePrefix="logo-"
              name="logo_path"
              labels={{ choose: t('logo'), uploading: t('uploading'), failed: t('uploadFailed'), invalid: t('uploadPartial'), done: t('uploadReady') }}
            />
            <p className="mt-1 text-xs text-ink-mute">{t('imageHint')}</p>
            {s.logo_url && <label className="mt-1 flex items-center gap-2 text-sm"><input type="checkbox" name="remove_logo" /> {t('removeLogo')}</label>}
          </div>
        </fieldset>

        <fieldset className="card space-y-3 p-5">
          {text('name', t('shopName'), s.name)}
          <div>
            <label className="label" htmlFor="description_it">{t('descIt')}</label>
            <textarea id="description_it" name="description_it" rows={4} maxLength={1500} defaultValue={s.description_it} className="field" />
          </div>
          <div>
            <label className="label" htmlFor="description_en">{t('descEn')}</label>
            <textarea id="description_en" name="description_en" rows={4} maxLength={1500} defaultValue={s.description_en} className="field" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {text('city', t('city'), s.city)}
            {text('region', t('region'), s.region, false)}
          </div>
          <div>
            <label className="label" htmlFor="avg_production_days">{t('avgDays')}</label>
            <input id="avg_production_days" name="avg_production_days" type="number" min={0} max={90} defaultValue={s.avg_production_days ?? 3} className="field !w-32" />
          </div>
          <div>
            <label className="label" htmlFor="return_policy">{t('returnPolicy')}</label>
            <textarea id="return_policy" name="return_policy" rows={3} maxLength={1500} defaultValue={s.return_policy ?? ''} className="field" />
          </div>
        </fieldset>

        <fieldset className="card space-y-3 p-5">
          <legend className="px-1 font-display text-lg font-bold">{t('vacationTitle')}</legend>
          <label className="flex items-center gap-2"><input type="checkbox" name="vacation_mode" defaultChecked={s.vacation_mode} /> {t('vacationToggle')}</label>
          <p className="text-xs text-ink-mute">{t('vacationHint')}</p>
          <div>
            <label className="label" htmlFor="vacation_message">{t('vacationMessage')}</label>
            <input id="vacation_message" name="vacation_message" maxLength={300} defaultValue={s.vacation_message ?? ''} className="field" placeholder={t('vacationPlaceholder')} />
          </div>
          <div>
            <label className="label" htmlFor="low_stock_threshold">{t('lowStockThreshold')}</label>
            <input id="low_stock_threshold" name="low_stock_threshold" type="number" min={0} max={100} defaultValue={s.low_stock_threshold} className="field !w-32" aria-describedby="ls-hint" />
            <p id="ls-hint" className="mt-1 text-xs text-ink-mute">{t('lowStockHint')}</p>
          </div>
        </fieldset>
        <SubmitButton className="btn-primary">{c('save')}</SubmitButton>
      </form>
    </div>
  );
}
