import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { pickLocalized } from '@/lib/utils';
import SearchResults, { type SearchParams } from '@/components/SearchResults';

type Props = { params: Promise<{ locale: string; slug: string }>; searchParams: Promise<SearchParams> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const supabase = await createClient();
  const { data: cat } = await supabase.from('categories').select('id, name_it, name_en').eq('slug', slug).maybeSingle();
  if (!cat) return {};
  const { count } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', cat.id)
    .eq('status', 'published');
  return {
    title: pickLocalized(locale, cat.name_it, cat.name_en),
    // Niente pagine categoria vuote indicizzate.
    robots: (count ?? 0) === 0 ? { index: false, follow: true } : undefined,
    alternates: { canonical: `/${locale}/category/${slug}` },
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: cat } = await supabase.from('categories').select('id').eq('slug', slug).maybeSingle();
  if (!cat) notFound();
  return <SearchResults basePath={`/category/${slug}`} presetCategorySlug={slug} searchParams={await searchParams} />;
}
