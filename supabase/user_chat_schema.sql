-- CMJGo direct (1:1) user chat + reactions + attachments
-- Run in Supabase SQL Editor (safe to re-run).

create table if not exists public.user_chat_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users (id) on delete cascade,
  recipient_id uuid not null references auth.users (id) on delete cascade,
  body text not null default '',
  sender_name text not null default '',
  attachment_path text,
  attachment_name text,
  attachment_mime text,
  attachment_size bigint,
  created_at timestamptz not null default now(),
  constraint user_chat_not_self check (sender_id <> recipient_id)
);

alter table public.user_chat_messages
  add column if not exists attachment_path text,
  add column if not exists attachment_name text,
  add column if not exists attachment_mime text,
  add column if not exists attachment_size bigint;

alter table public.user_chat_messages drop constraint if exists user_chat_body_not_blank;
alter table public.user_chat_messages drop constraint if exists user_chat_has_content;

alter table public.user_chat_messages
  add constraint user_chat_has_content check (
    char_length(trim(coalesce(body, ''))) > 0
    or attachment_path is not null
  );

create index if not exists user_chat_messages_pair_created_idx
  on public.user_chat_messages (sender_id, recipient_id, created_at desc);

create index if not exists user_chat_messages_recipient_created_idx
  on public.user_chat_messages (recipient_id, created_at desc);

alter table public.user_chat_messages enable row level security;

drop policy if exists "user_chat_messages_select_participants" on public.user_chat_messages;
drop policy if exists "user_chat_messages_insert_own" on public.user_chat_messages;
drop policy if exists "user_chat_messages_delete_own" on public.user_chat_messages;

create policy "user_chat_messages_select_participants"
  on public.user_chat_messages for select to authenticated
  using (auth.uid() = sender_id or auth.uid() = recipient_id);

create policy "user_chat_messages_insert_own"
  on public.user_chat_messages for insert to authenticated
  with check (auth.uid() = sender_id);

create policy "user_chat_messages_delete_own"
  on public.user_chat_messages for delete to authenticated
  using (auth.uid() = sender_id);

grant select, insert, delete on table public.user_chat_messages to authenticated;

alter table public.user_chat_messages replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.user_chat_messages;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

-- Facebook-style reactions (one reaction per user per message)
create table if not exists public.user_chat_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.user_chat_messages (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  constraint user_chat_reaction_emoji_allowed check (
    emoji in ('👍', '❤️', '😆', '😮', '😢', '😡')
  ),
  constraint user_chat_reaction_unique unique (message_id, user_id)
);

create index if not exists user_chat_reactions_message_idx
  on public.user_chat_reactions (message_id);

alter table public.user_chat_reactions enable row level security;

drop policy if exists "user_chat_reactions_select_participants" on public.user_chat_reactions;
drop policy if exists "user_chat_reactions_insert_own" on public.user_chat_reactions;
drop policy if exists "user_chat_reactions_update_own" on public.user_chat_reactions;
drop policy if exists "user_chat_reactions_delete_own" on public.user_chat_reactions;

create policy "user_chat_reactions_select_participants"
  on public.user_chat_reactions for select to authenticated
  using (
    exists (
      select 1
      from public.user_chat_messages m
      where m.id = message_id
        and (m.sender_id = auth.uid() or m.recipient_id = auth.uid())
    )
  );

create policy "user_chat_reactions_insert_own"
  on public.user_chat_reactions for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.user_chat_messages m
      where m.id = message_id
        and (m.sender_id = auth.uid() or m.recipient_id = auth.uid())
    )
  );

create policy "user_chat_reactions_update_own"
  on public.user_chat_reactions for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "user_chat_reactions_delete_own"
  on public.user_chat_reactions for delete to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on table public.user_chat_reactions to authenticated;

alter table public.user_chat_reactions replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.user_chat_reactions;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

-- Private storage for chat files / images / videos
insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-attachments', 'chat-attachments', false, 52428800)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "chat_attachments_select_auth" on storage.objects;
drop policy if exists "chat_attachments_insert_own" on storage.objects;
drop policy if exists "chat_attachments_update_own" on storage.objects;
drop policy if exists "chat_attachments_delete_own" on storage.objects;

create policy "chat_attachments_select_auth"
  on storage.objects for select to authenticated
  using (bucket_id = 'chat-attachments');

create policy "chat_attachments_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "chat_attachments_update_own"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'chat-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "chat_attachments_delete_own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'chat-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Chat profile pictures on app_users
alter table public.app_users
  add column if not exists avatar_path text;

insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-avatars', 'chat-avatars', true, 5242880)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "chat_avatars_select_auth" on storage.objects;
drop policy if exists "chat_avatars_insert_own" on storage.objects;
drop policy if exists "chat_avatars_update_own" on storage.objects;
drop policy if exists "chat_avatars_delete_own" on storage.objects;

create policy "chat_avatars_select_auth"
  on storage.objects for select to authenticated
  using (bucket_id = 'chat-avatars');

create policy "chat_avatars_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "chat_avatars_update_own"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'chat-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "chat_avatars_delete_own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'chat-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

notify pgrst, 'reload schema';
