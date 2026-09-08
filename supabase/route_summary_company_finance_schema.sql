-- Safe re-run: per-company finance for Route Summary
-- Run if you already applied an older route_summary_schema.sql

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

alter table public.route_summary_company_finance enable row level security;

drop policy if exists "route_summary_company_finance_all_authenticated" on public.route_summary_company_finance;
create policy "route_summary_company_finance_all_authenticated"
  on public.route_summary_company_finance for all to authenticated using (true) with check (true);

grant select, insert, update, delete on table public.route_summary_company_finance to authenticated;
