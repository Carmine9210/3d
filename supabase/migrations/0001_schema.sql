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
