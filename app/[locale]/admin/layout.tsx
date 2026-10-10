import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { requireAdmin } from '@/lib/auth';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  await requireAdmin(locale);
  const t = await getTranslations('admin');
  const items = [
    ['/admin', t('overview')],
    ['/admin/products', t('products')],
    ['/admin/users', t('usersTitle')],
    ['/admin/sellers', t('users')],
    ['/admin/orders', t('orders')],
    ['/admin/refunds', t('refunds')],
    ['/admin/reports', t('reports')],
    ['/admin/audit', t('audit')],
    ['/admin/settings', t('settings')],
  ] as const;
  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap gap-2 border-b border-line pb-3" aria-label="Admin">
        {items.map(([href, label]) => (<Link key={href} href={href} className="btn-ghost !py-1.5">{label}</Link>))}
      </nav>
      {children}
    </div>
  );
}
