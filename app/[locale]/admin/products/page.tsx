import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { createClient } from '@/lib/supabase/server';
import { moderateProduct } from '@/lib/actions/admin';
import { formatPrice, pickLocalized } from '@/lib/utils';
import SubmitButton from '@/components/SubmitButton';

export default async function AdminProducts() {
  const locale = await getLocale();
  const t = await getTranslations('admin');
  const s = await getTranslations('seller');
  const supabase = await createClient();
  const { data: products } = await supabase
    .from('products')
    .select('id, slug, title_it, title_en, base_price_cents, currency, status, stores ( name )')
    .in('status', ['pending', 'published', 'suspended'])
    .order('status', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(100);

  const btn = (id: string, decision: string, label: string, cls: string) => (
    <form action={moderateProduct}>
      <input type="hidden" name="product_id" value={id} />
      <input type="hidden" name="decision" value={decision} />
      <SubmitButton className={cls}>{label}</SubmitButton>
    </form>
  );

  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-bold">{t('products')}</h1>
      {(products ?? []).length === 0 && <p className="notice">{t('nothing')}</p>}
      <ul className="space-y-2">
        {(products as any[] | null)?.map((p) => (
          <li key={p.id} className="card flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <Link href={`/product/${p.slug}`} className="font-semibold underline">{pickLocalized(locale, p.title_it, p.title_en)}</Link>
              <p className="text-sm text-ink-mute">{p.stores?.name} · {formatPrice(p.base_price_cents, p.currency, locale)}</p>
            </div>
            <span className="rounded bg-print-tint px-2 py-0.5 text-sm">{s(`productStatus.${p.status}`)}</span>
            {p.status === 'pending' && btn(p.id, 'approve', t('approve'), 'btn-primary !py-1.5')}
            {p.status === 'pending' && btn(p.id, 'reject', t('reject'), 'btn-ghost !py-1.5')}
            {p.status === 'published' && btn(p.id, 'suspend', t('suspend'), 'btn-danger !py-1.5')}
            {p.status === 'suspended' && btn(p.id, 'approve', t('activate'), 'btn-ghost !py-1.5')}
          </li>
        ))}
      </ul>
    </div>
  );
}
