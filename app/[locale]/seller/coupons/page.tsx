import { getLocale, getTranslations } from 'next-intl/server';
import { requireSeller } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createCoupon, deleteCoupon, toggleCoupon } from '@/lib/actions/seller';
import { checkCoupon, type Coupon } from '@/lib/coupons';
import { formatPrice } from '@/lib/utils';
import SubmitButton from '@/components/SubmitButton';

export default async function SellerCoupons({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const locale = await getLocale();
  const { store } = await requireSeller(locale);
  const sp = await searchParams;
  const t = await getTranslations('coupons');
  const c = await getTranslations('common');
  const supabase = await createClient();
  const { data: list } = await supabase.from('coupons').select('*').eq('store_id', store.id).order('created_at', { ascending: false });
  const fmtDate = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'it-IT', { dateStyle: 'medium' });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="font-display text-3xl font-bold">{t('title')}</h1>
        <p className="text-ink-soft">{t('intro')}</p>
      </header>
      {sp.saved && <p className="notice notice-ok" role="status">{c('saved')}</p>}
      {sp.error && <p className="notice notice-error" role="alert">{sp.error === 'exists' ? t('exists') : t('invalid')}</p>}

      <form action={createCoupon} className="card grid gap-3 p-5 sm:grid-cols-2">
        <h2 className="font-display text-xl font-bold sm:col-span-2">{t('new')}</h2>
        <div>
          <label className="label" htmlFor="code">{t('code')}</label>
          <input id="code" name="code" required minLength={3} maxLength={24} pattern="[A-Za-z0-9_\-]{3,24}" className="field uppercase" placeholder="ESTATE10" aria-describedby="code-hint" />
          <p id="code-hint" className="mt-1 text-xs text-ink-mute">{t('codeHint')}</p>
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <div>
            <label className="label" htmlFor="value">{t('value')}</label>
            <input id="value" name="value" required inputMode="decimal" className="field" placeholder="10" />
          </div>
          <div>
            <label className="label" htmlFor="kind">{t('kind')}</label>
            <select id="kind" name="kind" className="field">
              <option value="percent">%</option>
              <option value="fixed">€</option>
            </select>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="min_subtotal">{t('minSubtotal')}</label>
          <input id="min_subtotal" name="min_subtotal" inputMode="decimal" className="field" placeholder="0" />
        </div>
        <div>
          <label className="label" htmlFor="max_uses">{t('maxUses')}</label>
          <input id="max_uses" name="max_uses" type="number" min={1} className="field" placeholder="∞" />
        </div>
        <div>
          <label className="label" htmlFor="expires_at">{t('expires')}</label>
          <input id="expires_at" name="expires_at" type="date" className="field" />
        </div>
        <div className="flex items-end">
          <SubmitButton className="btn-dark w-full">{t('create')}</SubmitButton>
        </div>
      </form>

      {(list ?? []).length === 0 ? (
        <p className="notice">{t('empty')}</p>
      ) : (
        <ul className="space-y-2">
          {((list ?? []) as Coupon[]).map((k) => {
            const state = checkCoupon(k, Number.MAX_SAFE_INTEGER);
            return (
              <li key={k.id} className="card flex flex-wrap items-center gap-3 p-4">
                <code className="rounded bg-ink px-2 py-1 font-bold tracking-wider text-white">{k.code}</code>
                <div className="min-w-[12rem] flex-1 text-sm">
                  <p className="font-semibold">
                    {k.kind === 'percent' ? `−${k.value}%` : `−${formatPrice(k.value, 'EUR', locale)}`}
                    {k.min_subtotal_cents > 0 && <span className="font-normal text-ink-mute"> · {t('minShort', { amount: formatPrice(k.min_subtotal_cents, 'EUR', locale) })}</span>}
                  </p>
                  <p className="text-ink-mute">
                    {t('usesCount', { n: k.uses })}{k.max_uses ? ` / ${k.max_uses}` : ''}
                    {k.expires_at ? ` · ${t('until', { date: fmtDate.format(new Date(k.expires_at)) })}` : ''}
                  </p>
                </div>
                <span className={`rounded px-2 py-0.5 text-sm ${state.ok ? 'bg-ok/10 text-ok' : 'bg-line text-ink-mute'}`}>
                  {state.ok ? t('state.active') : t(`state.${state.reason}`)}
                </span>
                <form action={toggleCoupon}>
                  <input type="hidden" name="coupon_id" value={k.id} />
                  <input type="hidden" name="active" value={k.active ? '0' : '1'} />
                  <SubmitButton className="btn-ghost !px-3 !py-1.5 text-sm">{k.active ? t('pause') : t('resume')}</SubmitButton>
                </form>
                <form action={deleteCoupon}>
                  <input type="hidden" name="coupon_id" value={k.id} />
                  <SubmitButton className="text-sm text-bad underline">{c('delete')}</SubmitButton>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
