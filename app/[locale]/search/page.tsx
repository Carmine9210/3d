import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import SearchResults, { type SearchParams } from '@/components/SearchResults';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('search');
  return { title: t('title'), robots: { index: false, follow: true } };
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return <SearchResults basePath="/search" searchParams={await searchParams} />;
}
