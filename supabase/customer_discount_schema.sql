-- CMJGo Customers Discount (separate from FTH Discount)
-- Dropdown lists are per branch (Davao vs Nabunturan).
-- Requires Stock Keeping Unit tables (supabase/schema.sql) first.

create table if not exists public.customer_discount_groups (
  id uuid primary key default gen_random_uuid(),
  branch text not null check (branch in ('Davao', 'Nabunturan', 'Maragusan')),
  name text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  constraint customer_discount_groups_name_not_blank check (char_length(trim(name)) > 0)
);

create unique index if not exists customer_discount_groups_branch_name_unique
  on public.customer_discount_groups (branch, lower(name));

create index if not exists customer_discount_groups_branch_idx
  on public.customer_discount_groups (branch);

create table if not exists public.customer_discounts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.customer_discount_groups (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  discount numeric(12, 2) not null check (discount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_discounts_unique_group_product unique (group_id, product_id)
);

create index if not exists customer_discounts_group_id_idx
  on public.customer_discounts (group_id);

alter table public.customer_discount_groups enable row level security;
alter table public.customer_discounts enable row level security;

drop policy if exists "customer_discount_groups_select_authenticated" on public.customer_discount_groups;
drop policy if exists "customer_discount_groups_insert_authenticated" on public.customer_discount_groups;
drop policy if exists "customer_discount_groups_update_authenticated" on public.customer_discount_groups;
drop policy if exists "customer_discount_groups_delete_authenticated" on public.customer_discount_groups;

create policy "customer_discount_groups_select_authenticated"
  on public.customer_discount_groups for select to authenticated using (true);
create policy "customer_discount_groups_insert_authenticated"
  on public.customer_discount_groups for insert to authenticated with check (true);
create policy "customer_discount_groups_update_authenticated"
  on public.customer_discount_groups for update to authenticated using (true) with check (true);
create policy "customer_discount_groups_delete_authenticated"
  on public.customer_discount_groups for delete to authenticated using (true);

drop policy if exists "customer_discounts_select_authenticated" on public.customer_discounts;
drop policy if exists "customer_discounts_insert_authenticated" on public.customer_discounts;
drop policy if exists "customer_discounts_update_authenticated" on public.customer_discounts;
drop policy if exists "customer_discounts_delete_authenticated" on public.customer_discounts;

create policy "customer_discounts_select_authenticated"
  on public.customer_discounts for select to authenticated using (true);
create policy "customer_discounts_insert_authenticated"
  on public.customer_discounts for insert to authenticated with check (true);
create policy "customer_discounts_update_authenticated"
  on public.customer_discounts for update to authenticated using (true) with check (true);
create policy "customer_discounts_delete_authenticated"
  on public.customer_discounts for delete to authenticated using (true);

grant select, insert, update, delete on table public.customer_discount_groups to authenticated;
grant select, insert, update, delete on table public.customer_discounts to authenticated;
notify pgrst, 'reload schema';
