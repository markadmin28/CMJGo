-- CMJGo Route Summary (Nabunturan sales finalize)
-- Sales qty (1st+2nd−RFG) is stored and merged into Nabunturan inventory /
-- printables as Out (same pattern as Customer Transaction).
-- Sales numbers: monthly series per Pepsi / SMC / Magnolia (see sales series table).
-- Run after route_areas + route_temp_loads + route_summary_sales_series.

create table if not exists public.route_summary_sales_series (
  branch text not null check (branch in ('Davao', 'Nabunturan', 'Maragusan')),
  company text not null check (company in ('Pepsi', 'SMC', 'Magnolia')),
  year_month text not null check (year_month ~ '^\d{4}-\d{2}$'),
  last_number integer not null default 0 check (last_number >= 0),
  updated_at timestamptz not null default now(),
  primary key (branch, company, year_month)
);

create table if not exists public.route_summaries (
  id uuid primary key default gen_random_uuid(),
  branch text not null default 'Nabunturan'
    check (branch in ('Nabunturan')),
  -- One saved record per route/area + day + company (Pepsi / SMC / Magnolia).
  company text not null default 'Pepsi'
    check (company in ('Pepsi', 'SMC', 'Magnolia')),
  route_area_id uuid references public.route_areas (id) on delete set null,
  route_area_name text not null,
  plate_no text not null default '',
  driver text not null default '',
  helper text not null default '',
  ahente text not null default '',
  date_posted_text text not null default '',
  summary_date date not null default (timezone('Asia/Manila', now()))::date,
  year_month text not null,
  sales_no_pepsi text not null default '',
  sales_seq_pepsi integer not null default 0,
  sales_no_smc text not null default '',
  sales_seq_smc integer not null default 0,
  sales_no_magnolia text not null default '',
  sales_seq_magnolia integer not null default 0,
  total_sales numeric(14, 2) not null default 0,
  ref_empties numeric(14, 2) not null default 0,
  discount numeric(14, 2) not null default 0,
  expenses numeric(14, 2) not null default 0,
  promo numeric(14, 2) not null default 0,
  account numeric(14, 2) not null default 0,
  sub_total numeric(14, 2) not null default 0,
  cash_remittance numeric(14, 2) not null default 0,
  short_over numeric(14, 2) not null default 0,
  loading_salesman text not null default '',
  loading_checker text not null default '',
  loading_testify text not null default '',
  unloading_salesman text not null default '',
  unloading_checker text not null default '',
  unloading_testify text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  constraint route_summaries_route_name_not_blank check (char_length(trim(route_area_name)) > 0)
);

-- Legacy unique (one row per route/day) — dropped in favor of per-company rows.
drop index if exists public.route_summaries_branch_route_date_unique;

create unique index if not exists route_summaries_branch_route_date_company_unique
  on public.route_summaries (
    branch,
    coalesce(route_area_id, '00000000-0000-0000-0000-000000000000'::uuid),
    summary_date,
    company
  );

create index if not exists route_summaries_branch_date_idx
  on public.route_summaries (branch, summary_date desc);

-- Per-company finance (Total sales, Ref empties, Discount, … Short/over)
create table if not exists public.route_summary_company_finance (
  summary_id uuid not null references public.route_summaries (id) on delete cascade,
  company text not null check (company in ('Pepsi', 'SMC', 'Magnolia')),
  total_sales numeric(14, 2) not null default 0,
  ref_empties numeric(14, 2) not null default 0,
  discount numeric(14, 2) not null default 0,
  expenses numeric(14, 2) not null default 0,
  promo numeric(14, 2) not null default 0,
  account numeric(14, 2) not null default 0,
  sub_total numeric(14, 2) not null default 0,
  cash_remittance numeric(14, 2) not null default 0,
  short_over numeric(14, 2) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (summary_id, company)
);

create index if not exists route_summary_company_finance_summary_idx
  on public.route_summary_company_finance (summary_id);

create table if not exists public.route_summary_items (
  id uuid primary key default gen_random_uuid(),
  summary_id uuid not null references public.route_summaries (id) on delete cascade,
  section text not null check (section in ('fulls', 'empties')),
  company text not null default ''
    check (company in ('', 'Pepsi', 'SMC', 'Magnolia')),
  product_id uuid references public.products (id) on delete set null,
  product_name text not null,
  brand_id uuid references public.subcategories (id) on delete set null,
  brand_name text not null default '',
  first_load numeric(12, 3) not null default 0,
  second_load numeric(12, 3) not null default 0,
  rfg numeric(12, 3) not null default 0,
  quantity numeric(12, 3) not null check (quantity >= 0),
  price numeric(12, 2) not null default 0,
  amount numeric(14, 2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists route_summary_items_summary_id_idx
  on public.route_summary_items (summary_id);

create index if not exists route_summary_items_section_company_idx
  on public.route_summary_items (section, company);

alter table public.route_summary_sales_series enable row level security;
alter table public.route_summaries enable row level security;
alter table public.route_summary_company_finance enable row level security;
alter table public.route_summary_items enable row level security;

drop policy if exists "route_summary_sales_series_all_authenticated" on public.route_summary_sales_series;
create policy "route_summary_sales_series_all_authenticated"
  on public.route_summary_sales_series for all to authenticated using (true) with check (true);

drop policy if exists "route_summaries_all_authenticated" on public.route_summaries;
create policy "route_summaries_all_authenticated"
  on public.route_summaries for all to authenticated using (true) with check (true);

drop policy if exists "route_summary_company_finance_all_authenticated" on public.route_summary_company_finance;
create policy "route_summary_company_finance_all_authenticated"
  on public.route_summary_company_finance for all to authenticated using (true) with check (true);

drop policy if exists "route_summary_items_all_authenticated" on public.route_summary_items;
create policy "route_summary_items_all_authenticated"
  on public.route_summary_items for all to authenticated using (true) with check (true);

grant select, insert, update, delete on table public.route_summary_sales_series to authenticated;
grant select, insert, update, delete on table public.route_summaries to authenticated;
grant select, insert, update, delete on table public.route_summary_company_finance to authenticated;
grant select, insert, update, delete on table public.route_summary_items to authenticated;
