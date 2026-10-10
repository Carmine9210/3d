import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { setVendorCommission, setVendorStatus } from '@/lib/actions/admin';
import SubmitButton from '@/components/SubmitButton';

export default async function AdminSellers() {
  const t = await getTranslations('admin');
  const c = await getTranslations('common');
  const supabase = await createClient();
  const { data: vendors } = await supabase
    .from('vendors')
    .select('id, type, status, charges_enabled, commission_bps, created_at, stores ( name, city )')
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-bold">{t('users')}</h1>
      {(vendors ?? []).length === 0 && <p className="notice">{t('nothing')}</p>}
      <ul className="space-y-2">
        {(vendors as any[] | null)?.map((v) => {
          const store = Array.isArray(v.stores) ? v.stores[0] : v.stores;
          const suspended = v.status === 'suspended';
          return (
            <li key={v.id} className="card flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{store?.name ?? '—'}</p>
                <p className="text-sm text-ink-mute">{store?.city} · {v.type} · {v.commission_bps / 100}% · Stripe: {v.charges_enabled ? c('yes') : c('no')}</p>
              </div>
              <form action={setVendorCommission} className="flex items-end gap-2">
                <input type="hidden" name="vendor_id" value={v.id} />
                <div>
                  <label className="label" htmlFor={`com-${v.id}`}>{t('vendorCommission')}</label>
                  <input id={`com-${v.id}`} name="pct" type="number" min={0} max={50} step="0.1" defaultValue={v.commission_bps / 100} className="field !w-24" />
                </div>
                <SubmitButton className="btn-ghost !px-3 !py-2 text-sm">{c('save')}</SubmitButton>
              </form>
              <span className="rounded bg-print-tint px-2 py-0.5 text-sm">{v.status}</span>
              <form action={setVendorStatus}>
                <input type="hidden" name="vendor_id" value={v.id} />
                <input type="hidden" name="status" value={suspended ? 'active' : 'suspended'} />
                <SubmitButton className={suspended ? 'btn-ghost !py-1.5' : 'btn-danger !py-1.5'}>{suspended ? t('activate') : t('suspend')}</SubmitButton>
              </form>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
