import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import TrustBar from './TrustBar';

export default async function Footer() {
  const t = await getTranslations('footer');
  const c = await getTranslations('common');
  const h = await getTranslations('home');
  return (
    <footer className="mt-20 border-t border-line bg-white">
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-10">
        <TrustBar />
        <div className="grid gap-8 border-t border-line pt-8 text-sm text-ink-soft md:grid-cols-[1.5fr_1fr_1fr]">
          <div>
            <p className="font-display text-lg font-bold text-ink">{c('appName')}</p>
            <p className="mt-1 max-w-xs">{t('about')}</p>
            <p className="mt-3 font-semibold text-ink">{c('tagline')}</p>
          </div>
          <nav className="flex flex-col gap-2" aria-label="Shop">
            <Link href="/search" className="hover:underline">{h('viewAll')}</Link>
            <Link href="/seller/onboarding" className="hover:underline">{h('sellCta')}</Link>
            <Link href="/account" className="hover:underline">{c('account')}</Link>
          </nav>
          <nav className="flex flex-col gap-2" aria-label="Legal">
            <Link href="/terms" className="hover:underline">{t('terms')}</Link>
            <Link href="/privacy" className="hover:underline">{t('privacy')}</Link>
            <Link href="/cookies" className="hover:underline">{t('cookies')}</Link>
            <Link href="/prohibited" className="hover:underline">{t('prohibited')}</Link>
          </nav>
        </div>
        <p className="text-xs text-ink-mute">© {new Date().getFullYear()} 3D Market. {t('rights')}</p>
      </div>
    </footer>
  );
}
