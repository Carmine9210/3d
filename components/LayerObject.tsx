/**
 * Un vaso "stampato" a livelli: ogni riga è uno strato. Una sola riga è arancio
 * (lo strato in corso). L'animazione vive in globals.css ed è disattivata con prefers-reduced-motion.
 */
export default function LayerObject({ className = '' }: { className?: string }) {
  const rows = 44;
  const gap = 9;
  const h = 6;
  const cx = 160;
  const active = 14; // indice dal basso dello strato arancio
  const items = Array.from({ length: rows }, (_, i) => {
    const t = i / (rows - 1); // 0 = base, 1 = bocca
    const profile = 54 + 46 * Math.sin(t * Math.PI * 0.95 + 0.25) * (1 - 0.35 * t) + 14 * Math.sin(t * 9);
    const w = Math.max(40, profile * 1.5);
    const y = (rows - 1 - i) * gap + 10;
    return { i, w, y };
  });
  return (
    <svg
      viewBox={`0 0 320 ${rows * gap + 20}`}
      className={className}
      role="img"
      aria-hidden="true"
      focusable="false"
    >
      {items.map(({ i, w, y }) => (
        <rect
          key={i}
          className="layer-row"
          style={{ animationDelay: `${i * 35}ms` }}
          x={cx - w / 2}
          y={y}
          width={w}
          height={h}
          rx={h / 2}
          fill={i === active ? '#F28C28' : '#0B1F3A'}
          fillOpacity={i === active ? 1 : 0.92 - (i / rows) * 0.25}
        />
      ))}
    </svg>
  );
}
