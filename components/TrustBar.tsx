import { getTranslations } from 'next-intl/server';

const icons = {
  secure: <path d="M12 2l8 3v6c0 5-3.4 9.3-8 11-4.6-1.7-8-6-8-11V5l8-3zm-1 13l6-6-1.4-1.4L11 12.2 8.4 9.6 7 11l4 4z" />,
  tracked: <path d="M3 7l9-4 9 4v10l-9 4-9-4V7zm9-1.8L6.2 7.6 12 10.2l5.8-2.6L12 5.2zM5 9.2v6.5l6 2.7v-6.5L5 9.2zm14 0l-6 2.7v6.5l6-2.7V9.2z" />,
  refund: <path d="M12 5V2L7 6l5 4V7a5 5 0 11-5 5H5a7 7 0 107-7z" />,
  makers: <path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8L12 2z" />,
};

export default async function TrustBar({ compact = false }: { compact?: boolean }) {
  const t = await getTranslations('trust');
  const items = [
    ['secure', t('secure'), t('secureD')],
    ['tracked', t('tracked'), t('trackedD')],
    ['refund', t('refund'), t('refundD')],
    ['makers', t('makers'), t('makersD')],
  ] as const;
  return (
    <ul className={`grid gap-3 ${compact ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-4'}`}>
      {items.map(([key, title, desc]) => (
        <li key={key} className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-card bg-print-tint" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="#0B1F3A">{icons[key]}</svg>
          </span>
          <span>
            <span className="block text-sm font-semibold leading-tight">{title}</span>
            <span className="block text-xs text-ink-mute">{desc}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
