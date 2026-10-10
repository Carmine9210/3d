import { Link } from '@/i18n/routing';

/** Piastrella categoria: strati stampati con una riga arancio, diversa per ogni categoria. */
export default function CategoryTile({ slug, name, index }: { slug: string; name: string; index: number }) {
  const rows = 6;
  const accent = index % rows;
  return (
    <Link
      href={`/category/${slug}`}
      className="card group relative flex min-h-[7rem] items-end overflow-hidden p-4 transition-colors hover:border-print"
    >
      <svg viewBox="0 0 120 60" className="absolute right-0 top-0 h-full w-1/2 opacity-90" aria-hidden="true" preserveAspectRatio="xMaxYMid slice">
        {Array.from({ length: rows }, (_, i) => {
          const w = 30 + ((i * 17 + index * 23) % 70);
          return (
            <rect key={i} x={120 - w - 6} y={6 + i * 9} width={w} height={5} rx={2.5}
              fill={i === accent ? '#F28C28' : '#0B1F3A'} fillOpacity={i === accent ? 1 : 0.14 + (i % 3) * 0.05} />
          );
        })}
      </svg>
      <span className="relative font-display text-lg font-bold leading-tight group-hover:underline">{name}</span>
    </Link>
  );
}
