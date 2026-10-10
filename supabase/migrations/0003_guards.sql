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
