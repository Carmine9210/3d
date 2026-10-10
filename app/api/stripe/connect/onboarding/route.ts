import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStripe } from '@/lib/stripe/server';
import { siteUrl } from '@/lib/site';

export const dynamic = 'force-dynamic';

/** Avvia (o riprende) l'onboarding Stripe Connect Express del venditore corrente. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const locale = searchParams.get('locale') === 'en' ? 'en' : 'it';
  const site = siteUrl();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${site}/${locale}/login?next=/seller`);

  const { data: vendor } = await supabase
    .from('vendors')
    .select('id, stripe_account_id, status')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!vendor || vendor.status === 'suspended') return NextResponse.redirect(`${site}/${locale}/seller/onboarding`);

  const stripe = getStripe();
  let accountId = vendor.stripe_account_id;
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: 'express',
      country: 'IT',
      email: user.email,
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      metadata: { vendor_id: vendor.id },
    });
    accountId = account.id;
    await createAdminClient().from('vendors').update({ stripe_account_id: accountId }).eq('id', vendor.id);
  }

  const link = await stripe.accountLinks.create({
    account: accountId,
    type: 'account_onboarding',
    refresh_url: `${site}/api/stripe/connect/onboarding?locale=${locale}`,
    return_url: `${site}/${locale}/seller?stripe=return`,
  });
  return NextResponse.redirect(link.url);
}
