-- CMJGo Actual Inventory
-- Run this in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/nuieqalrgphmfjrpqnjw/sql/new

create table if not exists public.actual_inventories (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  as_of_month date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  constraint actual_inventories_category_not_blank check (char_length(trim(category)) > 0),
  constraint actual_inventories_month_is_first_day check (extract(day from as_of_month) = 1),
  constraint actual_inventories_category_month_unique unique (category, as_of_month)
);

create index if not exists actual_inventories_category_month_idx
  on public.actual_inventories (category, as_of_month desc);

create table if not exists public.actual_inventory_items (
  id uuid primary key default gen_random_uuid(),
  actual_inventory_id uuid not null references public.actual_inventories (id) on delete cascade,
  section text not null check (section in ('fg', 'mts')),
  product_id uuid references public.products (id) on delete set null,
  subcategory_name text not null default '',
  product_name text not null,
  quantity numeric(12, 3) not null default 0,
  created_at timestamptz not null default now(),
  constraint actual_inventory_items_product_name_not_blank check (char_length(trim(product_name)) > 0)
);

create index if not exists actual_inventory_items_inventory_id_idx
  on public.actual_inventory_items (actual_inventory_id);

alter table public.actual_inventories enable row level security;
alter table public.actual_inventory_items enable row level security;

drop policy if exists "actual_inventories_select_authenticated" on public.actual_inventories;
drop policy if exists "actual_inventories_insert_authenticated" on public.actual_inventories;
drop policy if exists "actual_inventories_update_authenticated" on public.actual_inventories;
drop policy if exists "actual_inventories_delete_authenticated" on public.actual_inventories;

create policy "actual_inventories_select_authenticated"
  on public.actual_inventories for select to authenticated using (true);
create policy "actual_inventories_insert_authenticated"
  on public.actual_inventories for insert to authenticated with check (true);
create policy "actual_inventories_update_authenticated"
  on public.actual_inventories for update to authenticated using (true) with check (true);
create policy "actual_inventories_delete_authenticated"
  on public.actual_inventories for delete to authenticated using (true);

drop policy if exists "actual_inventory_items_select_authenticated" on public.actual_inventory_items;
drop policy if exists "actual_inventory_items_insert_authenticated" on public.actual_inventory_items;
drop policy if exists "actual_inventory_items_update_authenticated" on public.actual_inventory_items;
drop policy if exists "actual_inventory_items_delete_authenticated" on public.actual_inventory_items;

create policy "actual_inventory_items_select_authenticated"
  on public.actual_inventory_items for select to authenticated using (true);
create policy "actual_inventory_items_insert_authenticated"
  on public.actual_inventory_items for insert to authenticated with check (true);
create policy "actual_inventory_items_update_authenticated"
  on public.actual_inventory_items for update to authenticated using (true) with check (true);
create policy "actual_inventory_items_delete_authenticated"
  on public.actual_inventory_items for delete to authenticated using (true);

grant select, insert, update, delete on table public.actual_inventories to authenticated;
grant select, insert, update, delete on table public.actual_inventory_items to authenticated;
notify pgrst, 'reload schema';
