import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from '@/i18n/routing';
import { getViewer } from '@/lib/auth';
import { updatePassword } from '@/lib/actions/auth';
import SubmitButton from '@/components/SubmitButton';

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const locale = await getLocale();
  const t = await getTranslations('auth');
  const c = await getTranslations('common');
  // La sessione arriva dal link email (via /auth/callback). Senza sessione il link è scaduto.
  if (!(await getViewer())) redirect({ href: '/forgot-password?error=expired', locale });
  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-6 font-display text-3xl font-bold">{t('resetTitle')}</h1>
      {sp.error && <p className="notice notice-error mb-4" role="alert">{sp.error === 'weak' ? t('passwordMismatch') : c('error')}</p>}
      <form action={updatePassword} className="card space-y-4 p-6">
        <div>
          <label className="label" htmlFor="password">{t('newPassword')}</label>
          <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} maxLength={72} required className="field" aria-describedby="pw-hint" />
          <p id="pw-hint" className="mt-1 text-xs text-ink-mute">{t('passwordHint')}</p>
        </div>
        <div>
          <label className="label" htmlFor="password_confirm">{t('confirmPassword')}</label>
          <input id="password_confirm" name="password_confirm" type="password" autoComplete="new-password" minLength={8} maxLength={72} required className="field" />
        </div>
        <SubmitButton className="btn-primary w-full">{t('savePassword')}</SubmitButton>
      </form>
    </div>
  );
}
