-- Rimborsi: richieste dei clienti + tracciamento importo rimborsato sugli ordini.

alter table public.orders
  add column if not exists refunded_cents integer not null default 0 check (refunded_cents >= 0);

create type refund_request_status as enum ('open', 'approved', 'rejected');

create table public.refund_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  customer_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('not_received', 'damaged', 'not_as_described', 'changed_mind', 'other')),
  details text,
  status refund_request_status not null default 'open',
  refund_amount_cents integer check (refund_amount_cents is null or refund_amount_cents > 0),
  stripe_refund_id text,
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Una sola richiesta aperta per ordine.
create unique index refund_requests_one_open on public.refund_requests (order_id) where status = 'open';
create index refund_requests_order_idx on public.refund_requests (order_id);

create trigger set_updated_at before update on public.refund_requests
  for each row execute function public.set_updated_at();

alter table public.refund_requests enable row level security;

-- Lettura: cliente proprietario, venditore dell'ordine, admin. Scrittura solo via service role.
create policy refund_requests_read on public.refund_requests for select
  using (customer_id = auth.uid() or public.seller_has_order_items(order_id) or public.is_admin());

-- Rimette a magazzino le quantità di un ordine rimborsato prima della spedizione.
create or replace function public.restock_order(p_order_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.product_variants v
    set stock = v.stock + oi.quantity
    from public.order_items oi
    where oi.order_id = p_order_id and oi.variant_id = v.id;
end $$;

revoke all on function public.restock_order(uuid) from public, anon, authenticated;
