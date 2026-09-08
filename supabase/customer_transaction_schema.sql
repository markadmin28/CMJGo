-- CMJGo Customer Transactions (Nabunturan / Davao series are separate)
-- Sales number is 1, 2, 3… and resets every month per branch + company.
-- Requires catalog + customer_discount_groups.

create table if not exists public.customer_tx_sales_series (
  branch text not null check (branch in ('Davao', 'Nabunturan', 'Maragusan')),
  company text not null check (company in ('Pepsi', 'SMC', 'Magnolia')),
  year_month text not null check (year_month ~ '^\d{4}-\d{2}$'),
  last_number integer not null default 0 check (last_number >= 0),
  updated_at timestamptz not null default now(),
  primary key (branch, company, year_month)
);

create table if not exists public.customer_transactions (
  id uuid primary key default gen_random_uuid(),
  branch text not null check (branch in ('Davao', 'Nabunturan', 'Maragusan')),
  company text not null check (company in ('Pepsi', 'SMC', 'Magnolia')),
  sales_no text not null,
  sales_seq integer not null check (sales_seq >= 0),
  year_month text not null,
  customer_id uuid references public.customer_discount_groups (id) on delete set null,
  customer_name text not null default '',
  invoice_no text not null default '',
  truck_no text not null default '',
  plate_no text not null default 'N/A',
  orders_total numeric(14, 2) not null default 0,
  empties_total numeric(14, 2) not null default 0,
  payables_total numeric(14, 2) not null default 0,
  payment_amount numeric(14, 2),
  cash_cheque_no text not null default '',
  transaction_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  constraint customer_transactions_branch_company_sales_unique unique (branch, company, sales_no)
);

create index if not exists customer_transactions_branch_company_month_idx
  on public.customer_transactions (branch, company, year_month desc);

create table if not exists public.customer_transaction_items (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.customer_transactions (id) on delete cascade,
  section text not null check (section in ('fulls', 'empties')),
  product_id uuid references public.products (id) on delete set null,
  product_name text not null,
  brand_id uuid references public.subcategories (id) on delete set null,
  brand_name text not null default '',
  quantity numeric(12, 3) not null check (quantity >= 0),
  unit text not null default '',
  price numeric(12, 2) not null default 0,
  discount numeric(12, 2) not null default 0,
  line_total numeric(12, 2) not null default 0,
  line_amount numeric(14, 2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists customer_transaction_items_tx_id_idx
  on public.customer_transaction_items (transaction_id);

-- Payment / totals columns (safe to re-run)
alter table public.customer_transactions
  add column if not exists orders_total numeric(14, 2) not null default 0,
  add column if not exists empties_total numeric(14, 2) not null default 0,
  add column if not exists payables_total numeric(14, 2) not null default 0,
  add column if not exists payment_amount numeric(14, 2),
  add column if not exists cash_cheque_no text not null default '';

alter table public.customer_transaction_items
  add column if not exists unit text not null default '',
  add column if not exists price numeric(12, 2) not null default 0,
  add column if not exists discount numeric(12, 2) not null default 0,
  add column if not exists line_total numeric(12, 2) not null default 0,
  add column if not exists line_amount numeric(14, 2) not null default 0;

alter table public.customer_tx_sales_series enable row level security;
alter table public.customer_transactions enable row level security;
alter table public.customer_transaction_items enable row level security;

drop policy if exists "customer_tx_sales_series_all_authenticated" on public.customer_tx_sales_series;
create policy "customer_tx_sales_series_all_authenticated"
  on public.customer_tx_sales_series for all to authenticated using (true) with check (true);

drop policy if exists "customer_transactions_all_authenticated" on public.customer_transactions;
create policy "customer_transactions_all_authenticated"
  on public.customer_transactions for all to authenticated using (true) with check (true);

drop policy if exists "customer_transaction_items_all_authenticated" on public.customer_transaction_items;
create policy "customer_transaction_items_all_authenticated"
  on public.customer_transaction_items for all to authenticated using (true) with check (true);

grant select, insert, update, delete on table public.customer_tx_sales_series to authenticated;
grant select, insert, update, delete on table public.customer_transactions to authenticated;
grant select, insert, update, delete on table public.customer_transaction_items to authenticated;
notify pgrst, 'reload schema';
