import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { requireSeller } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { replyToReview } from '@/lib/actions/seller';
import { pickLocalized } from '@/lib/utils';
import Stars from '@/components/Stars';
import SubmitButton from '@/components/SubmitButton';

export default async function SellerReviews({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const locale = await getLocale();
  const { store } = await requireSeller(locale);
  const sp = await searchParams;
  const t = await getTranslations('reviewsSeller');
  const c = await getTranslations('common');
  const supabase = await createClient();

  // La RLS mostra le recensioni pubblicate; filtro sul mio shop.
  const { data: reviews } = await supabase
    .from('reviews')
    .select('id, rating, comment, created_at, seller_reply, seller_replied_at, products ( slug, title_it, title_en )')
    .eq('store_id', store.id)
    .order('created_at', { ascending: false })
    .limit(100);
  const list = reviews ?? [];
  const avg = list.length ? list.reduce((s, r) => s + r.rating, 0) / list.length : 0;
  const unanswered = list.filter((r) => !r.seller_reply).length;

  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-bold">{t('title')}</h1>
      <p className="text-ink-soft">{t('intro')}</p>
      {sp.saved && <p className="notice notice-ok" role="status">{c('saved')}</p>}
      {sp.error && <p className="notice notice-error" role="alert">{c('error')}</p>}
      {list.length > 0 && (
        <p className="flex flex-wrap items-center gap-3 text-sm">
          <Stars value={avg} /> <span>{t('summary', { avg: avg.toFixed(1), n: list.length })}</span>
          {unanswered > 0 && <span className="rounded bg-print-tint px-2 py-0.5">{t('unanswered', { n: unanswered })}</span>}
        </p>
      )}
      {list.length === 0 && <p className="notice">{t('empty')}</p>}
      <ul className="space-y-3">
        {list.map((r) => {
          const p = r.products as unknown as { slug: string; title_it: string; title_en: string } | null;
          return (
            <li key={r.id} className="card space-y-2 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Stars value={r.rating} />
                <span className="text-xs text-ink-mute">{new Date(r.created_at).toLocaleDateString(locale)}</span>
              </div>
              {p && <Link href={`/product/${p.slug}`} className="text-sm font-semibold underline">{pickLocalized(locale, p.title_it, p.title_en)}</Link>}
              {r.comment ? <p className="whitespace-pre-line">{r.comment}</p> : <p className="text-sm text-ink-mute">{t('noComment')}</p>}
              <form action={replyToReview} className="space-y-2 border-t border-line pt-3">
                <input type="hidden" name="review_id" value={r.id} />
                <label className="label" htmlFor={`reply-${r.id}`}>{r.seller_reply ? t('editReply') : t('reply')}</label>
                <textarea id={`reply-${r.id}`} name="reply" rows={2} maxLength={1500} defaultValue={r.seller_reply ?? ''} className="field" />
                <p className="text-xs text-ink-mute">{t('replyHint')}</p>
                <SubmitButton className="btn-dark !py-1.5">{t('publishReply')}</SubmitButton>
              </form>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
