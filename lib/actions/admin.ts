'use server';

import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/routing';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/auth';
import { z } from 'zod';

/** Ogni azione admin ri-verifica il ruolo sul server: non ci si affida alla UI. */
async function assertAdmin() {
  const locale = await getLocale();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect({ href: '/login', locale });
  const { data: profile } = await supabase.from('profiles').select('role').eq('user_id', user!.id).maybeSingle();
  if (profile?.role !== 'admin') redirect({ href: '/', locale });
  return { user: user!, admin: createAdminClient() };
}

export async function moderateProduct(formData: FormData) {
  const { user, admin } = await assertAdmin();
  const parsed = z
    .object({ product_id: z.string().uuid(), decision: z.enum(['approve', 'reject', 'suspend']) })
    .safeParse({ product_id: formData.get('product_id'), decision: formData.get('decision') });
  if (!parsed.success) return;
  const status = ({ approve: 'published', reject: 'draft', suspend: 'suspended' } as const)[parsed.data.decision];
  await admin.from('products').update({ status }).eq('id', parsed.data.product_id);
  await logAudit(admin, user.id, `product.${parsed.data.decision}`, 'product', parsed.data.product_id);
  revalidatePath('/', 'layout');
}

export async function setVendorStatus(formData: FormData) {
  const { user, admin } = await assertAdmin();
  const parsed = z
    .object({ vendor_id: z.string().uuid(), status: z.enum(['active', 'suspended']) })
    .safeParse({ vendor_id: formData.get('vendor_id'), status: formData.get('status') });
  if (!parsed.success) return;

  await admin.from('vendors').update({ status: parsed.data.status }).eq('id', parsed.data.vendor_id);
  const { data: store } = await admin.from('stores').select('id').eq('vendor_id', parsed.data.vendor_id).maybeSingle();
  if (store) {
    await admin.from('stores').update({ status: parsed.data.status }).eq('id', store.id);
    if (parsed.data.status === 'suspended') {
      await admin.from('products').update({ status: 'suspended' }).eq('store_id', store.id).in('status', ['published', 'pending']);
    }
  }
  await logAudit(admin, user.id, `vendor.${parsed.data.status}`, 'vendor', parsed.data.vendor_id);
  revalidatePath('/', 'layout');
}

export async function resolveReport(formData: FormData) {
  const { user, admin } = await assertAdmin();
  const parsed = z
    .object({
      report_id: z.string().uuid(),
      decision: z.enum(['resolve', 'dismiss', 'suspend_target']),
    })
    .safeParse({ report_id: formData.get('report_id'), decision: formData.get('decision') });
  if (!parsed.success) return;

  const { data: report } = await admin.from('reports').select('*').eq('id', parsed.data.report_id).maybeSingle();
  if (!report) return;

  if (parsed.data.decision === 'suspend_target') {
    if (report.target_type === 'product') {
      await admin.from('products').update({ status: 'suspended' }).eq('id', report.target_id);
    } else if (report.target_type === 'review') {
      await admin.from('reviews').update({ status: 'hidden' }).eq('id', report.target_id);
    } else if (report.target_type === 'store') {
      await admin.from('stores').update({ status: 'suspended' }).eq('id', report.target_id);
      await admin.from('products').update({ status: 'suspended' }).eq('store_id', report.target_id).in('status', ['published', 'pending']);
    }
  }
  await admin
    .from('reports')
    .update({ status: parsed.data.decision === 'dismiss' ? 'dismissed' : 'resolved' })
    .eq('id', report.id);
  await logAudit(admin, user.id, `report.${parsed.data.decision}`, report.target_type, report.target_id, {
    report_id: report.id,
  });
  revalidatePath('/', 'layout');
}

const configSchema = z.object({
  commission_pct: z.coerce.number().min(0).max(50),
  auto_publish_threshold: z.coerce.number().int().min(0).max(100),
  shipping_flat_eur: z.coerce.number().min(0).max(100),
  free_shipping_over_eur: z.coerce.number().min(0).max(10000),
});

/** Variabili di business modificabili senza toccare il codice (tabella app_config). */
export async function updateConfig(formData: FormData) {
  const locale = await getLocale();
  const { user, admin } = await assertAdmin();
  const parsed = configSchema.safeParse({
    commission_pct: String(formData.get('commission_pct') ?? '').replace(',', '.'),
    auto_publish_threshold: formData.get('auto_publish_threshold'),
    shipping_flat_eur: String(formData.get('shipping_flat_eur') ?? '').replace(',', '.'),
    free_shipping_over_eur: String(formData.get('free_shipping_over_eur') ?? '').replace(',', '.'),
  });
  if (!parsed.success) redirect({ href: '/admin/settings?error=invalid', locale });
  const d = parsed.data!;
  const rows = [
    { key: 'default_commission_bps', value: Math.round(d.commission_pct * 100) },
    { key: 'auto_publish_threshold', value: d.auto_publish_threshold },
    { key: 'shipping_flat_cents', value: Math.round(d.shipping_flat_eur * 100) },
    { key: 'free_shipping_over_cents', value: Math.round(d.free_shipping_over_eur * 100) },
  ];
  await admin.from('app_config').upsert(rows, { onConflict: 'key' });
  await logAudit(admin, user.id, 'config.updated', 'app_config', undefined, Object.fromEntries(rows.map((r) => [r.key, r.value])));
  revalidatePath('/', 'layout');
  redirect({ href: '/admin/settings?saved=1', locale });
}

/** Commissione personalizzata per un singolo venditore (es. accordi commerciali). */
export async function setVendorCommission(formData: FormData) {
  const { user, admin } = await assertAdmin();
  const parsed = z
    .object({ vendor_id: z.string().uuid(), pct: z.coerce.number().min(0).max(50) })
    .safeParse({ vendor_id: formData.get('vendor_id'), pct: String(formData.get('pct') ?? '').replace(',', '.') });
  if (!parsed.success) return;
  const bps = Math.round(parsed.data.pct * 100);
  await admin.from('vendors').update({ commission_bps: bps }).eq('id', parsed.data.vendor_id);
  await logAudit(admin, user.id, 'vendor.commission', 'vendor', parsed.data.vendor_id, { commission_bps: bps });
  revalidatePath('/', 'layout');
}

/** Ruolo di un utente (customer/admin; "seller" solo se ha uno shop). Mai su sé stessi. */
export async function setUserRole(formData: FormData) {
  const { user, admin } = await assertAdmin();
  const parsed = z
    .object({ user_id: z.string().uuid(), role: z.enum(['customer', 'seller', 'admin']) })
    .safeParse({ user_id: formData.get('user_id'), role: formData.get('role') });
  if (!parsed.success || parsed.data.user_id === user.id) return;
  if (parsed.data.role === 'seller') {
    const { count } = await admin.from('vendors').select('id', { count: 'exact', head: true }).eq('user_id', parsed.data.user_id);
    if (!count) return;
  }
  await admin.from('profiles').update({ role: parsed.data.role }).eq('user_id', parsed.data.user_id);
  await logAudit(admin, user.id, 'user.role', 'user', parsed.data.user_id, { role: parsed.data.role });
  revalidatePath('/', 'layout');
}

/** Blocca / sblocca l'accesso di un utente (ban di Supabase Auth). Mai su sé stessi. */
export async function setUserBlocked(formData: FormData) {
  const { user, admin } = await assertAdmin();
  const parsed = z
    .object({ user_id: z.string().uuid(), blocked: z.enum(['1', '0']) })
    .safeParse({ user_id: formData.get('user_id'), blocked: formData.get('blocked') });
  if (!parsed.success || parsed.data.user_id === user.id) return;
  const block = parsed.data.blocked === '1';
  await admin.auth.admin.updateUserById(parsed.data.user_id, { ban_duration: block ? '876000h' : 'none' });
  await logAudit(admin, user.id, block ? 'user.blocked' : 'user.unblocked', 'user', parsed.data.user_id);
  revalidatePath('/', 'layout');
}
