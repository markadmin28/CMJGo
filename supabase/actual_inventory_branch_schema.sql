-- Branch-scope Actual Inventory (Davao / Nabunturan / Maragusan stay separate).
-- Safe re-run. Existing rows without branch become Davao.

alter table public.actual_inventories
  add column if not exists branch text;

update public.actual_inventories
set branch = 'Davao'
where branch is null or trim(branch) = '';

alter table public.actual_inventories
  alter column branch set default 'Davao';

alter table public.actual_inventories
  alter column branch set not null;

alter table public.actual_inventories
  drop constraint if exists actual_inventories_branch_check;

alter table public.actual_inventories
  add constraint actual_inventories_branch_check
  check (branch in ('Davao', 'Nabunturan', 'Maragusan'));

alter table public.actual_inventories
  drop constraint if exists actual_inventories_category_month_unique;

drop index if exists public.actual_inventories_category_month_unique;

create unique index if not exists actual_inventories_branch_category_month_unique
  on public.actual_inventories (branch, category, as_of_month);

create index if not exists actual_inventories_branch_month_idx
  on public.actual_inventories (branch, as_of_month desc);

notify pgrst, 'reload schema';
