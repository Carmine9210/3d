-- Statistiche venditore: visite aggregate per giorno (nessun dato personale, nessun cookie).

create table public.product_view_daily (
  product_id uuid not null references public.products(id) on delete cascade,
  day date not null default current_date,
  views integer not null default 0,
  primary key (product_id, day)
);

create index product_view_daily_day_idx on public.product_view_daily (day);

alter table public.product_view_daily enable row level security;

create policy views_owner_read on public.product_view_daily for select
  using (public.owns_product(product_id) or public.is_admin());

-- Registra una visita solo per prodotti pubblicati. Chiamabile anche da anonimi.
create or replace function public.track_product_view(p_product_id uuid) returns void
language sql security definer set search_path = public as $$
  insert into public.product_view_daily (product_id, day, views)
  select p.id, current_date, 1 from public.products p
  where p.id = p_product_id and p.status = 'published'
  on conflict (product_id, day) do update set views = public.product_view_daily.views + 1;
$$;

revoke all on function public.track_product_view(uuid) from public;
grant execute on function public.track_product_view(uuid) to anon, authenticated;
