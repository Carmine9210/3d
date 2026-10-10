import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getStripe } from '@/lib/stripe/server';
import { siteUrl } from '@/lib/site';

export const dynamic = 'force-dynamic';

/** Apre la dashboard Express di Stripe (payout, saldo, documenti). */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const locale = searchParams.get('locale') === 'en' ? 'en' : 'it';
  const site = siteUrl();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${site}/${locale}/login`);

  const { data: vendor } = await supabase.from('vendors').select('stripe_account_id').eq('user_id', user.id).maybeSingle();
  if (!vendor?.stripe_account_id) return NextResponse.redirect(`${site}/${locale}/seller`);

  const link = await getStripe().accounts.createLoginLink(vendor.stripe_account_id);
  return NextResponse.redirect(link.url);
}
