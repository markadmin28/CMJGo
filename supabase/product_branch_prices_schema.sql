-- CMJGo branch-specific product prices
-- Shared catalog (categories / subcategories / products); prices can differ by branch.
-- products.price remains the Davao / default price.
-- Run in Supabase SQL Editor after the main catalog schema.

create table if not exists public.product_branch_prices (
  product_id uuid not null references public.products (id) on delete cascade,
  branch text not null check (branch in ('Nabunturan', 'Davao', 'Maragusan')),
  price numeric(12, 2) not null check (price >= 0),
  show_in_customer_tx boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (product_id, branch)
);

create index if not exists product_branch_prices_branch_idx
  on public.product_branch_prices (branch);

-- Safe re-run: Nabunturan TX visibility flag
alter table public.product_branch_prices
  add column if not exists show_in_customer_tx boolean not null default false;

alter table public.product_branch_prices enable row level security;

drop policy if exists "product_branch_prices_select_authenticated" on public.product_branch_prices;
drop policy if exists "product_branch_prices_insert_authenticated" on public.product_branch_prices;
drop policy if exists "product_branch_prices_update_authenticated" on public.product_branch_prices;
drop policy if exists "product_branch_prices_delete_authenticated" on public.product_branch_prices;

create policy "product_branch_prices_select_authenticated"
  on public.product_branch_prices for select to authenticated using (true);
create policy "product_branch_prices_insert_authenticated"
  on public.product_branch_prices for insert to authenticated with check (true);
create policy "product_branch_prices_update_authenticated"
  on public.product_branch_prices for update to authenticated using (true) with check (true);
create policy "product_branch_prices_delete_authenticated"
  on public.product_branch_prices for delete to authenticated using (true);

grant select, insert, update, delete on table public.product_branch_prices to authenticated;
notify pgrst, 'reload schema';
