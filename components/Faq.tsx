import { getTranslations } from 'next-intl/server';

export default async function Faq() {
  const t = await getTranslations('home');
  const items = [1, 2, 3, 4, 5].map((n) => ({ q: t(`q${n}` as 'q1'), a: t(`a${n}` as 'a1') }));
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((i) => ({ '@type': 'Question', name: i.q, acceptedAnswer: { '@type': 'Answer', text: i.a } })),
  };
  return (
    <section aria-labelledby="faq-h">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <h2 id="faq-h" className="mb-4 font-display text-2xl font-bold">{t('faqTitle')}</h2>
      <div className="divide-y divide-line rounded-card border border-line bg-white">
        {items.map((i) => (
          <details key={i.q} className="group p-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
              {i.q}
              <span aria-hidden="true" className="text-print transition-transform group-open:rotate-45">+</span>
            </summary>
            <p className="mt-2 max-w-prose text-ink-soft">{i.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
