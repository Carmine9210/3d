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
