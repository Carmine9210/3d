import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';

export default async function SuccessPage() {
  const t = await getTranslations('checkout');
  return (
    <div className="mx-auto max-w-lg py-10 text-center">
      <h1 className="font-display text-4xl font-bold">{t('successTitle')}</h1>
      <p className="mt-3 text-ink-soft">{t('successText')}</p>
      <div className="mt-6 flex justify-center gap-3">
        <Link href="/account" className="btn-dark">{t('viewOrders')}</Link>
        <Link href="/checkout/pay" className="btn-ghost">{t('toPay')}</Link>
      </div>
    </div>
  );
}
