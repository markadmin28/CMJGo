-- CMJGo Factory Transaction
-- Run this in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/nuieqalrgphmfjrpqnjw/sql/new

create table if not exists public.factory_transactions (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  plate_no text not null,
  load_no text not null,
  driver text not null default '',
  helper text not null default '',
  transaction_date date not null default (timezone('utc', now()))::date,
  fulls_amount numeric(14, 2) not null default 0,
  mts_amount numeric(14, 2) not null default 0,
  discount_fth_amount numeric(14, 2) not null default 0,
  payable_amount numeric(14, 2) not null default 0,
  cheque_no text not null default '',
  cheque_amount numeric(14, 2),
  cheque_due_date date,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  constraint factory_transactions_category_not_blank check (char_length(trim(category)) > 0),
  constraint factory_transactions_plate_not_blank check (char_length(trim(plate_no)) > 0),
  constraint factory_transactions_load_not_blank check (char_length(trim(load_no)) > 0)
);

create index if not exists factory_transactions_date_idx
  on public.factory_transactions (transaction_date desc);

create index if not exists factory_transactions_category_idx
  on public.factory_transactions (category);

create table if not exists public.factory_transaction_items (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.factory_transactions (id) on delete cascade,
  section text not null check (section in ('fg', 'mts')),
  product_id uuid references public.products (id) on delete set null,
  subcategory_name text not null default '',
  product_name text not null,
  price numeric(12, 2) not null default 0,
  pallets numeric(12, 3) not null default 0,
  cases numeric(12, 3) not null default 0,
  discount numeric(12, 2) not null default 0,
  line_amount numeric(14, 2) not null default 0,
  discount_amount numeric(14, 2) not null default 0,
  created_at timestamptz not null default now(),
  constraint factory_transaction_items_product_name_not_blank check (char_length(trim(product_name)) > 0)
);

create index if not exists factory_transaction_items_transaction_id_idx
  on public.factory_transaction_items (transaction_id);

create table if not exists public.factory_transaction_adjustments (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.factory_transactions (id) on delete cascade,
  kind text not null check (kind in ('deductions', 'additionals')),
  sort_order integer not null default 0,
  description text not null default '',
  amount numeric(14, 2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists factory_transaction_adjustments_transaction_id_idx
  on public.factory_transaction_adjustments (transaction_id);

alter table public.factory_transactions enable row level security;
alter table public.factory_transaction_items enable row level security;
alter table public.factory_transaction_adjustments enable row level security;

drop policy if exists "factory_transactions_select_authenticated" on public.factory_transactions;
drop policy if exists "factory_transactions_insert_authenticated" on public.factory_transactions;
drop policy if exists "factory_transactions_update_authenticated" on public.factory_transactions;
drop policy if exists "factory_transactions_delete_authenticated" on public.factory_transactions;

create policy "factory_transactions_select_authenticated"
  on public.factory_transactions for select to authenticated using (true);
create policy "factory_transactions_insert_authenticated"
  on public.factory_transactions for insert to authenticated with check (true);
create policy "factory_transactions_update_authenticated"
  on public.factory_transactions for update to authenticated using (true) with check (true);
create policy "factory_transactions_delete_authenticated"
  on public.factory_transactions for delete to authenticated using (true);

drop policy if exists "factory_transaction_items_select_authenticated" on public.factory_transaction_items;
drop policy if exists "factory_transaction_items_insert_authenticated" on public.factory_transaction_items;
drop policy if exists "factory_transaction_items_update_authenticated" on public.factory_transaction_items;
drop policy if exists "factory_transaction_items_delete_authenticated" on public.factory_transaction_items;

create policy "factory_transaction_items_select_authenticated"
  on public.factory_transaction_items for select to authenticated using (true);
create policy "factory_transaction_items_insert_authenticated"
  on public.factory_transaction_items for insert to authenticated with check (true);
create policy "factory_transaction_items_update_authenticated"
  on public.factory_transaction_items for update to authenticated using (true) with check (true);
create policy "factory_transaction_items_delete_authenticated"
  on public.factory_transaction_items for delete to authenticated using (true);

drop policy if exists "factory_transaction_adjustments_select_authenticated" on public.factory_transaction_adjustments;
drop policy if exists "factory_transaction_adjustments_insert_authenticated" on public.factory_transaction_adjustments;
drop policy if exists "factory_transaction_adjustments_update_authenticated" on public.factory_transaction_adjustments;
drop policy if exists "factory_transaction_adjustments_delete_authenticated" on public.factory_transaction_adjustments;

create policy "factory_transaction_adjustments_select_authenticated"
  on public.factory_transaction_adjustments for select to authenticated using (true);
create policy "factory_transaction_adjustments_insert_authenticated"
  on public.factory_transaction_adjustments for insert to authenticated with check (true);
create policy "factory_transaction_adjustments_update_authenticated"
  on public.factory_transaction_adjustments for update to authenticated using (true) with check (true);
create policy "factory_transaction_adjustments_delete_authenticated"
  on public.factory_transaction_adjustments for delete to authenticated using (true);

grant select, insert, update, delete on table public.factory_transactions to authenticated;
grant select, insert, update, delete on table public.factory_transaction_items to authenticated;
grant select, insert, update, delete on table public.factory_transaction_adjustments to authenticated;
notify pgrst, 'reload schema';
