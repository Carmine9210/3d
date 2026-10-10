-- Contestazioni: ricorda lo stato precedente per ripristinarlo se la contestazione viene vinta.
alter table public.orders add column if not exists pre_dispute_status order_status;
