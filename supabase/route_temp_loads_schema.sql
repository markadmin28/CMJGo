-- CMJGo Route temporary loads (First / Second / RFG)
-- Temporary only — do NOT post these into inventory or Nabunturan stock calculations.
-- Routine resets every calendar day (one draft per route + kind + load_date).
-- Run after route_areas_schema.sql.

create table if not exists public.route_temp_loads (
  id uuid primary key default gen_random_uuid(),
  branch text not null default 'Nabunturan'
    check (branch in ('Nabunturan', 'Davao', 'Maragusan')),
  load_kind text not null check (load_kind in ('first_load', 'second_load', 'rfg')),
  route_area_id uuid references public.route_areas (id) on delete set null,
  route_area_name text not null,
  plate_no text not null default '',
  driver text not null default '',
  helper text not null default '',
  ahente text not null default '',
  load_at_text text not null default '',
  load_at timestamptz not null default now(),
  load_date date not null default (timezone('Asia/Manila', now()))::date,
  -- Always temporary until a later Summary/finalize step posts to inventory.
  is_temporary boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  constraint route_temp_loads_route_name_not_blank check (char_length(trim(route_area_name)) > 0)
);

-- Safe re-run: daily key
alter table public.route_temp_loads
  add column if not exists load_date date;

update public.route_temp_loads
set load_date = coalesce(load_date, (timezone('Asia/Manila', coalesce(load_at, created_at, now())))::date)
where load_date is null;

alter table public.route_temp_loads
  alter column load_date set default (timezone('Asia/Manila', now()))::date;

alter table public.route_temp_loads
  alter column load_date set not null;

-- Replace forever-unique draft with per-day unique draft.
drop index if exists public.route_temp_loads_branch_route_kind_unique;
create unique index if not exists route_temp_loads_branch_route_kind_date_unique
  on public.route_temp_loads (
    branch,
    coalesce(route_area_id, '00000000-0000-0000-0000-000000000000'::uuid),
    load_kind,
    load_date
  );

create index if not exists route_temp_loads_branch_kind_idx
  on public.route_temp_loads (branch, load_kind);

create index if not exists route_temp_loads_branch_route_idx
  on public.route_temp_loads (branch, route_area_id);

create index if not exists route_temp_loads_branch_date_idx
  on public.route_temp_loads (branch, load_date desc);

create table if not exists public.route_temp_load_items (
  id uuid primary key default gen_random_uuid(),
  load_id uuid not null references public.route_temp_loads (id) on delete cascade,
  company text not null check (company in ('Pepsi', 'SMC', 'Magnolia')),
  product_id uuid references public.products (id) on delete set null,
  product_name text not null,
  brand_id uuid references public.subcategories (id) on delete set null,
  brand_name text not null default '',
  quantity numeric(12, 3) not null check (quantity >= 0),
  created_at timestamptz not null default now()
);

create index if not exists route_temp_load_items_load_id_idx
  on public.route_temp_load_items (load_id);

alter table public.route_temp_loads enable row level security;
alter table public.route_temp_load_items enable row level security;

drop policy if exists "route_temp_loads_select_authenticated" on public.route_temp_loads;
drop policy if exists "route_temp_loads_insert_authenticated" on public.route_temp_loads;
drop policy if exists "route_temp_loads_update_authenticated" on public.route_temp_loads;
drop policy if exists "route_temp_loads_delete_authenticated" on public.route_temp_loads;
drop policy if exists "route_temp_load_items_select_authenticated" on public.route_temp_load_items;
drop policy if exists "route_temp_load_items_insert_authenticated" on public.route_temp_load_items;
drop policy if exists "route_temp_load_items_update_authenticated" on public.route_temp_load_items;
drop policy if exists "route_temp_load_items_delete_authenticated" on public.route_temp_load_items;

create policy "route_temp_loads_select_authenticated"
  on public.route_temp_loads for select to authenticated using (true);
create policy "route_temp_loads_insert_authenticated"
  on public.route_temp_loads for insert to authenticated with check (true);
create policy "route_temp_loads_update_authenticated"
  on public.route_temp_loads for update to authenticated using (true) with check (true);
create policy "route_temp_loads_delete_authenticated"
  on public.route_temp_loads for delete to authenticated using (true);

create policy "route_temp_load_items_select_authenticated"
  on public.route_temp_load_items for select to authenticated using (true);
create policy "route_temp_load_items_insert_authenticated"
  on public.route_temp_load_items for insert to authenticated with check (true);
create policy "route_temp_load_items_update_authenticated"
  on public.route_temp_load_items for update to authenticated using (true) with check (true);
create policy "route_temp_load_items_delete_authenticated"
  on public.route_temp_load_items for delete to authenticated using (true);

grant select, insert, update, delete on table public.route_temp_loads to authenticated;
grant select, insert, update, delete on table public.route_temp_load_items to authenticated;
notify pgrst, 'reload schema';
