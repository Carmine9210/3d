import { Link } from '@/i18n/routing';

export default function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2" aria-label="3D Market">
      <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
        <rect x="6" y="4" width="16" height="4" rx="2" fill="#0B1F3A" />
        <rect x="3" y="11" width="22" height="4" rx="2" fill="#F28C28" />
        <rect x="6" y="18" width="16" height="4" rx="2" fill="#0B1F3A" />
      </svg>
      <span className="font-display text-xl font-bold tracking-tight">3D Market</span>
    </Link>
  );
}
