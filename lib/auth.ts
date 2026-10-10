import { redirect } from '@/i18n/routing';
import { createClient } from '@/lib/supabase/server';
import type { Json } from '@/types/database';

export type Viewer = {
  id: string;
  email: string | undefined;
  role: 'customer' | 'seller' | 'admin';
  displayName: string;
};

export async function getViewer(): Promise<Viewer | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, display_name')
    .eq('user_id', user.id)
    .maybeSingle();
  return {
    id: user.id,
    email: user.email,
    role: (profile?.role as Viewer['role']) ?? 'customer',
    displayName: profile?.display_name ?? '',
  };
}

export async function requireUser(locale: string, next?: string): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect({ href: next ? `/login?next=${encodeURIComponent(next)}` : '/login', locale });
  return viewer!;
}

export async function requireAdmin(locale: string): Promise<Viewer> {
  const viewer = await requireUser(locale);
  if (viewer.role !== 'admin') redirect({ href: '/', locale });
  return viewer;
}

/** Restituisce vendor + store dell'utente corrente (o null). */
export async function getSellerContext(userId: string) {
  const supabase = await createClient();
  const { data: vendor } = await supabase
    .from('vendors')
    .select('id, status, stripe_account_id, charges_enabled, payouts_enabled, commission_bps')
    .eq('user_id', userId)
    .maybeSingle();
  if (!vendor) return { vendor: null, store: null };
  const { data: store } = await supabase
    .from('stores')
    .select('id, slug, name, status, city, region')
    .eq('vendor_id', vendor.id)
    .maybeSingle();
  return { vendor, store };
}

export async function requireSeller(locale: string) {
  const viewer = await requireUser(locale);
  const ctx = await getSellerContext(viewer.id);
  if (!ctx.vendor || !ctx.store) redirect({ href: '/seller/onboarding', locale });
  return { viewer, vendor: ctx.vendor!, store: ctx.store! };
}

export async function logAudit(
  admin: ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>,
  actorId: string | null,
  action: string,
  targetType?: string,
  targetId?: string,
  metadata: { [key: string]: Json | undefined } = {},
) {
  await admin.from('audit_logs').insert({
    actor_id: actorId,
    action,
    target_type: targetType,
    target_id: targetId,
    metadata,
  });
}
