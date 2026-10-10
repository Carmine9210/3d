import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { requireSeller } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import {
  addVariant, deleteProductImage, deleteVariant, publishProduct, unpublishProduct,
  updateProduct, updateVariantStock, uploadProductImages, duplicateProduct,
} from '@/lib/actions/seller';
import { formatPrice, publicImageUrl } from '@/lib/utils';
import ProductForm from '@/components/ProductForm';
import SubmitButton from '@/components/SubmitButton';
import DirectUpload from '@/components/DirectUpload';

export default async function EditProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const locale = await getLocale();
  const { store } = await requireSeller(locale);
  const t = await getTranslations('seller');
  const c = await getTranslations('common');
  const supabase = await createClient();

  const { data: product } = await supabase
    .from('products')
    .select('*, product_variants ( id, material, color, size, finish, price_delta_cents, stock ), product_images ( id, storage_path, alt, sort_order )')
    .eq('id', id)
    .eq('store_id', store.id)
    .maybeSingle();
  if (!product) notFound();

  const images = [...(product.product_images ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const variants = product.product_variants ?? [];
  const suspended = product.status === 'suspended';

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-bold">{product.title_it || product.title_en}</h1>
        <span className="rounded bg-print-tint px-2 py-1 text-sm">{t(`productStatus.${product.status}`)}</span>
      </header>

      {sp.saved && <p className="notice notice-ok" role="status">{c('saved')}</p>}
      {sp.created && <p className="notice notice-ok" role="status">{c('saved')}</p>}
      {sp.published && <p className="notice notice-ok" role="status">{t('published')}</p>}
      {sp.submitted && <p className="notice notice-ok" role="status">{t('submitted')}</p>}
      {sp.error === 'image' && <p className="notice notice-error" role="alert">{t('needsImage')}</p>}
      {sp.error === 'stripe' && <p className="notice notice-error" role="alert">{t('needsStripe')}</p>}
      {sp.error === 'invalid' && <p className="notice notice-error" role="alert">{c('error')}</p>}
      {suspended && <p className="notice notice-error" role="alert">{t('productStatus.suspended')}</p>}

      {!suspended && (
        <div className="flex flex-wrap gap-2">
          <form action={duplicateProduct}>
            <input type="hidden" name="product_id" value={product.id} />
            <SubmitButton className="btn-ghost">{t('duplicate')}</SubmitButton>
          </form>
          {(product.status === 'draft') && (
            <form action={publishProduct}>
              <input type="hidden" name="product_id" value={product.id} />
              <SubmitButton className="btn-primary">{t('publish')}</SubmitButton>
            </form>
          )}
          {(product.status === 'published' || product.status === 'pending') && (
            <form action={unpublishProduct}>
              <input type="hidden" name="product_id" value={product.id} />
              <SubmitButton className="btn-ghost">{t('unpublish')}</SubmitButton>
            </form>
          )}
        </div>
      )}

      <section aria-labelledby="img-h" className="card space-y-3 p-5">
        <h2 id="img-h" className="font-display text-xl font-bold">{t('images')}</h2>
        {images.length > 0 && (
          <ul className="grid grid-cols-3 gap-3 md:grid-cols-4">
            {images.map((img) => (
              <li key={img.id} className="space-y-1">
                <div className="relative aspect-square overflow-hidden rounded-card bg-print-tint">
                  <Image src={publicImageUrl(img.storage_path)} alt={img.alt} fill sizes="25vw" className="object-cover" />
                </div>
                <form action={deleteProductImage}>
                  <input type="hidden" name="image_id" value={img.id} />
                  <SubmitButton className="text-xs text-bad underline">{t('removeImage')}</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        )}
        <form action={uploadProductImages} className="space-y-2">
          <input type="hidden" name="product_id" value={product.id} />
          <label className="label" htmlFor="images">{t('uploadImages')}</label>
          <DirectUpload
            id="images"
            bucket="product-images"
            prefix={`${store.id}/${product.id}`}
            name="uploaded_path"
            multiple
            autoSubmit
            labels={{ choose: t('uploadImages'), uploading: t('uploading'), failed: t('uploadFailed'), invalid: t('uploadPartial'), done: t('uploadDone') }}
          />
          <noscript>
            <input name="images" type="file" accept="image/jpeg,image/png,image/webp" multiple className="field" />
            <SubmitButton className="btn-dark">{c('save')}</SubmitButton>
          </noscript>
        </form>
      </section>

      <ProductForm action={updateProduct} defaults={product} />

      <section aria-labelledby="var-h" className="card space-y-4 p-5">
        <h2 id="var-h" className="font-display text-xl font-bold">{t('variants')}</h2>
        <ul className="divide-y divide-line">
          {variants.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-3 py-2">
              <span className="flex-1 text-sm">
                {[v.material, v.color, v.size, v.finish].filter(Boolean).join(' / ') || '—'}
                {v.price_delta_cents !== 0 && ` (${formatPrice(v.price_delta_cents, 'EUR', locale)})`}
              </span>
              <form action={updateVariantStock} className="flex items-center gap-2">
                <input type="hidden" name="variant_id" value={v.id} />
                <label className="sr-only" htmlFor={`stock-${v.id}`}>{t('stock')}</label>
                <input id={`stock-${v.id}`} name="stock" type="number" min={0} defaultValue={v.stock} className="field !w-24" />
                <SubmitButton className="btn-ghost !px-3 !py-1.5 text-sm">{c('save')}</SubmitButton>
              </form>
              {variants.length > 1 && (
                <form action={deleteVariant}>
                  <input type="hidden" name="variant_id" value={v.id} />
                  <SubmitButton className="text-sm text-bad underline">{c('delete')}</SubmitButton>
                </form>
              )}
            </li>
          ))}
        </ul>
        <form action={addVariant} className="space-y-3 border-t border-line pt-4">
          <input type="hidden" name="product_id" value={product.id} />
          <div className="grid grid-cols-2 gap-3">
            {[['material', t('material')], ['color', t('color')], ['size', t('size')], ['finish', t('finish')]].map(([n, l]) => (
              <div key={n}>
                <label className="label" htmlFor={`nv-${n}`}>{l}</label>
                <input id={`nv-${n}`} name={n} className="field" />
              </div>
            ))}
            <div>
              <label className="label" htmlFor="nv-delta">{t('priceDelta')}</label>
              <input id="nv-delta" name="price_delta" inputMode="decimal" defaultValue="0" className="field" />
            </div>
            <div>
              <label className="label" htmlFor="nv-stock">{t('stock')}</label>
              <input id="nv-stock" name="stock" type="number" min={0} defaultValue={1} className="field" />
            </div>
          </div>
          <SubmitButton className="btn-dark">{t('addVariant')}</SubmitButton>
        </form>
      </section>
    </div>
  );
}
