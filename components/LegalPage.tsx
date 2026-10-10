import { getTranslations } from 'next-intl/server';

export default async function LegalPage({ title, children }: { title: string; children?: React.ReactNode }) {
  const t = await getTranslations('legal');
  return (
    <article className="mx-auto max-w-prose space-y-4">
      <h1 className="font-display text-3xl font-bold">{title}</h1>
      <p className="notice">TODO-LEGAL — {t('todo')}</p>
      {children}
    </article>
  );
}
