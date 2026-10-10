import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { signUp } from '@/lib/actions/auth';
import SubmitButton from '@/components/SubmitButton';

export default async function RegisterPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const t = await getTranslations('auth');
  const c = await getTranslations('common');
  if (sp.sent) {
    return <p className="notice notice-ok mx-auto max-w-md" role="status">{t('checkEmail')}</p>;
  }
  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-6 font-display text-3xl font-bold">{t('registerTitle')}</h1>
      {sp.error && <p className="notice notice-error mb-4" role="alert">{sp.error === 'rate' ? t('rate') : sp.error === 'exists' ? t('exists') : t('weak')}</p>}
      <form action={signUp} className="card space-y-4 p-6">
        <input type="hidden" name="next" value={sp.next ?? '/account'} />
        <div>
          <label className="label" htmlFor="displayName">{t('name')}</label>
          <input id="displayName" name="displayName" autoComplete="name" required minLength={2} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="email">{t('email')}</label>
          <input id="email" name="email" type="email" autoComplete="email" required className="field" />
        </div>
        <div>
          <label className="label" htmlFor="password">{t('password')}</label>
          <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} className="field" aria-describedby="pw-hint" />
          <p id="pw-hint" className="mt-1 text-xs text-ink-mute">{t('passwordHint')}</p>
        </div>
        <SubmitButton className="btn-primary w-full">{c('register')}</SubmitButton>
      </form>
      <p className="mt-4 text-sm text-ink-soft">{t('haveAccount')} <Link href={sp.next ? `/login?next=${encodeURIComponent(sp.next)}` : '/login'} className="font-semibold underline">{c('login')}</Link></p>
    </div>
  );
}
