import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from '@/i18n/routing';
import { Link } from '@/i18n/routing';
import { requireUser, getSellerContext } from '@/lib/auth';
import { createShop } from '@/lib/actions/seller';
import SubmitButton from '@/components/SubmitButton';

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const locale = await getLocale();
  const viewer = await requireUser(locale);
  const { vendor } = await getSellerContext(viewer.id);
  if (vendor) redirect({ href: '/seller', locale });
  const sp = await searchParams;
  const t = await getTranslations('seller');
  const c = await getTranslations('common');

  const field = (name: string, label: string, opts: { required?: boolean; type?: string; value?: string } = {}) => (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <input id={name} name={name} type={opts.type ?? 'text'} required={opts.required ?? true} defaultValue={opts.value} className="field" />
    </div>
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="font-display text-3xl font-bold">{t('onboardingTitle')}</h1>
        <p className="mt-1 text-ink-soft">{t('onboardingIntro')}</p>
        <ol className="mt-4 flex flex-wrap gap-2 text-sm" aria-label="Steps">
          {[t('stepProfile'), t('stepStripe'), t('stepProduct'), t('stepDone')].map((s, i) => (
            <li key={s} className={`rounded px-2 py-1 ${i === 0 ? 'bg-print font-semibold' : 'bg-white text-ink-mute'}`}>{i + 1}. {s}</li>
          ))}
        </ol>
      </header>
      {sp.error && <p className="notice notice-error" role="alert">{c('error')}</p>}
      <form action={createShop} className="space-y-4">
        <fieldset className="card space-y-3 p-5">
          <legend className="px-1 font-display text-lg font-bold">{t('step', { n: 1 })} · {t('stepProfile')}</legend>
          <div>
            <label className="label" htmlFor="vendorType">{t('sellerType')}</label>
            <select id="vendorType" name="vendorType" className="field" defaultValue="private">
              <option value="private">{t('typePrivate')}</option>
              <option value="professional">{t('typeProfessional')}</option>
              <option value="company">{t('typeCompany')}</option>
            </select>
          </div>
          {field('name', t('shopName'))}
          <div>
            <label className="label" htmlFor="description_it">{t('descIt')}</label>
            <textarea id="description_it" name="description_it" rows={3} maxLength={1500} className="field" />
          </div>
          <div>
            <label className="label" htmlFor="description_en">{t('descEn')}</label>
            <textarea id="description_en" name="description_en" rows={3} maxLength={1500} className="field" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {field('city', t('city'))}
            {field('region', t('region'), { required: false })}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {field('phone', t('phone'), { type: 'tel' })}
            {field('avg_production_days', t('avgDays'), { type: 'number', value: '3' })}
          </div>
          <div>
            <label className="label" htmlFor="return_policy">{t('returnPolicy')}</label>
            <textarea id="return_policy" name="return_policy" rows={2} maxLength={1500} className="field" />
          </div>
          {field('taxId', t('taxId'))}
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="acceptTerms" required className="mt-1" />
            <span>{t('acceptTerms')} <Link href="/prohibited" className="underline">→</Link></span>
          </label>
        </fieldset>
        <SubmitButton className="btn-primary w-full">{t('createShop')}</SubmitButton>
      </form>
    </div>
  );
}
