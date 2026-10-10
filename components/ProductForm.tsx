import { getLocale, getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { pickLocalized } from '@/lib/utils';
import SubmitButton from './SubmitButton';

type Defaults = {
  id?: string;
  title_it?: string; title_en?: string; description_it?: string; description_en?: string;
  category_id?: string | null; base_price_cents?: number; production_days?: number;
  is_customizable?: boolean; customization_note?: string | null; local_pickup?: boolean;
};

export default async function ProductForm({
  action,
  defaults = {},
  withFirstVariant = false,
}: {
  action: (formData: FormData) => void | Promise<void>;
  defaults?: Defaults;
  withFirstVariant?: boolean;
}) {
  const locale = await getLocale();
  const t = await getTranslations('seller');
  const c = await getTranslations('common');
  const supabase = await createClient();
  const { data: categories } = await supabase.from('categories').select('id, name_it, name_en').order('sort_order');

  const text = (name: string, label: string, value?: string | null, required = false) => (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <input id={name} name={name} defaultValue={value ?? ''} required={required} className="field" />
    </div>
  );

  return (
    <form action={action} className="space-y-4">
      {defaults.id && <input type="hidden" name="product_id" value={defaults.id} />}
      <fieldset className="card space-y-3 p-5">
        {text('title_it', t('titleIt'), defaults.title_it)}
        {text('title_en', t('titleEn'), defaults.title_en)}
        <div>
          <label className="label" htmlFor="description_it">{t('descIt')}</label>
          <textarea id="description_it" name="description_it" rows={4} maxLength={4000} defaultValue={defaults.description_it} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="description_en">{t('descEn')}</label>
          <textarea id="description_en" name="description_en" rows={4} maxLength={4000} defaultValue={defaults.description_en} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="category_id">{t('category')}</label>
          <select id="category_id" name="category_id" required defaultValue={defaults.category_id ?? ''} className="field">
            <option value="" disabled>—</option>
            {categories?.map((cat) => (<option key={cat.id} value={cat.id}>{pickLocalized(locale, cat.name_it, cat.name_en)}</option>))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="price">{t('price')}</label>
            <input id="price" name="price" inputMode="decimal" required defaultValue={defaults.base_price_cents ? (defaults.base_price_cents / 100).toFixed(2) : ''} className="field" />
          </div>
          <div>
            <label className="label" htmlFor="production_days">{t('productionDays')}</label>
            <input id="production_days" name="production_days" type="number" min={0} max={90} defaultValue={defaults.production_days ?? 3} className="field" />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_customizable" defaultChecked={defaults.is_customizable} /> {t('customizable')}</label>
        <div>
          <label className="label" htmlFor="customization_note">{t('customNote')}</label>
          <input id="customization_note" name="customization_note" maxLength={300} defaultValue={defaults.customization_note ?? ''} className="field" />
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="local_pickup" defaultChecked={defaults.local_pickup} /> {t('localPickup')}</label>
      </fieldset>

      {withFirstVariant && (
        <fieldset className="card space-y-3 p-5">
          <legend className="px-1 font-display text-lg font-bold">{t('variants')}</legend>
          <div className="grid grid-cols-2 gap-3">
            {text('material', t('material'))}
            {text('color', t('color'))}
            {text('size', t('size'))}
            {text('finish', t('finish'))}
          </div>
          <div>
            <label className="label" htmlFor="stock">{t('stock')}</label>
            <input id="stock" name="stock" type="number" min={0} required defaultValue={1} className="field !w-32" />
          </div>
        </fieldset>
      )}
      <SubmitButton className="btn-primary">{c('save')}</SubmitButton>
    </form>
  );
}
