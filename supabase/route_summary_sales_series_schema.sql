-- Prefer route_summary_schema.sql (includes this series table + summaries).
-- Kept for re-runs that only need the monthly sales counters.

create table if not exists public.route_summary_sales_series (
  branch text not null check (branch in ('Davao', 'Nabunturan', 'Maragusan')),
  company text not null check (company in ('Pepsi', 'SMC', 'Magnolia')),
  year_month text not null check (year_month ~ '^\d{4}-\d{2}$'),
  last_number integer not null default 0 check (last_number >= 0),
  updated_at timestamptz not null default now(),
  primary key (branch, company, year_month)
);

alter table public.route_summary_sales_series enable row level security;

drop policy if exists "route_summary_sales_series_all_authenticated" on public.route_summary_sales_series;
create policy "route_summary_sales_series_all_authenticated"
  on public.route_summary_sales_series for all to authenticated using (true) with check (true);

grant select, insert, update, delete on table public.route_summary_sales_series to authenticated;
