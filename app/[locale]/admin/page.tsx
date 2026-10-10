import { getLocale, getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { formatPrice } from '@/lib/utils';

export default async function AdminOverview() {
  const locale = await getLocale();
  const t = await getTranslations('admin');
  const supabase = await createClient();
  const [{ data: orders }, { count: vendors }, { count: published }, { count: reports }, { count: pending }] = await Promise.all([
    supabase.from('orders').select('status, total_cents, platform_fee_cents'),
    supabase.from('vendors').select('id', { count: 'exact', head: true }),
    supabase.from('products').select('id', { count: 'exact', head: true }).eq('status', 'published'),
    supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    supabase.from('products').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ]);
  const paid = (orders ?? []).filter((o) => ['paid', 'in_production', 'shipped', 'delivered'].includes(o.status));
  const gmv = paid.reduce((s, o) => s + o.total_cents, 0);
  const fees = paid.reduce((s, o) => s + o.platform_fee_cents, 0);
  const stat = (label: string, value: string | number) => (
    <div className="card p-4"><dt className="text-sm text-ink-mute">{label}</dt><dd className="mt-1 font-display text-3xl font-bold">{value}</dd></div>
  );
  return (
    <dl className="grid grid-cols-2 gap-4 md:grid-cols-3">
      {stat(t('gmv'), formatPrice(gmv, 'EUR', locale))}
      {stat(t('fees'), formatPrice(fees, 'EUR', locale))}
      {stat(t('sellersCount'), vendors ?? 0)}
      {stat(t('productsCount'), published ?? 0)}
      {stat(t('moderationQueue'), pending ?? 0)}
      {stat(t('openReports'), reports ?? 0)}
    </dl>
  );
}
