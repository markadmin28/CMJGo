-- CMJGo FTH Discount
-- Run this in Supabase SQL Editor if FTH tables are missing:
-- https://supabase.com/dashboard/project/nuieqalrgphmfjrpqnjw/sql/new
--
-- Requires Stock Keeping Unit tables (supabase/schema.sql) first.

create table if not exists public.fth_route_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  constraint fth_route_types_name_not_blank check (char_length(trim(name)) > 0)
);

create unique index if not exists fth_route_types_name_unique
  on public.fth_route_types (lower(name));

create table if not exists public.fth_discounts (
  id uuid primary key default gen_random_uuid(),
  route_type_id uuid not null references public.fth_route_types (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  discount numeric(12, 2) not null check (discount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fth_discounts_unique_route_product unique (route_type_id, product_id)
);

create index if not exists fth_discounts_route_type_id_idx
  on public.fth_discounts (route_type_id);

alter table public.fth_route_types enable row level security;
alter table public.fth_discounts enable row level security;

drop policy if exists "fth_route_types_select_authenticated" on public.fth_route_types;
drop policy if exists "fth_route_types_insert_authenticated" on public.fth_route_types;
drop policy if exists "fth_route_types_update_authenticated" on public.fth_route_types;
drop policy if exists "fth_route_types_delete_authenticated" on public.fth_route_types;

create policy "fth_route_types_select_authenticated"
  on public.fth_route_types for select to authenticated using (true);
create policy "fth_route_types_insert_authenticated"
  on public.fth_route_types for insert to authenticated with check (true);
create policy "fth_route_types_update_authenticated"
  on public.fth_route_types for update to authenticated using (true) with check (true);
create policy "fth_route_types_delete_authenticated"
  on public.fth_route_types for delete to authenticated using (true);

drop policy if exists "fth_discounts_select_authenticated" on public.fth_discounts;
drop policy if exists "fth_discounts_insert_authenticated" on public.fth_discounts;
drop policy if exists "fth_discounts_update_authenticated" on public.fth_discounts;
drop policy if exists "fth_discounts_delete_authenticated" on public.fth_discounts;

create policy "fth_discounts_select_authenticated"
  on public.fth_discounts for select to authenticated using (true);
create policy "fth_discounts_insert_authenticated"
  on public.fth_discounts for insert to authenticated with check (true);
create policy "fth_discounts_update_authenticated"
  on public.fth_discounts for update to authenticated using (true) with check (true);
create policy "fth_discounts_delete_authenticated"
  on public.fth_discounts for delete to authenticated using (true);

grant select, insert, update, delete on table public.fth_route_types to authenticated;
grant select, insert, update, delete on table public.fth_discounts to authenticated;
notify pgrst, 'reload schema';
