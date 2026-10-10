import { Link } from '@/i18n/routing';

export default function NotFound() {
  return (
    <div className="py-20 text-center">
      <h1 className="font-display text-4xl font-bold">404</h1>
      <p className="mt-2 text-ink-soft">Pagina non trovata · Page not found</p>
      <Link href="/" className="btn-primary mt-6">
        3D Market
      </Link>
    </div>
  );
}
