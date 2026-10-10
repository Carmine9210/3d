import { getLocale, getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { pickLocalized, sanitizeSearch } from '@/lib/utils';
import { Link } from '@/i18n/routing';
import ProductCard, { type CardProduct } from './ProductCard';

export type SearchParams = Record<string, string | string[] | undefined>;

const PAGE_SIZE = 24;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export default async function SearchResults({
  basePath,
  searchParams,
  presetCategorySlug,
}: {
  basePath: string;
  searchParams: SearchParams;
  presetCategorySlug?: string;
}) {
  const locale = await getLocale();
  const t = await getTranslations('search');
  const supabase = await createClient();

  const { data: categories } = await supabase.from('categories').select('id, slug, name_it, name_en').order('sort_order');

  const q = sanitizeSearch(one(searchParams.q));
  const categorySlug = presetCategorySlug ?? one(searchParams.category);
  const category = categories?.find((c) => c.slug === categorySlug);
  const priceMin = parseFloat(one(searchParams.min));
  const priceMax = parseFloat(one(searchParams.max));
  const material = sanitizeSearch(one(searchParams.material));
  const color = sanitizeSearch(one(searchParams.color));
  const size = sanitizeSearch(one(searchParams.size));
  const customizable = one(searchParams.custom) === '1';
  const inStock = one(searchParams.stock) === '1';
  const pickup = one(searchParams.pickup) === '1';
  const maxDays = parseInt(one(searchParams.days), 10);
  const minRating = parseFloat(one(searchParams.rating));
  const sort = one(searchParams.sort) || 'new';
  const page = Math.max(1, parseInt(one(searchParams.page), 10) || 1);

  const needVariants = Boolean(material || color || size || inStock);
  let query = supabase
    .from('products')
    .select(
      `slug, title_it, title_en, base_price_cents, currency, avg_rating, review_count, production_days, is_customizable,
       stores!inner ( name, city, status ),
       product_images ( storage_path, sort_order ),
       product_variants${needVariants ? '!inner' : ''} ( material, color, size, stock )`,
      { count: 'exact' },
    )
    .eq('status', 'published')
    .eq('stores.status', 'active');

  if (category) query = query.eq('category_id', category.id);
  if (q) query = query.or(`title_it.ilike.%${q}%,title_en.ilike.%${q}%,description_it.ilike.%${q}%,description_en.ilike.%${q}%`);
  if (Number.isFinite(priceMin)) query = query.gte('base_price_cents', Math.round(priceMin * 100));
  if (Number.isFinite(priceMax)) query = query.lte('base_price_cents', Math.round(priceMax * 100));
  if (material) query = query.ilike('product_variants.material', `%${material}%`);
  if (color) query = query.ilike('product_variants.color', `%${color}%`);
  if (size) query = query.ilike('product_variants.size', `%${size}%`);
  if (inStock) query = query.gt('product_variants.stock', 0);
  if (customizable) query = query.eq('is_customizable', true);
  if (pickup) query = query.eq('local_pickup', true);
  if (Number.isFinite(maxDays)) query = query.lte('production_days', maxDays);
  if (Number.isFinite(minRating)) query = query.gte('avg_rating', minRating);

  if (sort === 'price_asc') query = query.order('base_price_cents', { ascending: true });
  else if (sort === 'price_desc') query = query.order('base_price_cents', { ascending: false });
  else if (sort === 'rating') query = query.order('avg_rating', { ascending: false });
  else query = query.order('created_at', { ascending: false });

  const from = (page - 1) * PAGE_SIZE;
  const { data, count } = await query.range(from, from + PAGE_SIZE - 1);
  const products = (data ?? []) as unknown as CardProduct[];
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      const val = one(v);
      if (val && k !== 'page') params.set(k, val);
    }
    if (p > 1) params.set('page', String(p));
    const s = params.toString();
    return s ? `${basePath}?${s}` : basePath;
  };

  const heading = category
    ? pickLocalized(locale, category.name_it, category.name_en)
    : q
      ? t('titleFor', { q })
      : t('title');

  return (
    <div className="grid gap-8 lg:grid-cols-[16rem_1fr]">
      <aside aria-label={t('filters')}>
        <form action={basePath} method="get" className="card space-y-4 p-4">
          <h2 className="font-display text-lg font-bold">{t('filters')}</h2>
          {q && <input type="hidden" name="q" value={q} />}
          {!presetCategorySlug && (
            <div>
              <label className="label" htmlFor="f-category">{t('category')}</label>
              <select id="f-category" name="category" defaultValue={categorySlug} className="field">
                <option value="">{t('any')}</option>
                {categories?.map((c) => (
                  <option key={c.id} value={c.slug}>{pickLocalized(locale, c.name_it, c.name_en)}</option>
                ))}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label" htmlFor="f-min">{t('priceMin')}</label>
              <input id="f-min" name="min" type="number" min="0" step="1" defaultValue={Number.isFinite(priceMin) ? priceMin : ''} className="field" />
            </div>
            <div>
              <label className="label" htmlFor="f-max">{t('priceMax')}</label>
              <input id="f-max" name="max" type="number" min="0" step="1" defaultValue={Number.isFinite(priceMax) ? priceMax : ''} className="field" />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="f-material">{t('material')}</label>
            <input id="f-material" name="material" defaultValue={material} placeholder="PLA, PETG, resina…" className="field" />
          </div>
          <div>
            <label className="label" htmlFor="f-color">{t('color')}</label>
            <input id="f-color" name="color" defaultValue={color} className="field" />
          </div>
          <div>
            <label className="label" htmlFor="f-size">{t('size')}</label>
            <input id="f-size" name="size" defaultValue={size} className="field" />
          </div>
          <div>
            <label className="label" htmlFor="f-days">{t('maxDays')}</label>
            <input id="f-days" name="days" type="number" min="0" defaultValue={Number.isFinite(maxDays) ? maxDays : ''} className="field" />
          </div>
          <div>
            <label className="label" htmlFor="f-rating">{t('minRating')}</label>
            <select id="f-rating" name="rating" defaultValue={Number.isFinite(minRating) ? String(minRating) : ''} className="field">
              <option value="">{t('any')}</option>
              <option value="4">4+</option>
              <option value="3">3+</option>
            </select>
          </div>
          <fieldset className="space-y-2 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" name="custom" value="1" defaultChecked={customizable} /> {t('customizable')}</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="stock" value="1" defaultChecked={inStock} /> {t('inStock')}</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="pickup" value="1" defaultChecked={pickup} /> {t('pickup')}</label>
          </fieldset>
          <div>
            <label className="label" htmlFor="f-sort">{t('sort')}</label>
            <select id="f-sort" name="sort" defaultValue={sort} className="field">
              <option value="new">{t('sortNew')}</option>
              <option value="price_asc">{t('sortPriceAsc')}</option>
              <option value="price_desc">{t('sortPriceDesc')}</option>
              <option value="rating">{t('sortRating')}</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn-dark flex-1">{t('apply')}</button>
            <Link href={basePath} className="btn-ghost">{t('reset')}</Link>
          </div>
        </form>
      </aside>

      <section>
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="font-display text-3xl font-bold">{heading}</h1>
          <p className="text-ink-soft">{t('count', { n: total })}</p>
        </div>
        {products.length === 0 ? (
          <p className="notice">{t('none')}</p>
        ) : (
          <ul className="grid grid-cols-2 gap-4 md:grid-cols-3">
            {products.map((p) => (
              <li key={p.slug}>
                <ProductCard product={p} />
              </li>
            ))}
          </ul>
        )}
        {pages > 1 && (
          <nav className="mt-8 flex flex-wrap gap-2" aria-label="Pagination">
            {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
              <Link
                key={p}
                href={pageHref(p)}
                aria-current={p === page ? 'page' : undefined}
                className={p === page ? 'btn-dark !px-3 !py-1.5' : 'btn-ghost !px-3 !py-1.5'}
              >
                {p}
              </Link>
            ))}
          </nav>
        )}
      </section>
    </div>
  );
}
