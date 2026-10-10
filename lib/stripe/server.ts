import 'server-only';
import Stripe from 'stripe';
import { serverEnv } from '@/lib/env';

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) _stripe = new Stripe(serverEnv().STRIPE_SECRET_KEY);
  return _stripe;
}
