-- CMJGo Route / Area list (Nabunturan Route Transactions)
-- Run in Supabase SQL Editor after the main app schemas.

create table if not exists public.route_areas (
  id uuid primary key default gen_random_uuid(),
  branch text not null default 'Nabunturan'
    check (branch in ('Nabunturan', 'Davao', 'Maragusan')),
  name text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  constraint route_areas_name_not_blank check (char_length(trim(name)) > 0)
);

create unique index if not exists route_areas_branch_name_unique
  on public.route_areas (branch, lower(name));

create index if not exists route_areas_branch_idx
  on public.route_areas (branch);

alter table public.route_areas enable row level security;

drop policy if exists "route_areas_select_authenticated" on public.route_areas;
drop policy if exists "route_areas_insert_authenticated" on public.route_areas;
drop policy if exists "route_areas_update_authenticated" on public.route_areas;
drop policy if exists "route_areas_delete_authenticated" on public.route_areas;

create policy "route_areas_select_authenticated"
  on public.route_areas for select to authenticated using (true);
create policy "route_areas_insert_authenticated"
  on public.route_areas for insert to authenticated with check (true);
create policy "route_areas_update_authenticated"
  on public.route_areas for update to authenticated using (true) with check (true);
create policy "route_areas_delete_authenticated"
  on public.route_areas for delete to authenticated using (true);

grant select, insert, update, delete on table public.route_areas to authenticated;
notify pgrst, 'reload schema';
