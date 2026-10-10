import { getTranslations } from 'next-intl/server';
import LegalPage from '@/components/LegalPage';

export default async function Page() {
  const t = await getTranslations('legal');
  return <LegalPage title={t('privacyTitle')} />;
}
