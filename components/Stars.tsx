export default function Stars({ value, label }: { value: number; label?: string }) {
  const full = Math.round(value);
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={label ?? `${value}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} width="14" height="14" viewBox="0 0 20 20" aria-hidden="true">
          <path
            d="M10 1.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6L10 15l-5.4 3 1.2-6L1.3 7.8l6.1-.7L10 1.5z"
            fill={i <= full ? '#F28C28' : '#D9DFE8'}
          />
        </svg>
      ))}
    </span>
  );
}
