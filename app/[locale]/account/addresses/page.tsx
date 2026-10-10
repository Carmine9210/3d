import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { deleteAddress, saveAddress, setDefaultAddress } from '@/lib/actions/account';
import SubmitButton from '@/components/SubmitButton';
import type { Tables } from '@/types/database';

export default async function AddressesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const locale = await getLocale();
  const viewer = await requireUser(locale, '/account/addresses');
  const sp = await searchParams;
  const t = await getTranslations('checkout');
  const a = await getTranslations('account');
  const c = await getTranslations('common');
  const supabase = await createClient();
  const { data: list } = await supabase.from('addresses').select('*').eq('user_id', viewer.id).order('is_default', { ascending: false }).order('created_at');
  const editing = (list ?? []).find((x) => x.id === sp.edit) ?? null;

  const f = (row: Tables<'addresses'> | null, name: keyof Tables<'addresses'>, label: string, required = true, auto?: string) => (
    <div>
      <label className="label" htmlFor={`a-${name}`}>{label}</label>
      <input id={`a-${name}`} name={name} defaultValue={(row?.[name] as string | null) ?? (name === 'country' ? 'IT' : '')} required={required} autoComplete={auto} className="field" />
    </div>
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/account" className="text-sm underline">← {c('back')}</Link>
      <h1 className="font-display text-3xl font-bold">{a('addresses')}</h1>
      {sp.saved && <p className="notice notice-ok" role="status">{c('saved')}</p>}
      {sp.error && <p className="notice notice-error" role="alert">{sp.error === 'limit' ? a('addressLimit') : c('error')}</p>}

      {(list ?? []).length === 0 ? (
        <p className="notice">{a('noAddresses')}</p>
      ) : (
        <ul className="space-y-2">
          {(list ?? []).map((x) => (
            <li key={x.id} className="card flex flex-wrap items-start justify-between gap-3 p-4">
              <address className="not-italic text-sm">
                <span className="font-semibold">{x.full_name}</span>
                {x.is_default && <span className="ml-2 rounded bg-print-tint px-2 py-0.5 text-xs">{a('defaultAddress')}</span>}
                <br />{x.line1}{x.line2 ? `, ${x.line2}` : ''}<br />{x.postal_code} {x.city} {x.province} ({x.country})
                {x.phone && <><br />{x.phone}</>}
              </address>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <Link href={`/account/addresses?edit=${x.id}#address-form`} className="underline">{c('edit')}</Link>
                {!x.is_default && (
                  <form action={setDefaultAddress}>
                    <input type="hidden" name="address_id" value={x.id} />
                    <SubmitButton className="underline">{a('makeDefault')}</SubmitButton>
                  </form>
                )}
                <form action={deleteAddress}>
                  <input type="hidden" name="address_id" value={x.id} />
                  <SubmitButton className="text-bad underline">{c('delete')}</SubmitButton>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form id="address-form" action={saveAddress} className="card space-y-3 p-5" key={editing?.id ?? 'new'}>
        <h2 className="font-display text-xl font-bold">{editing ? a('editAddress') : a('newAddress')}</h2>
        {editing && <input type="hidden" name="address_id" value={editing.id} />}
        {f(editing, 'full_name', t('fullName'), true, 'name')}
        {f(editing, 'line1', t('line1'), true, 'address-line1')}
        {f(editing, 'line2', t('line2'), false, 'address-line2')}
        <div className="grid grid-cols-2 gap-3">
          {f(editing, 'city', t('city'), true, 'address-level2')}
          {f(editing, 'postal_code', t('postalCode'), true, 'postal-code')}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {f(editing, 'province', t('province'), false)}
          {f(editing, 'country', t('country'), true, 'country')}
        </div>
        {f(editing, 'phone', t('phone'), false, 'tel')}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_default" defaultChecked={editing?.is_default ?? false} /> {a('makeDefault')}</label>
        <div className="flex gap-3">
          <SubmitButton className="btn-dark">{c('save')}</SubmitButton>
          {editing && <Link href="/account/addresses" className="btn-ghost">{c('cancel')}</Link>}
        </div>
      </form>
    </div>
  );
}
