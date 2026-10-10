import { getTranslations } from 'next-intl/server';
import LegalPage from '@/components/LegalPage';

export default async function ProhibitedPage() {
  const t = await getTranslations('legal');
  return (
    <LegalPage title={t('prohibitedTitle')}>
      <p>{t('prohibitedIntro')}</p>
      <ul className="list-disc space-y-1 pl-5">
        {(['p1', 'p2', 'p3', 'p4', 'p5'] as const).map((k) => (<li key={k}>{t(k)}</li>))}
      </ul>
      <p>{t('p6')}</p>
    </LegalPage>
  );
}
