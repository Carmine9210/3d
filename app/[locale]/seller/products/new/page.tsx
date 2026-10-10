import { getLocale, getTranslations } from 'next-intl/server';
import { requireSeller } from '@/lib/auth';
import { createProduct } from '@/lib/actions/seller';
import ProductForm from '@/components/ProductForm';

export default async function NewProductPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const locale = await getLocale();
  await requireSeller(locale);
  const sp = await searchParams;
  const t = await getTranslations('seller');
  const c = await getTranslations('common');
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="font-display text-3xl font-bold">{t('newProduct')}</h1>
      {sp.error && <p className="notice notice-error" role="alert">{c('error')}</p>}
      <ProductForm action={createProduct} withFirstVariant />
    </div>
  );
}
