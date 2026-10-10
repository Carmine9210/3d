import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { setUserBlocked, setUserRole } from '@/lib/actions/admin';
import SubmitButton from '@/components/SubmitButton';

const PER_PAGE = 50;

export default async function AdminUsers({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const locale = await getLocale();
  const me = await requireAdmin(locale);
  const sp = await searchParams;
  const t = await getTranslations('admin');
  const c = await getTranslations('common');
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);
  const q = (sp.q ?? '').trim().toLowerCase();

  // Le email stanno in Supabase Auth: le legge solo il service role, dopo la verifica admin.
  const admin = createAdminClient();
  const { data } = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE });
  const users = (data?.users ?? []).filter((u) => !q || (u.email ?? '').toLowerCase().includes(q));
  const ids = users.map((u) => u.id);
  const { data: profiles } = ids.length
    ? await admin.from('profiles').select('user_id, display_name, role').in('user_id', ids)
    : { data: [] as { user_id: string; display_name: string; role: string }[] };
  const byId = new Map((profiles ?? []).map((p) => [p.user_id, p]));
  const fmt = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'it-IT', { dateStyle: 'short' });
  const hasNext = (data?.users ?? []).length === PER_PAGE;

  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-bold">{t('usersTitle')}</h1>
      <form method="get" className="flex max-w-md gap-2" role="search">
        <label htmlFor="uq" className="sr-only">{t('searchEmail')}</label>
        <input id="uq" name="q" defaultValue={sp.q ?? ''} placeholder={t('searchEmail')} className="field" />
        <button type="submit" className="btn-dark">{c('search')}</button>
      </form>
      {users.length === 0 && <p className="notice">{t('nothing')}</p>}
      <ul className="space-y-2">
        {users.map((u) => {
          const p = byId.get(u.id);
          const blocked = Boolean(u.banned_until && new Date(u.banned_until) > new Date());
          const self = u.id === me.id;
          return (
            <li key={u.id} className="card flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{p?.display_name || '—'} <span className="font-normal text-ink-mute">· {u.email}</span></p>
                <p className="text-xs text-ink-mute">
                  {t('registered')} {fmt.format(new Date(u.created_at))}
                  {u.last_sign_in_at ? ` · ${t('lastLogin')} ${fmt.format(new Date(u.last_sign_in_at))}` : ''}
                  {!u.email_confirmed_at ? ` · ${t('unconfirmed')}` : ''}
                </p>
              </div>
              {blocked && <span className="rounded bg-bad/10 px-2 py-0.5 text-sm text-bad">{t('blocked')}</span>}
              <form action={setUserRole} className="flex items-end gap-2">
                <input type="hidden" name="user_id" value={u.id} />
                <label className="sr-only" htmlFor={`role-${u.id}`}>{t('role')}</label>
                <select id={`role-${u.id}`} name="role" defaultValue={p?.role ?? 'customer'} disabled={self} className="field !w-36 !py-1.5">
                  <option value="customer">customer</option>
                  <option value="seller">seller</option>
                  <option value="admin">admin</option>
                </select>
                {!self && <SubmitButton className="btn-ghost !px-3 !py-1.5 text-sm">{c('save')}</SubmitButton>}
              </form>
              {!self && (
                <form action={setUserBlocked}>
                  <input type="hidden" name="user_id" value={u.id} />
                  <input type="hidden" name="blocked" value={blocked ? '0' : '1'} />
                  <SubmitButton className={blocked ? 'btn-ghost !py-1.5' : 'btn-danger !py-1.5'}>{blocked ? t('unblock') : t('block')}</SubmitButton>
                </form>
              )}
            </li>
          );
        })}
      </ul>
      <nav className="flex gap-3" aria-label="Pagination">
        {page > 1 && <Link href={`/admin/users?page=${page - 1}${q ? `&q=${encodeURIComponent(q)}` : ''}`} className="btn-ghost">←</Link>}
        {hasNext && <Link href={`/admin/users?page=${page + 1}${q ? `&q=${encodeURIComponent(q)}` : ''}`} className="btn-ghost">→</Link>}
      </nav>
    </div>
  );
}
