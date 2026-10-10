'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';

/** Errore imprevisto in una pagina: messaggio chiaro, riprova, e il codice per l'assistenza. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('errors');
  useEffect(() => {
    console.error('[page-error]', error.digest ?? '', error.message);
  }, [error]);
  return (
    <div className="mx-auto max-w-lg space-y-4 py-12 text-center">
      <h1 className="font-display text-3xl font-bold">{t('title')}</h1>
      <p className="text-ink-soft">{t('body')}</p>
      <div className="flex justify-center gap-3">
        <button type="button" onClick={reset} className="btn-primary">{t('retry')}</button>
        <Link href="/" className="btn-ghost">{t('home')}</Link>
      </div>
      {error.digest && <p className="text-xs text-ink-mute">{t('code')}: {error.digest}</p>}
    </div>
  );
}
