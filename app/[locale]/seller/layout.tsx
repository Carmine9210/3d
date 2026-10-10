import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';

export default async function SellerLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations('seller');
  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap gap-2 border-b border-line pb-3" aria-label={t('dashboard')}>
        <Link href="/seller" className="btn-ghost !py-1.5">{t('dashboard')}</Link>
        <Link href="/seller/products" className="btn-ghost !py-1.5">{t('products')}</Link>
        <Link href="/seller/orders" className="btn-ghost !py-1.5">{t('orders')}</Link>
        <Link href="/seller/reviews" className="btn-ghost !py-1.5">{t('reviews')}</Link>
        <Link href="/seller/coupons" className="btn-ghost !py-1.5">{t('coupons')}</Link>
        <Link href="/seller/analytics" className="btn-ghost !py-1.5">{t('analytics')}</Link>
        <Link href="/seller/settings" className="btn-ghost !py-1.5">{t('shopSettings')}</Link>
      </nav>
      {children}
    </div>
  );
}
