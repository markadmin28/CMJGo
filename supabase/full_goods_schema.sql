-- CMJGo Full Goods In/Out
-- Run this in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/nuieqalrgphmfjrpqnjw/sql/new

create table if not exists public.full_goods_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  constraint full_goods_locations_name_not_blank check (char_length(trim(name)) > 0)
);

create unique index if not exists full_goods_locations_name_unique
  on public.full_goods_locations (lower(name));

create table if not exists public.full_goods_movements (
  id uuid primary key default gen_random_uuid(),
  movement_type text not null check (movement_type in ('in', 'out')),
  movement_date date not null,
  truck_number text not null,
  load_number text not null,
  location text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  constraint full_goods_truck_not_blank check (char_length(trim(truck_number)) > 0),
  constraint full_goods_load_not_blank check (char_length(trim(load_number)) > 0),
  constraint full_goods_location_not_blank check (char_length(trim(location)) > 0)
);

-- Older installs had a global unique load_number; each category keeps its own series now.
drop index if exists public.full_goods_load_number_unique;
alter table public.full_goods_movements drop constraint if exists full_goods_movements_load_number_key;

create index if not exists full_goods_movements_date_idx
  on public.full_goods_movements (movement_date desc);

create index if not exists full_goods_movements_type_idx
  on public.full_goods_movements (movement_type);

alter table public.full_goods_movements
  add column if not exists category_id uuid references public.categories (id) on delete set null;

alter table public.full_goods_movements
  add column if not exists category_name text;

alter table public.full_goods_movements
  add column if not exists location_id uuid references public.full_goods_locations (id) on delete set null;

-- Older installs required brand_name on movements; keep columns but allow null.
alter table public.full_goods_movements
  add column if not exists brand_id uuid references public.subcategories (id) on delete set null;

alter table public.full_goods_movements
  add column if not exists brand_name text;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'full_goods_movements'
      and column_name = 'brand_name'
      and is_nullable = 'NO'
  ) then
    alter table public.full_goods_movements alter column brand_name drop not null;
  end if;
end $$;

-- Older installs required list_option on movements.
alter table public.full_goods_movements
  add column if not exists list_option text;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'full_goods_movements'
      and column_name = 'list_option'
      and is_nullable = 'NO'
  ) then
    alter table public.full_goods_movements alter column list_option drop not null;
  end if;
end $$;

create table if not exists public.full_goods_items (
  id uuid primary key default gen_random_uuid(),
  movement_id uuid not null,
  product_id uuid references public.products (id) on delete set null,
  product_name text not null,
  quantity numeric(12, 2) not null check (quantity >= 0),
  created_at timestamptz not null default now(),
  constraint full_goods_product_name_not_blank check (char_length(trim(product_name)) > 0)
);

alter table public.full_goods_items
  add column if not exists brand_id uuid references public.subcategories (id) on delete set null;

alter table public.full_goods_items
  add column if not exists brand_name text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'full_goods_items_movement_fk'
  ) then
    alter table public.full_goods_items
      add constraint full_goods_items_movement_fk
      foreign key (movement_id) references public.full_goods_movements (id) on delete cascade;
  end if;
end $$;

create index if not exists full_goods_items_movement_id_idx
  on public.full_goods_items (movement_id);

alter table public.full_goods_locations enable row level security;
alter table public.full_goods_movements enable row level security;
alter table public.full_goods_items enable row level security;

drop policy if exists "full_goods_locations_select_authenticated" on public.full_goods_locations;
drop policy if exists "full_goods_locations_insert_authenticated" on public.full_goods_locations;
drop policy if exists "full_goods_locations_update_authenticated" on public.full_goods_locations;
drop policy if exists "full_goods_locations_delete_authenticated" on public.full_goods_locations;

create policy "full_goods_locations_select_authenticated"
  on public.full_goods_locations for select to authenticated using (true);
create policy "full_goods_locations_insert_authenticated"
  on public.full_goods_locations for insert to authenticated with check (true);
create policy "full_goods_locations_update_authenticated"
  on public.full_goods_locations for update to authenticated using (true) with check (true);
create policy "full_goods_locations_delete_authenticated"
  on public.full_goods_locations for delete to authenticated using (true);

drop policy if exists "full_goods_movements_select_authenticated" on public.full_goods_movements;
drop policy if exists "full_goods_movements_insert_authenticated" on public.full_goods_movements;
drop policy if exists "full_goods_movements_update_authenticated" on public.full_goods_movements;
drop policy if exists "full_goods_movements_delete_authenticated" on public.full_goods_movements;

create policy "full_goods_movements_select_authenticated"
  on public.full_goods_movements for select to authenticated using (true);
create policy "full_goods_movements_insert_authenticated"
  on public.full_goods_movements for insert to authenticated with check (true);
create policy "full_goods_movements_update_authenticated"
  on public.full_goods_movements for update to authenticated using (true) with check (true);
create policy "full_goods_movements_delete_authenticated"
  on public.full_goods_movements for delete to authenticated using (true);

drop policy if exists "full_goods_items_select_authenticated" on public.full_goods_items;
drop policy if exists "full_goods_items_insert_authenticated" on public.full_goods_items;
drop policy if exists "full_goods_items_update_authenticated" on public.full_goods_items;
drop policy if exists "full_goods_items_delete_authenticated" on public.full_goods_items;

create policy "full_goods_items_select_authenticated"
  on public.full_goods_items for select to authenticated using (true);
create policy "full_goods_items_insert_authenticated"
  on public.full_goods_items for insert to authenticated with check (true);
create policy "full_goods_items_update_authenticated"
  on public.full_goods_items for update to authenticated using (true) with check (true);
create policy "full_goods_items_delete_authenticated"
  on public.full_goods_items for delete to authenticated using (true);

grant select, insert, update, delete on table public.full_goods_locations to authenticated;
grant select, insert, update, delete on table public.full_goods_movements to authenticated;
grant select, insert, update, delete on table public.full_goods_items to authenticated;
notify pgrst, 'reload schema';
