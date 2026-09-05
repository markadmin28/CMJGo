-- CMJGo BO (Bad Order) In/Out
-- Run this in Supabase SQL Editor.

create table if not exists public.bo_movements (
  id uuid primary key default gen_random_uuid(),
  company text not null check (company in ('PC', 'SMC', 'MAGNOLIA')),
  direction text not null check (direction in ('in', 'out')),
  movement_date date not null,
  truck_number text not null,
  load_number text not null,
  from_location text not null,
  pallets numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  constraint bo_truck_not_blank check (char_length(trim(truck_number)) > 0),
  constraint bo_load_not_blank check (char_length(trim(load_number)) > 0),
  constraint bo_from_not_blank check (char_length(trim(from_location)) > 0)
);

create index if not exists bo_movements_date_idx
  on public.bo_movements (movement_date desc);

create index if not exists bo_movements_company_direction_idx
  on public.bo_movements (company, direction);

create table if not exists public.bo_movement_items (
  id uuid primary key default gen_random_uuid(),
  movement_id uuid not null references public.bo_movements (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  product_name text not null,
  brand_id uuid references public.subcategories (id) on delete set null,
  brand_name text,
  quantity numeric(12, 2) not null check (quantity >= 0),
  created_at timestamptz not null default now(),
  constraint bo_product_name_not_blank check (char_length(trim(product_name)) > 0)
);

create index if not exists bo_movement_items_movement_id_idx
  on public.bo_movement_items (movement_id);

alter table public.bo_movements enable row level security;
alter table public.bo_movement_items enable row level security;

drop policy if exists "bo_movements_select_authenticated" on public.bo_movements;
drop policy if exists "bo_movements_insert_authenticated" on public.bo_movements;
drop policy if exists "bo_movements_update_authenticated" on public.bo_movements;
drop policy if exists "bo_movements_delete_authenticated" on public.bo_movements;

create policy "bo_movements_select_authenticated"
  on public.bo_movements for select to authenticated using (true);
create policy "bo_movements_insert_authenticated"
  on public.bo_movements for insert to authenticated with check (true);
create policy "bo_movements_update_authenticated"
  on public.bo_movements for update to authenticated using (true) with check (true);
create policy "bo_movements_delete_authenticated"
  on public.bo_movements for delete to authenticated using (true);

drop policy if exists "bo_items_select_authenticated" on public.bo_movement_items;
drop policy if exists "bo_items_insert_authenticated" on public.bo_movement_items;
drop policy if exists "bo_items_update_authenticated" on public.bo_movement_items;
drop policy if exists "bo_items_delete_authenticated" on public.bo_movement_items;

create policy "bo_items_select_authenticated"
  on public.bo_movement_items for select to authenticated using (true);
create policy "bo_items_insert_authenticated"
  on public.bo_movement_items for insert to authenticated with check (true);
create policy "bo_items_update_authenticated"
  on public.bo_movement_items for update to authenticated using (true) with check (true);
create policy "bo_items_delete_authenticated"
  on public.bo_movement_items for delete to authenticated using (true);

grant select, insert, update, delete on table public.bo_movements to authenticated;
grant select, insert, update, delete on table public.bo_movement_items to authenticated;
