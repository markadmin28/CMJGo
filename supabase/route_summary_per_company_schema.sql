-- Split Route Summary into separate Pepsi / SMC / Magnolia records
-- for the same route/area + day. Run if you already applied an older
-- route_summary_schema.sql (unique was branch+route+date only).

alter table public.route_summaries
  add column if not exists company text;

update public.route_summaries
set company = case
  when coalesce(sales_no_smc, '') <> '' and coalesce(sales_no_pepsi, '') = '' and coalesce(sales_no_magnolia, '') = '' then 'SMC'
  when coalesce(sales_no_magnolia, '') <> '' and coalesce(sales_no_pepsi, '') = '' and coalesce(sales_no_smc, '') = '' then 'Magnolia'
  else 'Pepsi'
end
where company is null or trim(company) = '';

alter table public.route_summaries
  alter column company set default 'Pepsi';

alter table public.route_summaries
  alter column company set not null;

alter table public.route_summaries
  drop constraint if exists route_summaries_company_check;

alter table public.route_summaries
  add constraint route_summaries_company_check
  check (company in ('Pepsi', 'SMC', 'Magnolia'));

drop index if exists public.route_summaries_branch_route_date_unique;

create unique index if not exists route_summaries_branch_route_date_company_unique
  on public.route_summaries (
    branch,
    coalesce(route_area_id, '00000000-0000-0000-0000-000000000000'::uuid),
    summary_date,
    company
  );
