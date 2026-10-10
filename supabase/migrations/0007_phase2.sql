-- 3D Market — Step 7: hardening per la produzione (Supabase + Netlify) e funzioni di Fase 2.
-- Tutto è additivo. Per tornare indietro vedi il blocco "DOWN" in fondo.

-- ---------------------------------------------------------------------------
-- 1. search_path fisso sulle funzioni trigger (linter Supabase: function_search_path_mutable)
-- ---------------------------------------------------------------------------
alter function public.set_updated_at() set search_path = public;
alter function public.products_search_update() set search_path = public;
alter function public.guard_products() set search_path = public;
alter function public.guard_stores() set search_path = public;

-- ---------------------------------------------------------------------------
-- 2. Limiti dei bucket applicati anche da Storage (non solo dal codice)
-- ---------------------------------------------------------------------------
update storage.buckets
  set file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
  where id in ('product-images', 'store-assets');

-- ---------------------------------------------------------------------------
-- 3. Rate limiting globale (vale per tutte le istanze serverless di Netlify)
-- ---------------------------------------------------------------------------
create table public.rate_limits (
  key text primary key,
  count integer not null default 0,
  reset_at timestamptz not null
);
alter table public.rate_limits enable row level security;
-- nessuna policy: solo service role

-- Registra un tentativo e dice se è ancora entro il limite (finestra fissa, atomico).
create or replace function public.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare c integer;
begin
  insert into public.rate_limits as r (key, count, reset_at)
  values (p_key, 1, now() + make_interval(secs => p_window_seconds))
  on conflict (key) do update set
    count = case when r.reset_at <= now() then 1 else r.count + 1 end,
    reset_at = case when r.reset_at <= now() then now() + make_interval(secs => p_window_seconds) else r.reset_at end
  returning count into c;
  return c <= p_limit;
end $$;
revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Risposta del venditore alle recensioni
-- ---------------------------------------------------------------------------
alter table public.reviews
  add column if not exists seller_reply text check (seller_reply is null or char_length(seller_reply) between 1 and 1500),
  add column if not exists seller_replied_at timestamptz;
create index if not exists reviews_store_idx on public.reviews (store_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 5. Messaggi cliente ↔ venditore legati all'ordine
-- ---------------------------------------------------------------------------
create table public.order_messages (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete set null,
  sender_role text not null check (sender_role in ('customer', 'seller', 'admin')),
  body text not null check (char_length(body) between 1 and 2000),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index order_messages_order_idx on public.order_messages (order_id, created_at);
create trigger set_updated_at before update on public.order_messages
  for each row execute function public.set_updated_at();
alter table public.order_messages enable row level security;

-- Lettura: cliente dell'ordine, venditore dello shop, admin. Scrittura solo lato server dopo verifica.
create policy order_messages_read on public.order_messages for select
  using (
    exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid())
    or public.seller_has_order_items(order_id)
    or public.is_admin()
  );

-- Realtime: i nuovi messaggi arrivano senza ricaricare la pagina (la RLS vale anche qui).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.order_messages;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Funnel di conversione aggregato per shop e giorno (nessun dato personale)
-- ---------------------------------------------------------------------------
create table public.store_funnel_daily (
  store_id uuid not null references public.stores(id) on delete cascade,
  day date not null default current_date,
  cart_adds integer not null default 0,
  checkouts integer not null default 0,
  primary key (store_id, day)
);
alter table public.store_funnel_daily enable row level security;
create policy funnel_owner_read on public.store_funnel_daily for select
  using (public.owns_store(store_id) or public.is_admin());

create or replace function public.track_funnel(p_store_id uuid, p_event text, p_n integer default 1)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_event not in ('cart_add', 'checkout') or p_n < 1 then return; end if;
  insert into public.store_funnel_daily (store_id, day, cart_adds, checkouts)
  values (p_store_id, current_date,
          case when p_event = 'cart_add' then p_n else 0 end,
          case when p_event = 'checkout' then p_n else 0 end)
  on conflict (store_id, day) do update set
    cart_adds = public.store_funnel_daily.cart_adds + excluded.cart_adds,
    checkouts = public.store_funnel_daily.checkouts + excluded.checkouts;
end $$;
revoke all on function public.track_funnel(uuid, text, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Pulizia periodica (chiamata dalla funzione schedulata Netlify)
-- ---------------------------------------------------------------------------
-- Annulla gli ordini mai pagati più vecchi di p_hours e svuota i contatori scaduti.
create or replace function public.cleanup_stale(p_hours integer default 48)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.orders set status = 'cancelled'
    where status = 'pending_payment' and created_at < now() - make_interval(hours => p_hours);
  get diagnostics n = row_count;
  delete from public.rate_limits where reset_at < now() - interval '1 day';
  delete from public.stripe_events where processed_at < now() - interval '90 days';
  return n;
end $$;
revoke all on function public.cleanup_stale(integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- DOWN (manuale, in ordine inverso):
--   drop function public.cleanup_stale(integer);
--   drop function public.track_funnel(uuid, text, integer); drop table public.store_funnel_daily;
--   alter publication supabase_realtime drop table public.order_messages; drop table public.order_messages;
--   drop index public.reviews_store_idx; alter table public.reviews drop column seller_reply, drop column seller_replied_at;
--   drop function public.rate_limit_hit(text, integer, integer); drop table public.rate_limits;
--   update storage.buckets set file_size_limit = null, allowed_mime_types = null where id in ('product-images','store-assets');
-- ---------------------------------------------------------------------------
