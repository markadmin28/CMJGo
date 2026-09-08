-- Nabunturan collection ledgers
create table if not exists public.mts_collections (
  id uuid primary key default gen_random_uuid(),
  branch text not null check (branch in ('Davao', 'Nabunturan', 'Maragusan')),
  kind text not null default 'mts_collections'
    check (kind in (
      'mts_collections',
      'mts_fund',
      'fulls_return',
      'fulls_return_lacking',
      'pallets_return',
      'pallets_payables',
      'cash_payment',
      'cash_payment_for_short',
      'cheque_payment',
      'account_route',
      'other_collection'
    )),
  collection_date date not null,
  from_name text not null default '',
  payment_pc text not null default '',
  payment_smc text not null default '',
  payment_mag text not null default '',
  plate_no text not null default '',
  cash_amount numeric(14, 2) not null default 0,
  total_amount numeric(14, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

alter table public.mts_collections
  add column if not exists kind text;

alter table public.mts_collections
  add column if not exists payment_pc text;

alter table public.mts_collections
  add column if not exists payment_smc text;

alter table public.mts_collections
  add column if not exists payment_mag text;

alter table public.mts_collections
  add column if not exists plate_no text;

alter table public.mts_collections
  add column if not exists cash_amount numeric(14, 2);

update public.mts_collections
set kind = 'mts_collections'
where kind is null or kind = '';

update public.mts_collections set payment_pc = '' where payment_pc is null;
update public.mts_collections set payment_smc = '' where payment_smc is null;
update public.mts_collections set payment_mag = '' where payment_mag is null;
update public.mts_collections set plate_no = '' where plate_no is null;
update public.mts_collections set cash_amount = 0 where cash_amount is null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'mts_collections_kind_check'
  ) then
    alter table public.mts_collections
      drop constraint mts_collections_kind_check;
  end if;
  alter table public.mts_collections
    add constraint mts_collections_kind_check
    check (kind in (
      'mts_collections',
      'mts_fund',
      'fulls_return',
      'fulls_return_lacking',
      'pallets_return',
      'pallets_payables',
      'cash_payment',
      'cash_payment_for_short',
      'cheque_payment',
      'account_route',
      'other_collection'
    ));
end $$;

alter table public.mts_collections
  alter column kind set default 'mts_collections';

alter table public.mts_collections
  alter column kind set not null;

alter table public.mts_collections
  alter column payment_pc set default '';

alter table public.mts_collections
  alter column payment_smc set default '';

alter table public.mts_collections
  alter column payment_mag set default '';

alter table public.mts_collections
  alter column payment_pc set not null;

alter table public.mts_collections
  alter column payment_smc set not null;

alter table public.mts_collections
  alter column payment_mag set not null;

alter table public.mts_collections
  alter column plate_no set default '';

alter table public.mts_collections
  alter column cash_amount set default 0;

alter table public.mts_collections
  alter column plate_no set not null;

alter table public.mts_collections
  alter column cash_amount set not null;

create index if not exists mts_collections_branch_date_idx
  on public.mts_collections (branch, collection_date desc);

create index if not exists mts_collections_branch_kind_date_idx
  on public.mts_collections (branch, kind, collection_date desc);

create table if not exists public.mts_collection_items (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.mts_collections (id) on delete cascade,
  qty numeric(14, 3) not null default 0,
  unit text not null default '',
  description text not null default '',
  price numeric(14, 2) not null default 0,
  total_amount numeric(14, 2) not null default 0,
  lacking numeric(14, 3) not null default 0,
  remarks text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.mts_collection_items
  add column if not exists lacking numeric(14, 3);

alter table public.mts_collection_items
  add column if not exists remarks text;

update public.mts_collection_items
set lacking = 0
where lacking is null;

update public.mts_collection_items
set remarks = ''
where remarks is null;

alter table public.mts_collection_items
  alter column lacking set default 0;

alter table public.mts_collection_items
  alter column remarks set default '';

alter table public.mts_collection_items
  alter column lacking set not null;

alter table public.mts_collection_items
  alter column remarks set not null;

create index if not exists mts_collection_items_collection_idx
  on public.mts_collection_items (collection_id, sort_order);

alter table public.mts_collections enable row level security;
alter table public.mts_collection_items enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'mts_collections' and policyname = 'mts_collections_auth_all'
  ) then
    create policy mts_collections_auth_all on public.mts_collections
      for all to authenticated using (true) with check (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'mts_collection_items' and policyname = 'mts_collection_items_auth_all'
  ) then
    create policy mts_collection_items_auth_all on public.mts_collection_items
      for all to authenticated using (true) with check (true);
  end if;
end $$;
