-- =============================================================================
--  3D MARKET — DATABASE COMPLETO PER SUPABASE (file unico)
--  Come usarlo: supabase.com → il tuo progetto → SQL Editor → New query →
--  incolla TUTTO questo file → Run. Da eseguire UNA SOLA VOLTA su un progetto nuovo.
--  Contiene, in ordine: migrazioni 0001→0008 + dati iniziali (categorie e impostazioni).
-- =============================================================================


-- ============================== 0001_schema.sql ==============================
-- 3D Market — schema MVP (Fase 1)
-- Importi sempre in centesimi (integer). Colonne currency ovunque per espansione futura.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- ---------- utilità ----------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- enum ----------
create type user_role as enum ('customer', 'seller', 'admin');
create type vendor_type as enum ('private', 'professional', 'company');
create type vendor_status as enum ('pending', 'active', 'suspended');
create type store_status as enum ('active', 'suspended');
create type product_status as enum ('draft', 'pending', 'published', 'suspended');
create type order_status as enum (
  'pending_payment', 'paid', 'in_production', 'shipped', 'delivered',
  'cancelled', 'refunded', 'disputed'
);
create type report_status as enum ('open', 'reviewing', 'resolved', 'dismissed');

-- ---------- profili ----------
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text not null default '',
  role user_role not null default 'customer',
  locale text not null default 'it' check (locale in ('it', 'en')),
  phone text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, display_name, locale)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    coalesce(nullif(new.raw_user_meta_data->>'locale', ''), 'it')
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- venditori e shop ----------
create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  type vendor_type not null default 'private',
  status vendor_status not null default 'active',
  stripe_account_id text unique,
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  tax_data jsonb not null default '{}'::jsonb,
  commission_bps integer not null default 1000 check (commission_bps between 0 and 5000),
  accepted_terms_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null unique references public.vendors(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  description_it text not null default '',
  description_en text not null default '',
  logo_url text,
  cover_url text,
  city text,
  region text,
  country text not null default 'IT',
  lat double precision,
  lng double precision,
  avg_production_days integer,
  return_policy text,
  avg_rating numeric(3,2) not null default 0,
  review_count integer not null default 0,
  status store_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- catalogo ----------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.categories(id) on delete set null,
  slug text not null unique,
  name_it text not null,
  name_en text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  slug text not null unique,
  title_it text not null default '',
  title_en text not null default '',
  description_it text not null default '',
  description_en text not null default '',
  base_price_cents integer not null check (base_price_cents >= 50),
  currency text not null default 'EUR',
  production_days integer not null default 3 check (production_days >= 0),
  is_customizable boolean not null default false,
  customization_note text,
  local_pickup boolean not null default false,
  status product_status not null default 'draft',
  avg_rating numeric(3,2) not null default 0,
  review_count integer not null default 0,
  search_vector tsvector,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (title_it <> '' or title_en <> '')
);

create or replace function public.products_search_update() returns trigger
language plpgsql as $$
begin
  new.search_vector :=
    setweight(to_tsvector('simple', coalesce(new.title_it, '') || ' ' || coalesce(new.title_en, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(new.description_it, '') || ' ' || coalesce(new.description_en, '')), 'C');
  return new;
end $$;

create trigger products_search_trg
  before insert or update of title_it, title_en, description_it, description_en on public.products
  for each row execute function public.products_search_update();

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  sku text,
  material text,
  color text,
  size text,
  finish text,
  price_delta_cents integer not null default 0,
  stock integer not null default 0 check (stock >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  storage_path text not null,
  alt text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- carrello ----------
create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  quantity integer not null default 1 check (quantity between 1 and 99),
  customization_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, variant_id, customization_text)
);

-- ---------- indirizzi ----------
create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null,
  line1 text not null,
  line2 text,
  city text not null,
  postal_code text not null,
  province text,
  country text not null default 'IT',
  phone text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- ordini ----------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete restrict,
  store_id uuid not null references public.stores(id) on delete restrict,
  status order_status not null default 'pending_payment',
  subtotal_cents integer not null check (subtotal_cents >= 0),
  shipping_cents integer not null default 0 check (shipping_cents >= 0),
  platform_fee_cents integer not null default 0 check (platform_fee_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  currency text not null default 'EUR',
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  shipping_address jsonb,
  pickup boolean not null default false,
  tracking_code text,
  carrier text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  variant_id uuid references public.product_variants(id) on delete set null,
  title_snapshot text not null,
  variant_snapshot text,
  unit_price_cents integer not null check (unit_price_cents >= 0),
  quantity integer not null check (quantity > 0),
  customization_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- recensioni, preferiti, segnalazioni ----------
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  customer_id uuid not null references auth.users(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comment text not null default '',
  status text not null default 'published' check (status in ('published', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, product_id)
);

create table public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, product_id)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references auth.users(id) on delete set null,
  target_type text not null check (target_type in ('product', 'store', 'review')),
  target_id uuid not null,
  reason text not null,
  details text,
  status report_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- infrastruttura ----------
create table public.stripe_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  type text not null,
  processed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.app_config (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- trigger updated_at ----------
do $$
declare t text;
begin
  for t in select unnest(array[
    'profiles','vendors','stores','categories','products','product_variants','product_images',
    'cart_items','addresses','orders','order_items','reviews','favorites','reports',
    'stripe_events','audit_logs','app_config'
  ]) loop
    execute format('create trigger set_updated_at before update on public.%I
                    for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ---------- indici ----------
create index products_store_status_idx on public.products (store_id, status);
create index products_category_idx on public.products (category_id) where status = 'published';
create index products_search_idx on public.products using gin (search_vector);
create index products_title_it_trgm on public.products using gin (title_it gin_trgm_ops);
create index products_title_en_trgm on public.products using gin (title_en gin_trgm_ops);
create index variants_product_idx on public.product_variants (product_id);
create index images_product_idx on public.product_images (product_id, sort_order);
create index orders_customer_idx on public.orders (customer_id);
create index orders_store_idx on public.orders (store_id);
create index orders_session_idx on public.orders (stripe_checkout_session_id);
create index order_items_order_idx on public.order_items (order_id);
create index reviews_product_idx on public.reviews (product_id);
create index cart_user_idx on public.cart_items (user_id);
create index reports_status_idx on public.reports (status);

-- ---------- logica di dominio ----------

-- Blocca la modifica del ruolo da parte di utenti non admin.
create or replace function public.protect_profile_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role
     and coalesce(auth.role(), 'service_role') <> 'service_role'
     and not exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin') then
    raise exception 'role change not allowed';
  end if;
  return new;
end $$;

create trigger protect_role before update on public.profiles
  for each row execute function public.protect_profile_role();

-- Aggiorna rating medio di prodotto e shop dopo ogni recensione.
create or replace function public.refresh_ratings() returns trigger
language plpgsql security definer set search_path = public as $$
declare pid uuid; sid uuid;
begin
  pid := coalesce(new.product_id, old.product_id);
  sid := coalesce(new.store_id, old.store_id);
  update public.products p set
    avg_rating = coalesce((select round(avg(rating)::numeric, 2) from public.reviews r where r.product_id = pid and r.status = 'published'), 0),
    review_count = (select count(*) from public.reviews r where r.product_id = pid and r.status = 'published')
  where p.id = pid;
  update public.stores s set
    avg_rating = coalesce((select round(avg(rating)::numeric, 2) from public.reviews r where r.store_id = sid and r.status = 'published'), 0),
    review_count = (select count(*) from public.reviews r where r.store_id = sid and r.status = 'published')
  where s.id = sid;
  return null;
end $$;

create trigger reviews_refresh_ratings
  after insert or update or delete on public.reviews
  for each row execute function public.refresh_ratings();

-- Segna un ordine come pagato e scala lo stock in modo atomico. Idempotente.
create or replace function public.mark_order_paid(p_order_id uuid, p_payment_intent text)
returns boolean language plpgsql security definer set search_path = public as $$
declare o public.orders%rowtype;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found or o.status <> 'pending_payment' then
    return false;
  end if;
  update public.orders
    set status = 'paid', paid_at = now(), stripe_payment_intent_id = p_payment_intent
    where id = p_order_id;
  update public.product_variants v
    set stock = greatest(v.stock - oi.quantity, 0)
    from public.order_items oi
    where oi.order_id = p_order_id and oi.variant_id = v.id;
  delete from public.cart_items c
    using public.order_items oi
    where oi.order_id = p_order_id and c.variant_id = oi.variant_id and c.user_id = o.customer_id;
  return true;
end $$;

revoke all on function public.mark_order_paid(uuid, text) from public, anon, authenticated;

-- ============================== 0002_rls.sql ==============================
-- RLS su TUTTE le tabelle. Le scritture sensibili (ordini, pagamenti, audit) passano dal service role.

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin');
$$;

create or replace function public.owns_store(p_store_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.stores s join public.vendors v on v.id = s.vendor_id
    where s.id = p_store_id and v.user_id = auth.uid()
  );
$$;

create or replace function public.owns_product(p_product_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.products p
    where p.id = p_product_id and public.owns_store(p.store_id)
  );
$$;

create or replace function public.product_is_public(p_product_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.products where id = p_product_id and status = 'published');
$$;

create or replace function public.seller_has_order_items(p_order_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.orders o where o.id = p_order_id and public.owns_store(o.store_id));
$$;

do $$
declare t text;
begin
  for t in select unnest(array[
    'profiles','vendors','stores','categories','products','product_variants','product_images',
    'cart_items','addresses','orders','order_items','reviews','favorites','reports',
    'stripe_events','audit_logs','app_config'
  ]) loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- profiles
create policy profiles_select_own on public.profiles for select using (user_id = auth.uid() or public.is_admin());
create policy profiles_update_own on public.profiles for update using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- vendors
create policy vendors_select on public.vendors for select using (user_id = auth.uid() or public.is_admin());
create policy vendors_admin_all on public.vendors for all using (public.is_admin()) with check (public.is_admin());
-- insert/update vendor: solo via service role (onboarding, webhook Stripe, admin)

-- stores
create policy stores_public_read on public.stores for select using (status = 'active' or public.owns_store(id) or public.is_admin());
create policy stores_owner_update on public.stores for update using (public.owns_store(id)) with check (public.owns_store(id));
create policy stores_admin_all on public.stores for all using (public.is_admin()) with check (public.is_admin());

-- categories
create policy categories_public_read on public.categories for select using (true);
create policy categories_admin_write on public.categories for all using (public.is_admin()) with check (public.is_admin());

-- products
create policy products_read on public.products for select
  using (status = 'published' or public.owns_store(store_id) or public.is_admin());
create policy products_owner_insert on public.products for insert with check (public.owns_store(store_id));
create policy products_owner_update on public.products for update
  using (public.owns_store(store_id)) with check (public.owns_store(store_id));
create policy products_owner_delete on public.products for delete using (public.owns_store(store_id));
create policy products_admin_all on public.products for all using (public.is_admin()) with check (public.is_admin());

-- variants
create policy variants_read on public.product_variants for select
  using (public.product_is_public(product_id) or public.owns_product(product_id) or public.is_admin());
create policy variants_owner_write on public.product_variants for all
  using (public.owns_product(product_id)) with check (public.owns_product(product_id));
create policy variants_admin_all on public.product_variants for all using (public.is_admin()) with check (public.is_admin());

-- images
create policy images_read on public.product_images for select
  using (public.product_is_public(product_id) or public.owns_product(product_id) or public.is_admin());
create policy images_owner_write on public.product_images for all
  using (public.owns_product(product_id)) with check (public.owns_product(product_id));
create policy images_admin_all on public.product_images for all using (public.is_admin()) with check (public.is_admin());

-- cart
create policy cart_own on public.cart_items for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- addresses
create policy addresses_own on public.addresses for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- orders (sola lettura; scritture via service role)
create policy orders_read on public.orders for select
  using (customer_id = auth.uid() or public.owns_store(store_id) or public.is_admin());
create policy order_items_read on public.order_items for select
  using (
    exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid())
    or public.seller_has_order_items(order_id)
    or public.is_admin()
  );

-- reviews (insert via service role dopo verifica acquisto)
create policy reviews_read on public.reviews for select
  using (status = 'published' or customer_id = auth.uid() or public.is_admin());
create policy reviews_admin_all on public.reviews for all using (public.is_admin()) with check (public.is_admin());

-- favorites
create policy favorites_own on public.favorites for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- reports
create policy reports_insert on public.reports for insert with check (reporter_id = auth.uid());
create policy reports_admin_all on public.reports for all using (public.is_admin()) with check (public.is_admin());

-- audit_logs: solo lettura admin (scrittura via service role)
create policy audit_admin_read on public.audit_logs for select using (public.is_admin());

-- app_config
create policy config_read on public.app_config for select using (true);
create policy config_admin_write on public.app_config for all using (public.is_admin()) with check (public.is_admin());

-- stripe_events: nessuna policy => accessibile solo al service role

-- ---------- Storage ----------
insert into storage.buckets (id, name, public) values ('product-images', 'product-images', true)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('store-assets', 'store-assets', true)
  on conflict (id) do nothing;

-- Il primo segmento del path è l'id dello shop: {store_id}/...
create policy storage_public_read on storage.objects for select
  using (bucket_id in ('product-images', 'store-assets'));

create policy storage_owner_insert on storage.objects for insert to authenticated
  with check (
    bucket_id in ('product-images', 'store-assets')
    and public.owns_store(((storage.foldername(name))[1])::uuid)
  );
create policy storage_owner_update on storage.objects for update to authenticated
  using (
    bucket_id in ('product-images', 'store-assets')
    and public.owns_store(((storage.foldername(name))[1])::uuid)
  );
create policy storage_owner_delete on storage.objects for delete to authenticated
  using (
    bucket_id in ('product-images', 'store-assets')
    and public.owns_store(((storage.foldername(name))[1])::uuid)
  );

-- ============================== 0003_guards.sql ==============================
-- Guardie di integrità: i venditori non possono auto-approvarsi né alterare rating/stato.

create or replace function public.caller_is_privileged() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth.role(), 'service_role') = 'service_role'
      or exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin');
$$;

create or replace function public.guard_products() returns trigger
language plpgsql as $$
begin
  if public.caller_is_privileged() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status not in ('draft') then
      raise exception 'new products must start as draft';
    end if;
    new.avg_rating := 0;
    new.review_count := 0;
  else
    if new.status is distinct from old.status
       and new.status in ('published', 'suspended', 'pending') then
      raise exception 'status change not allowed; use the publish flow';
    end if;
    if old.status = 'suspended' then
      raise exception 'suspended product cannot be modified by seller';
    end if;
    new.avg_rating := old.avg_rating;
    new.review_count := old.review_count;
  end if;
  return new;
end $$;

create trigger guard_products_trg before insert or update on public.products
  for each row execute function public.guard_products();

create or replace function public.guard_stores() returns trigger
language plpgsql as $$
begin
  if public.caller_is_privileged() then
    return new;
  end if;
  new.status := old.status;
  new.avg_rating := old.avg_rating;
  new.review_count := old.review_count;
  new.vendor_id := old.vendor_id;
  return new;
end $$;

create trigger guard_stores_trg before update on public.stores
  for each row execute function public.guard_stores();

-- ============================== 0004_refunds.sql ==============================
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

-- ============================== 0005_disputes.sql ==============================
-- Contestazioni: ricorda lo stato precedente per ripristinarlo se la contestazione viene vinta.
alter table public.orders add column if not exists pre_dispute_status order_status;

-- ============================== 0006_analytics.sql ==============================
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

-- ============================== 0007_phase2.sql ==============================
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

-- ============================== 0008_launch.sql ==============================
-- 3D Market — Step 8: strumenti per il lancio (codici sconto, modalità ferie, avviso scorte).
-- Tutto additivo. Per tornare indietro vedi il blocco "DOWN" in fondo.

-- ---------------------------------------------------------------------------
-- 1. Codici sconto per shop
-- ---------------------------------------------------------------------------
create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  code text not null check (code ~ '^[A-Z0-9_-]{3,24}$'),
  kind text not null check (kind in ('percent', 'fixed')),
  -- percent: 1..90 (%) · fixed: centesimi
  value integer not null check (value > 0),
  min_subtotal_cents integer not null default 0 check (min_subtotal_cents >= 0),
  starts_at timestamptz,
  expires_at timestamptz,
  max_uses integer check (max_uses is null or max_uses > 0),
  uses integer not null default 0 check (uses >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, code),
  check (kind <> 'percent' or value between 1 and 90),
  check (expires_at is null or starts_at is null or expires_at > starts_at)
);
create index coupons_code_idx on public.coupons (code) where active;
create trigger set_updated_at before update on public.coupons
  for each row execute function public.set_updated_at();
alter table public.coupons enable row level security;

-- Il venditore gestisce i codici del proprio shop; nessuna lettura pubblica (si validano sul server).
create policy coupons_owner_all on public.coupons for all
  using (public.owns_store(store_id)) with check (public.owns_store(store_id));
create policy coupons_admin_all on public.coupons for all
  using (public.is_admin()) with check (public.is_admin());

-- Il contatore di utilizzi lo scrive solo il sistema (pagamento confermato).
create or replace function public.guard_coupons() returns trigger
language plpgsql set search_path = public as $$
begin
  if public.caller_is_privileged() then return new; end if;
  if tg_op = 'INSERT' then
    new.uses := 0;
  else
    new.uses := old.uses;
    new.store_id := old.store_id;
  end if;
  return new;
end $$;
create trigger guard_coupons_trg before insert or update on public.coupons
  for each row execute function public.guard_coupons();

alter table public.orders
  add column if not exists coupon_id uuid references public.coupons(id) on delete set null,
  add column if not exists coupon_code text,
  add column if not exists discount_cents integer not null default 0 check (discount_cents >= 0);

-- Pagamento confermato: come prima + incrementa gli utilizzi del codice sconto (una sola volta).
create or replace function public.mark_order_paid(p_order_id uuid, p_payment_intent text)
returns boolean language plpgsql security definer set search_path = public as $$
declare o public.orders%rowtype;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found or o.status <> 'pending_payment' then
    return false;
  end if;
  update public.orders
    set status = 'paid', paid_at = now(), stripe_payment_intent_id = p_payment_intent
    where id = p_order_id;
  update public.product_variants v
    set stock = greatest(v.stock - oi.quantity, 0)
    from public.order_items oi
    where oi.order_id = p_order_id and oi.variant_id = v.id;
  delete from public.cart_items c
    using public.order_items oi
    where oi.order_id = p_order_id and c.variant_id = oi.variant_id and c.user_id = o.customer_id;
  if o.coupon_id is not null then
    update public.coupons set uses = uses + 1 where id = o.coupon_id;
  end if;
  return true;
end $$;
revoke all on function public.mark_order_paid(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Modalità ferie e soglia scorte basse
-- ---------------------------------------------------------------------------
alter table public.stores
  add column if not exists vacation_mode boolean not null default false,
  add column if not exists vacation_message text check (vacation_message is null or char_length(vacation_message) <= 300),
  add column if not exists low_stock_threshold integer not null default 2 check (low_stock_threshold between 0 and 100);

-- ---------------------------------------------------------------------------
-- DOWN (manuale):
--   alter table public.stores drop column vacation_mode, drop column vacation_message, drop column low_stock_threshold;
--   (ripristina mark_order_paid da 0001_schema.sql)
--   alter table public.orders drop column coupon_id, drop column coupon_code, drop column discount_cents;
--   drop table public.coupons; drop function public.guard_coupons();
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 3. Rate limit: lettura senza incremento (per contare solo i login falliti)
-- ---------------------------------------------------------------------------
create or replace function public.rate_limit_peek(p_key text, p_limit integer)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select r.count < p_limit or r.reset_at <= now() from public.rate_limits r where r.key = p_key), true);
$$;
revoke all on function public.rate_limit_peek(text, integer) from public, anon, authenticated;

-- ============================== seed.sql ==============================
-- Categorie iniziali (blueprint §04) e configurazione di default

insert into public.categories (slug, name_it, name_en, sort_order) values
  ('casa-decorazione',   'Casa e decorazione',        'Home & decor',            1),
  ('gadget-regali',      'Gadget e regali',           'Gadgets & gifts',         2),
  ('gaming-accessori',   'Gaming e accessori',        'Gaming & accessories',    3),
  ('cosplay-costumi',    'Cosplay e costumi',         'Cosplay & costumes',      4),
  ('miniature-modellismo','Miniature e modellismo',   'Miniatures & modelling',  5),
  ('ricambi-componenti', 'Ricambi e componenti',      'Spare parts & components',6),
  ('automotive',         'Automotive',                'Automotive',              7),
  ('ufficio-organizzazione','Ufficio e organizzazione','Office & organisation',  8),
  ('elettronica-supporti','Elettronica e supporti',   'Electronics & mounts',    9),
  ('prototipazione-b2b', 'Prototipazione e B2B',      'Prototyping & B2B',      10),
  ('articoli-personalizzati','Articoli personalizzati','Personalised items',     11),
  ('design-arte',        'Design e arte',             'Design & art',           12)
on conflict (slug) do nothing;

insert into public.app_config (key, value) values
  ('default_commission_bps', '1000'::jsonb),
  ('auto_publish_threshold', '3'::jsonb),
  ('shipping_flat_cents',    '490'::jsonb),
  ('free_shipping_over_cents','6000'::jsonb)
on conflict (key) do nothing;
