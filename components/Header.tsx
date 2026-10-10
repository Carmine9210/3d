import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { getViewer } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { signOut } from '@/lib/actions/auth';
import { readGuestCart } from '@/lib/guest-cart';
import { guestItemCount } from '@/lib/guest-cart-core';
import { pickLocalized } from '@/lib/utils';
import Logo from './Logo';
import LocaleSwitcher from './LocaleSwitcher';

export default async function Header() {
  const t = await getTranslations('common');
  const locale = await getLocale();
  const viewer = await getViewer();
  const supabase = await createClient();

  let cartCount = 0;
  let isSeller = false;
  if (viewer) {
    const { data } = await supabase.from('cart_items').select('quantity');
    cartCount = (data ?? []).reduce((n, r) => n + r.quantity, 0);
    const { count } = await supabase.from('vendors').select('id', { count: 'exact', head: true }).eq('user_id', viewer.id);
    isSeller = (count ?? 0) > 0;
  } else {
    cartCount = guestItemCount(await readGuestCart());
  }
  const { data: categories } = await supabase.from('categories').select('slug, name_it, name_en').order('sort_order').limit(8);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Logo />
        <form action={`/${locale}/search`} method="get" role="search" className="order-last flex w-full flex-1 gap-2 md:order-none md:w-auto">
          <label htmlFor="q" className="sr-only">{t('search')}</label>
          <input id="q" name="q" type="search" className="field" placeholder={t('searchPlaceholder')} />
          <button type="submit" className="btn-dark">{t('search')}</button>
        </form>
        <nav className="ml-auto flex items-center gap-4 text-sm font-medium" aria-label="Main">
          {viewer?.role === 'admin' && <Link href="/admin">{t('adminArea')}</Link>}
          <Link href={isSeller ? '/seller' : '/seller/onboarding'} className="hidden sm:inline">{isSeller ? t('sellerArea') : t('sell')}</Link>
          <Link href="/cart" className="relative" aria-label={`${t('cart')}${cartCount ? ` (${cartCount})` : ''}`}>
            {t('cart')}
            {cartCount > 0 && <span className="ml-1 rounded-full bg-print px-1.5 py-0.5 text-xs font-bold text-ink">{cartCount}</span>}
          </Link>
          {viewer ? (
            <>
              <Link href="/account">{t('account')}</Link>
              <form action={signOut}>
                <button type="submit" className="text-ink-soft hover:text-ink">{t('logout')}</button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login">{t('login')}</Link>
              <Link href="/register" className="btn-primary !py-1.5">{t('register')}</Link>
            </>
          )}
          <LocaleSwitcher />
        </nav>
      </div>
      {categories && categories.length > 0 && (
        <nav className="hidden border-t border-line md:block" aria-label="Categories">
          <ul className="mx-auto flex max-w-6xl gap-5 overflow-x-auto px-4 py-2 text-sm text-ink-soft">
            {categories.map((c) => (
              <li key={c.slug} className="shrink-0">
                <Link href={`/category/${c.slug}`} className="hover:text-ink hover:underline">{pickLocalized(locale, c.name_it, c.name_en)}</Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}
