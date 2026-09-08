-- Discount breakdown transactions (route plate + customers with discount lines)
create table if not exists public.discount_breakdowns (
  id uuid primary key default gen_random_uuid(),
  branch text not null check (branch in ('Davao', 'Nabunturan', 'Maragusan')),
  transaction_date date not null,
  plate_no text not null default '',
  status text not null default 'open' check (status in ('open', 'closed')),
  total_amount numeric(14, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

create index if not exists discount_breakdowns_branch_date_idx
  on public.discount_breakdowns (branch, transaction_date desc);

create table if not exists public.discount_breakdown_customers (
  id uuid primary key default gen_random_uuid(),
  breakdown_id uuid not null references public.discount_breakdowns (id) on delete cascade,
  cus_code text not null default '',
  customer_name text not null default '',
  total_amount numeric(14, 2) not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists discount_breakdown_customers_breakdown_idx
  on public.discount_breakdown_customers (breakdown_id, sort_order);

create table if not exists public.discount_breakdown_items (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.discount_breakdown_customers (id) on delete cascade,
  qty numeric(14, 3) not null default 0,
  unit text not null default '',
  discount numeric(14, 2) not null default 0,
  total_amount numeric(14, 2) not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists discount_breakdown_items_customer_idx
  on public.discount_breakdown_items (customer_id, sort_order);

alter table public.discount_breakdowns enable row level security;
alter table public.discount_breakdown_customers enable row level security;
alter table public.discount_breakdown_items enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'discount_breakdowns' and policyname = 'discount_breakdowns_auth_all'
  ) then
    create policy discount_breakdowns_auth_all on public.discount_breakdowns
      for all to authenticated using (true) with check (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'discount_breakdown_customers' and policyname = 'discount_breakdown_customers_auth_all'
  ) then
    create policy discount_breakdown_customers_auth_all on public.discount_breakdown_customers
      for all to authenticated using (true) with check (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'discount_breakdown_items' and policyname = 'discount_breakdown_items_auth_all'
  ) then
    create policy discount_breakdown_items_auth_all on public.discount_breakdown_items
      for all to authenticated using (true) with check (true);
  end if;
end $$;
