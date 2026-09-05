-- CMJGo product catalog
-- Run this in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/nuieqalrgphmfjrpqnjw/sql/new

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  constraint categories_name_not_blank check (char_length(trim(name)) > 0)
);

create unique index if not exists categories_name_unique
  on public.categories (lower(name));

create table if not exists public.subcategories (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  constraint subcategories_name_not_blank check (char_length(trim(name)) > 0)
);

create unique index if not exists subcategories_name_unique
  on public.subcategories (category_id, lower(name));

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  subcategory_id uuid not null references public.subcategories (id) on delete cascade,
  name text not null,
  price numeric(12, 2) not null check (price >= 0),
  created_at timestamptz not null default now(),
  constraint products_name_not_blank check (char_length(trim(name)) > 0)
);

create unique index if not exists products_name_unique
  on public.products (subcategory_id, lower(name));

alter table public.categories enable row level security;
alter table public.subcategories enable row level security;
alter table public.products enable row level security;

drop policy if exists "categories_select_authenticated" on public.categories;
drop policy if exists "categories_insert_authenticated" on public.categories;
drop policy if exists "categories_update_authenticated" on public.categories;
drop policy if exists "categories_delete_authenticated" on public.categories;

create policy "categories_select_authenticated"
  on public.categories for select to authenticated using (true);
create policy "categories_insert_authenticated"
  on public.categories for insert to authenticated with check (true);
create policy "categories_update_authenticated"
  on public.categories for update to authenticated using (true) with check (true);
create policy "categories_delete_authenticated"
  on public.categories for delete to authenticated using (true);

drop policy if exists "subcategories_select_authenticated" on public.subcategories;
drop policy if exists "subcategories_insert_authenticated" on public.subcategories;
drop policy if exists "subcategories_update_authenticated" on public.subcategories;
drop policy if exists "subcategories_delete_authenticated" on public.subcategories;

create policy "subcategories_select_authenticated"
  on public.subcategories for select to authenticated using (true);
create policy "subcategories_insert_authenticated"
  on public.subcategories for insert to authenticated with check (true);
create policy "subcategories_update_authenticated"
  on public.subcategories for update to authenticated using (true) with check (true);
create policy "subcategories_delete_authenticated"
  on public.subcategories for delete to authenticated using (true);

drop policy if exists "products_select_authenticated" on public.products;
drop policy if exists "products_insert_authenticated" on public.products;
drop policy if exists "products_update_authenticated" on public.products;
drop policy if exists "products_delete_authenticated" on public.products;

create policy "products_select_authenticated"
  on public.products for select to authenticated using (true);
create policy "products_insert_authenticated"
  on public.products for insert to authenticated with check (true);
create policy "products_update_authenticated"
  on public.products for update to authenticated using (true) with check (true);
create policy "products_delete_authenticated"
  on public.products for delete to authenticated using (true);

grant select, insert, update, delete on table public.categories to authenticated;
grant select, insert, update, delete on table public.subcategories to authenticated;
grant select, insert, update, delete on table public.products to authenticated;
notify pgrst, 'reload schema';
