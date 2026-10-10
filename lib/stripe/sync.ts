import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStripe } from './server';

/** Allinea lo stato dell'account Stripe Connect di un venditore (utile anche senza webhook in locale). */
export async function syncVendorStripeStatus(vendorId: string, stripeAccountId: string) {
  const account = await getStripe().accounts.retrieve(stripeAccountId);
  const admin = createAdminClient();
  await admin
    .from('vendors')
    .update({
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
    })
    .eq('id', vendorId);
  return { chargesEnabled: account.charges_enabled, payoutsEnabled: account.payouts_enabled };
}
