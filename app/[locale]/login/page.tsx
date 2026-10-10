import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { signIn } from '@/lib/actions/auth';
import SubmitButton from '@/components/SubmitButton';

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const t = await getTranslations('auth');
  const c = await getTranslations('common');
  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-6 font-display text-3xl font-bold">{t('loginTitle')}</h1>
      {sp.error && <p className="notice notice-error mb-4" role="alert">{sp.error === 'rate' ? t('rate') : t('invalid')}</p>}
      <form action={signIn} className="card space-y-4 p-6">
        <input type="hidden" name="next" value={sp.next ?? '/account'} />
        <div>
          <label className="label" htmlFor="email">{t('email')}</label>
          <input id="email" name="email" type="email" autoComplete="email" required className="field" />
        </div>
        <div>
          <label className="label" htmlFor="password">{t('password')}</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required className="field" />
          <p className="mt-1 text-right text-sm"><Link href="/forgot-password" className="underline">{t('forgot')}</Link></p>
        </div>
        <SubmitButton className="btn-primary w-full">{c('login')}</SubmitButton>
      </form>
      <p className="mt-4 text-sm text-ink-soft">{t('noAccount')} <Link href={sp.next ? `/register?next=${encodeURIComponent(sp.next)}` : '/register'} className="font-semibold underline">{c('register')}</Link></p>
    </div>
  );
}
