'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';

export default function CookieNotice() {
  const t = useTranslations('legal');
  const tf = useTranslations('footer');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem('cookie-notice-ok')) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;
  return (
    <div
      role="dialog"
      aria-label="Cookie"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-xl flex-col gap-3 rounded-card border border-line bg-white p-4 shadow-lg sm:flex-row sm:items-center"
    >
      <p className="text-sm text-ink-soft">
        {t('cookieBanner')}{' '}
        <Link href="/cookies" className="underline">
          {tf('cookies')}
        </Link>
      </p>
      <button
        type="button"
        className="btn-dark shrink-0"
        onClick={() => {
          try {
            localStorage.setItem('cookie-notice-ok', '1');
          } catch {}
          setVisible(false);
        }}
      >
        {t('cookieOk')}
      </button>
    </div>
  );
}
