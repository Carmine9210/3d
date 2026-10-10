import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import CookieNotice from '@/components/CookieNotice';
import './globals.css';
import { siteUrl } from '@/lib/site';

// Font self-hosted (OFL): nessuna richiesta a Google Fonts, build riproducibile anche offline.
const display = localFont({
  src: '../fonts/bricolage-grotesque-latin-wght-normal.woff2',
  weight: '200 800',
  variable: '--font-display',
  display: 'swap',
});
const body = localFont({
  src: [
    { path: '../fonts/ibm-plex-sans-latin-400-normal.woff2', weight: '400' },
    { path: '../fonts/ibm-plex-sans-latin-500-normal.woff2', weight: '500' },
    { path: '../fonts/ibm-plex-sans-latin-600-normal.woff2', weight: '600' },
    { path: '../fonts/ibm-plex-sans-latin-700-normal.woff2', weight: '700' },
  ],
  variable: '--font-body',
  display: 'swap',
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta' });
  const base = siteUrl();
  return {
    metadataBase: new URL(base),
    title: { default: t('homeTitle'), template: '%s · 3D Market' },
    description: t('homeDesc'),
    alternates: { languages: { it: '/it', en: '/en' } },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();
  const c = await getTranslations('common');

  return (
    <html lang={locale} className={`${display.variable} ${body.variable}`}>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:bg-white focus:p-2"
          >
            {c('skipToContent')}
          </a>
          <Header />
          <main id="main" className="mx-auto max-w-6xl px-4 py-8">
            {children}
          </main>
          <Footer />
          <CookieNotice />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
