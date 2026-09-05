-- CMJGo app users directory (for admin search/list)
-- Run in Supabase SQL Editor after auth is set up.

create table if not exists public.app_users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '',
  branch text,
  role text not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_users_email_not_blank check (char_length(trim(email)) > 0)
);

create unique index if not exists app_users_email_unique_idx
  on public.app_users (lower(email));

create index if not exists app_users_branch_idx
  on public.app_users (branch);

create or replace function public.handle_app_user_upsert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.app_users (id, email, full_name, branch, role, updated_at)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    nullif(trim(coalesce(new.raw_user_meta_data->>'branch', '')), ''),
    coalesce(new.raw_user_meta_data->>'role', 'user'),
    now()
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    branch = excluded.branch,
    role = excluded.role,
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_app_users on auth.users;
create trigger on_auth_user_created_app_users
  after insert on auth.users
  for each row execute function public.handle_app_user_upsert();

drop trigger if exists on_auth_user_updated_app_users on auth.users;
create trigger on_auth_user_updated_app_users
  after update of email, raw_user_meta_data on auth.users
  for each row execute function public.handle_app_user_upsert();

-- Backfill existing auth users
insert into public.app_users (id, email, full_name, branch, role)
select
  u.id,
  coalesce(u.email, ''),
  coalesce(u.raw_user_meta_data->>'full_name', ''),
  nullif(trim(coalesce(u.raw_user_meta_data->>'branch', '')), ''),
  coalesce(u.raw_user_meta_data->>'role', 'user')
from auth.users u
on conflict (id) do update set
  email = excluded.email,
  full_name = excluded.full_name,
  branch = excluded.branch,
  role = excluded.role,
  updated_at = now();

alter table public.app_users enable row level security;

drop policy if exists "app_users_select_authenticated" on public.app_users;
drop policy if exists "app_users_insert_authenticated" on public.app_users;
drop policy if exists "app_users_update_authenticated" on public.app_users;
drop policy if exists "app_users_delete_authenticated" on public.app_users;

create policy "app_users_select_authenticated"
  on public.app_users for select to authenticated using (true);
create policy "app_users_insert_authenticated"
  on public.app_users for insert to authenticated with check (true);
create policy "app_users_update_authenticated"
  on public.app_users for update to authenticated using (true) with check (true);
create policy "app_users_delete_authenticated"
  on public.app_users for delete to authenticated using (true);

grant select, insert, update, delete on table public.app_users to authenticated;

-- Master-admin helpers for editing/deleting users (keeps auth.users in sync)
create or replace function public.is_master_admin_caller()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = lower('markie.gorit@gmail.com');
$$;

create or replace function public.admin_update_app_user(
  target_id uuid,
  next_full_name text,
  next_branch text,
  next_email text default null
)
returns public.app_users
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  updated_row public.app_users;
  clean_name text := trim(coalesce(next_full_name, ''));
  clean_branch text := nullif(trim(coalesce(next_branch, '')), '');
  clean_email text := lower(trim(coalesce(next_email, '')));
  current_meta jsonb;
begin
  if not public.is_master_admin_caller() then
    raise exception 'Only the master admin can update users.';
  end if;

  if clean_name = '' then
    raise exception 'Full name is required.';
  end if;

  select raw_user_meta_data into current_meta
  from auth.users
  where id = target_id;

  if current_meta is null and not exists (select 1 from auth.users where id = target_id) then
    raise exception 'User not found.';
  end if;

  if coalesce(current_meta->>'role', 'user') = 'master_admin'
     and lower(coalesce((select email from auth.users where id = target_id), '')) = lower('markie.gorit@gmail.com') then
    -- Keep master admin email/role intact; still allow name/branch updates.
    clean_email := lower(coalesce((select email from auth.users where id = target_id), ''));
  elsif clean_email = '' then
    raise exception 'Email is required.';
  end if;

  update auth.users
  set
    email = clean_email,
    raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
      || jsonb_build_object(
        'full_name', clean_name,
        'branch', clean_branch
      ),
    updated_at = now()
  where id = target_id;

  update public.app_users
  set
    email = clean_email,
    full_name = clean_name,
    branch = clean_branch,
    updated_at = now()
  where id = target_id
  returning * into updated_row;

  return updated_row;
end;
$$;

create or replace function public.admin_delete_app_user(target_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_email text;
  target_role text;
begin
  if not public.is_master_admin_caller() then
    raise exception 'Only the master admin can delete users.';
  end if;

  if target_id = auth.uid() then
    raise exception 'You cannot delete your own account.';
  end if;

  select email, coalesce(raw_user_meta_data->>'role', 'user')
  into target_email, target_role
  from auth.users
  where id = target_id;

  if target_email is null then
    delete from public.app_users where id = target_id;
    return true;
  end if;

  if target_role = 'master_admin'
     or lower(target_email) = lower('markie.gorit@gmail.com') then
    raise exception 'The master admin account cannot be deleted.';
  end if;

  delete from auth.users where id = target_id;
  return true;
end;
$$;

grant execute on function public.is_master_admin_caller() to authenticated;
grant execute on function public.admin_update_app_user(uuid, text, text, text) to authenticated;
grant execute on function public.admin_delete_app_user(uuid) to authenticated;

notify pgrst, 'reload schema';

