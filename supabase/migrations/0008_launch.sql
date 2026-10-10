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
