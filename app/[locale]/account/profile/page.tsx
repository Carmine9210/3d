import { getLocale, getTranslations } from 'next-intl/server';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { deleteAccount, updateProfile } from '@/lib/actions/account';
import SubmitButton from '@/components/SubmitButton';

export default async function ProfilePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const locale = await getLocale();
  const viewer = await requireUser(locale);
  const sp = await searchParams;
  const t = await getTranslations('account');
  const c = await getTranslations('common');
  const supabase = await createClient();
  const { data: profile } = await supabase.from('profiles').select('display_name, phone, locale').eq('user_id', viewer.id).maybeSingle();

  const errors: Record<string, string> = {
    open_orders: t('deleteOpenOrders'),
    seller: t('deleteSeller'),
    confirm: t('deleteConfirm'),
    invalid: c('error'),
  };

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <h1 className="font-display text-3xl font-bold">{t('editProfile')}</h1>
      {sp.saved && <p className="notice notice-ok" role="status">{t('profileSaved')}</p>}
      {sp.error && <p className="notice notice-error" role="alert">{errors[sp.error] ?? c('error')}</p>}

      <form action={updateProfile} className="card space-y-4 p-5">
        <div>
          <label className="label" htmlFor="display_name">{t('displayName')}</label>
          <input id="display_name" name="display_name" required minLength={2} maxLength={60} defaultValue={profile?.display_name ?? ''} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="phone">{t('phone')}</label>
          <input id="phone" name="phone" type="tel" defaultValue={profile?.phone ?? ''} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="locale">{t('language')}</label>
          <select id="locale" name="locale" defaultValue={profile?.locale ?? locale} className="field !w-48">
            <option value="it">Italiano</option>
            <option value="en">English</option>
          </select>
        </div>
        <SubmitButton className="btn-primary">{c('save')}</SubmitButton>
      </form>

      <section className="card space-y-3 p-5">
        <a href="/api/account/export" className="btn-ghost" download>{t('exportData')}</a>
      </section>

      <section className="card space-y-3 border-bad p-5" aria-labelledby="del-h">
        <h2 id="del-h" className="font-display text-xl font-bold text-bad">{t('deleteTitle')}</h2>
        <p className="text-sm text-ink-soft">{t('deleteWarn')}</p>
        <form action={deleteAccount} className="space-y-3">
          <div>
            <label className="label" htmlFor="confirm_email">{t('typeEmail')}</label>
            <input id="confirm_email" name="confirm_email" type="email" required autoComplete="off" className="field" />
          </div>
          <SubmitButton className="btn-danger">{t('deleteBtn')}</SubmitButton>
        </form>
      </section>
    </div>
  );
}
