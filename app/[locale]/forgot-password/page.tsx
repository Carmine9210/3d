import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { requestPasswordReset } from '@/lib/actions/auth';
import SubmitButton from '@/components/SubmitButton';

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const t = await getTranslations('auth');
  const errors: Record<string, string> = { rate: t('rate'), invalid: t('invalidEmail'), expired: t('resetExpired') };
  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-2 font-display text-3xl font-bold">{t('forgotTitle')}</h1>
      <p className="mb-6 text-ink-soft">{t('forgotIntro')}</p>
      {sp.sent && <p className="notice notice-ok mb-4" role="status">{t('resetSent')}</p>}
      {sp.error && errors[sp.error] && <p className="notice notice-error mb-4" role="alert">{errors[sp.error]}</p>}
      <form action={requestPasswordReset} className="card space-y-4 p-6">
        <div>
          <label className="label" htmlFor="email">{t('email')}</label>
          <input id="email" name="email" type="email" autoComplete="email" required className="field" />
        </div>
        <SubmitButton className="btn-primary w-full">{t('sendResetLink')}</SubmitButton>
      </form>
      <p className="mt-4 text-sm"><Link href="/login" className="font-semibold underline">{t('backToLogin')}</Link></p>
    </div>
  );
}
