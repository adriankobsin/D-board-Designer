-- DBoard Designer: project sharing, private and group chats, notifications.
-- Run once in the Supabase SQL editor (or `supabase db push`). Safe to run more than once.
-- Row Level Security is on for every table. The browser can read and post messages, accept invitations and
-- mark notifications read. Creating chats, inviting people and sharing projects goes through the Cloudflare Worker
-- (service role), because those actions look up other users by email address.

-- ---------------------------------------------------------------------------
-- Display names for people you share a chat or project with (profiles stay private otherwise)
-- ---------------------------------------------------------------------------
create or replace function public.person_label(uid uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), split_part(p.email, '@', 1), 'Member')
  from public.profiles p where p.id = uid;
$$;

-- ---------------------------------------------------------------------------
-- Project shares (read access plus "save a copy"; the owner keeps sole edit rights)
-- ---------------------------------------------------------------------------
create table if not exists public.project_shares (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  owner_id      uuid not null references auth.users (id) on delete cascade,
  recipient_id  uuid not null references auth.users (id) on delete cascade,
  project_name  text not null default '' check (char_length(project_name) <= 200),
  note          text check (note is null or char_length(note) <= 500),
  created_at    timestamptz not null default now(),
  seen_at       timestamptz,
  unique (project_id, recipient_id),
  check (owner_id <> recipient_id)
);
create index if not exists project_shares_recipient_idx on public.project_shares (recipient_id, created_at desc);
create index if not exists project_shares_owner_idx on public.project_shares (owner_id, created_at desc);
alter table public.project_shares enable row level security;
revoke all on public.project_shares from anon, authenticated;
grant select, delete on public.project_shares to authenticated;
grant update (seen_at) on public.project_shares to authenticated;
drop policy if exists shares_select on public.project_shares;
create policy shares_select on public.project_shares for select to authenticated
  using (owner_id = auth.uid() or recipient_id = auth.uid());
drop policy if exists shares_update_recipient on public.project_shares;
create policy shares_update_recipient on public.project_shares for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
drop policy if exists shares_delete on public.project_shares;
create policy shares_delete on public.project_shares for delete to authenticated
  using (owner_id = auth.uid() or recipient_id = auth.uid());

-- A recipient may read (never change) a project that was shared with them.
create or replace function public.is_shared_with_me(pid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.project_shares s where s.project_id = pid and s.recipient_id = auth.uid());
$$;
drop policy if exists projects_select_shared on public.projects;
create policy projects_select_shared on public.projects for select to authenticated
  using (public.is_shared_with_me(id) and public.is_active());

-- ---------------------------------------------------------------------------
-- Chats: private (two people) and group
-- ---------------------------------------------------------------------------
create table if not exists public.chats (
  id               uuid primary key default gen_random_uuid(),
  kind             text not null check (kind in ('direct', 'group')),
  title            text check (title is null or char_length(title) between 1 and 100),
  direct_key       text unique,
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  last_message_at  timestamptz not null default now()
);
create table if not exists public.chat_members (
  chat_id       uuid not null references public.chats (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  role          text not null default 'member' check (role in ('owner', 'member')),
  status        text not null default 'joined' check (status in ('invited', 'joined')),
  invited_by    uuid references auth.users (id) on delete set null,
  invited_at    timestamptz not null default now(),
  joined_at     timestamptz,
  last_read_at  timestamptz not null default now(),
  primary key (chat_id, user_id)
);
create index if not exists chat_members_user_idx on public.chat_members (user_id, status);
create table if not exists public.chat_messages (
  id          bigint generated always as identity primary key,
  chat_id     uuid not null references public.chats (id) on delete cascade,
  sender_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body        text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at  timestamptz not null default now()
);
create index if not exists chat_messages_chat_idx on public.chat_messages (chat_id, id desc);

create or replace function public.is_chat_member(cid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.chat_members m where m.chat_id = cid and m.user_id = auth.uid() and m.status = 'joined');
$$;
create or replace function public.is_chat_participant(cid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.chat_members m where m.chat_id = cid and m.user_id = auth.uid());
$$;
create or replace function public.is_chat_owner(cid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.chat_members m where m.chat_id = cid and m.user_id = auth.uid() and m.status = 'joined' and m.role = 'owner');
$$;

alter table public.chats enable row level security;
alter table public.chat_members enable row level security;
alter table public.chat_messages enable row level security;
revoke all on public.chats, public.chat_members, public.chat_messages from anon, authenticated;
grant select on public.chats to authenticated;
grant update (title) on public.chats to authenticated;
grant select, delete on public.chat_members to authenticated;
grant update (status, last_read_at) on public.chat_members to authenticated;
grant select, insert, delete on public.chat_messages to authenticated;

drop policy if exists chats_select on public.chats;
create policy chats_select on public.chats for select to authenticated using (public.is_chat_participant(id));
drop policy if exists chats_rename on public.chats;
create policy chats_rename on public.chats for update to authenticated
  using (kind = 'group' and public.is_chat_owner(id)) with check (kind = 'group' and public.is_chat_owner(id));

drop policy if exists members_select on public.chat_members;
create policy members_select on public.chat_members for select to authenticated
  using (user_id = auth.uid() or public.is_chat_member(chat_id));
-- Accept an invitation (invited -> joined) or move the read marker. Nothing else can be changed.
drop policy if exists members_update_self on public.chat_members;
create policy members_update_self on public.chat_members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and status = 'joined');
-- Leave or decline; the owner of a group can remove others.
drop policy if exists members_delete on public.chat_members;
create policy members_delete on public.chat_members for delete to authenticated
  using (user_id = auth.uid() or (public.is_chat_owner(chat_id) and exists (select 1 from public.chats c where c.id = chat_id and c.kind = 'group')));

drop policy if exists messages_select on public.chat_messages;
create policy messages_select on public.chat_messages for select to authenticated using (public.is_chat_member(chat_id));
drop policy if exists messages_insert on public.chat_messages;
create policy messages_insert on public.chat_messages for insert to authenticated
  with check (sender_id = auth.uid() and public.is_chat_member(chat_id) and public.is_active());
drop policy if exists messages_delete_own on public.chat_messages;
create policy messages_delete_own on public.chat_messages for delete to authenticated using (sender_id = auth.uid());

-- Stamp joined_at and the read marker when an invitation is accepted.
create or replace function public.chat_members_on_update()
returns trigger language plpgsql as $$
begin
  if old.status = 'invited' and new.status = 'joined' then
    new.joined_at := now(); new.last_read_at := now();
  elsif old.status = 'joined' and new.status <> 'joined' then
    new.status := 'joined';
  end if;
  new.user_id := old.user_id; new.chat_id := old.chat_id;
  if current_user in ('anon', 'authenticated') then new.role := old.role; end if;   -- only the ownership hand-over trigger may change a role
  return new;
end $$;
drop trigger if exists chat_members_upd_trg on public.chat_members;
create trigger chat_members_upd_trg before update on public.chat_members for each row execute function public.chat_members_on_update();

-- When people leave: remove an empty chat, and hand ownership to the longest-standing member.
create or replace function public.chat_members_after_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.chat_members where chat_id = old.chat_id and status = 'joined') then
    delete from public.chats where id = old.chat_id;
  elsif old.role = 'owner' and not exists (select 1 from public.chat_members where chat_id = old.chat_id and role = 'owner' and status = 'joined') then
    update public.chat_members set role = 'owner'
    where (chat_id, user_id) = (select chat_id, user_id from public.chat_members where chat_id = old.chat_id and status = 'joined' order by joined_at nulls last, invited_at limit 1);
  end if;
  return null;
end $$;
drop trigger if exists chat_members_del_trg on public.chat_members;
create trigger chat_members_del_trg after delete on public.chat_members for each row execute function public.chat_members_after_delete();

-- At most 30 messages a minute per person.
create or replace function public.chat_messages_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.chat_messages where sender_id = new.sender_id and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'You are sending messages too quickly. Wait a moment.' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists chat_messages_limit_trg on public.chat_messages;
create trigger chat_messages_limit_trg before insert on public.chat_messages for each row execute function public.chat_messages_limit();

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('chat_invite', 'chat_message', 'project_share')),
  ref_id      uuid,
  title       text not null default '' check (char_length(title) <= 200),
  body        text not null default '' check (char_length(body) <= 400),
  count       int not null default 1,
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications (user_id, kind, ref_id) where read_at is null;
alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
drop policy if exists notif_select on public.notifications;
create policy notif_select on public.notifications for select to authenticated using (user_id = auth.uid());
drop policy if exists notif_update on public.notifications;
create policy notif_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists notif_delete on public.notifications;
create policy notif_delete on public.notifications for delete to authenticated using (user_id = auth.uid());

-- Group several replies in one chat into one unread notification.
create or replace function public.chat_messages_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  c record; r record; who text := public.person_label(new.sender_id); snip text := left(regexp_replace(new.body, '\s+', ' ', 'g'), 120);
  ttl text;
begin
  update public.chats set last_message_at = new.created_at where id = new.chat_id;
  select * into c from public.chats where id = new.chat_id;
  ttl := case when c.kind = 'group' then coalesce(c.title, 'Group chat') else who end;
  for r in select user_id from public.chat_members where chat_id = new.chat_id and status = 'joined' and user_id <> new.sender_id loop
    update public.notifications set count = count + 1, body = who || ': ' || snip, created_at = now()
    where user_id = r.user_id and kind = 'chat_message' and ref_id = new.chat_id and read_at is null;
    if not found then
      insert into public.notifications (user_id, kind, ref_id, title, body) values (r.user_id, 'chat_message', new.chat_id, ttl, who || ': ' || snip);
    end if;
  end loop;
  return null;
end $$;
drop trigger if exists chat_messages_ai_trg on public.chat_messages;
create trigger chat_messages_ai_trg after insert on public.chat_messages for each row execute function public.chat_messages_after_insert();

create or replace function public.chat_members_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare c record;
begin
  if new.status = 'invited' then
    select * into c from public.chats where id = new.chat_id;
    insert into public.notifications (user_id, kind, ref_id, title, body)
    values (new.user_id, 'chat_invite', new.chat_id, coalesce(c.title, 'Group chat'), public.person_label(new.invited_by) || ' invited you to join this group chat.');
  end if;
  return null;
end $$;
drop trigger if exists chat_members_ai_trg on public.chat_members;
create trigger chat_members_ai_trg after insert on public.chat_members for each row execute function public.chat_members_after_insert();

create or replace function public.project_shares_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (user_id, kind, ref_id, title, body)
  values (new.recipient_id, 'project_share', new.id, new.project_name, public.person_label(new.owner_id) || ' shared a project with you.');
  return null;
end $$;
drop trigger if exists project_shares_ai_trg on public.project_shares;
create trigger project_shares_ai_trg after insert on public.project_shares for each row execute function public.project_shares_after_insert();

-- ---------------------------------------------------------------------------
-- Read helpers for the browser
-- ---------------------------------------------------------------------------
create or replace function public.my_chats()
returns table (id uuid, kind text, title text, my_status text, my_role text, created_by uuid, last_message_at timestamptz,
               last_body text, last_sender text, unread bigint, members jsonb)
language sql stable security definer set search_path = '' as $$
  select c.id, c.kind, c.title, m.status, m.role, c.created_by, c.last_message_at,
         case when m.status = 'joined' then lm.body end,
         case when m.status = 'joined' then public.person_label(lm.sender_id) end,
         case when m.status = 'joined'
              then (select count(*) from public.chat_messages x where x.chat_id = c.id and x.created_at > m.last_read_at and x.sender_id <> auth.uid())
              else 0 end,
         (select coalesce(jsonb_agg(jsonb_build_object('id', cm.user_id, 'name', public.person_label(cm.user_id), 'status', cm.status, 'role', cm.role)
                                    order by cm.joined_at nulls last, cm.invited_at), '[]'::jsonb)
          from public.chat_members cm where cm.chat_id = c.id)
  from public.chats c
  join public.chat_members m on m.chat_id = c.id and m.user_id = auth.uid()
  left join lateral (select y.body, y.sender_id from public.chat_messages y where y.chat_id = c.id order by y.id desc limit 1) lm on true
  where public.is_active()
  order by c.last_message_at desc;
$$;

create or replace function public.my_shares()
returns table (id uuid, project_id uuid, project_name text, direction text, other_id uuid, other_name text, note text, created_at timestamptz, seen_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.id, s.project_id, s.project_name, 'received', s.owner_id, public.person_label(s.owner_id), s.note, s.created_at, s.seen_at
  from public.project_shares s where s.recipient_id = auth.uid() and public.is_active()
  union all
  select s.id, s.project_id, s.project_name, 'sent', s.recipient_id, public.person_label(s.recipient_id), s.note, s.created_at, s.seen_at
  from public.project_shares s where s.owner_id = auth.uid() and public.is_active()
  order by created_at desc;
$$;

-- The sender's name for a message in a chat you belong to (members who left show as "Former member").
create or replace function public.chat_senders(cid uuid)
returns table (user_id uuid, name text)
language sql stable security definer set search_path = '' as $$
  select distinct m.sender_id, coalesce(public.person_label(m.sender_id), 'Former member')
  from public.chat_messages m where m.chat_id = cid and public.is_chat_member(cid);
$$;

-- Moves your read marker to the server clock, so unread counts do not depend on your device's clock.
create or replace function public.mark_chat_read(cid uuid)
returns void language sql security definer set search_path = '' as $$
  update public.chat_members set last_read_at = now() where chat_id = cid and user_id = auth.uid() and status = 'joined';
$$;

revoke all on function public.person_label(uuid) from public, anon, authenticated;
revoke all on function public.is_shared_with_me(uuid), public.is_chat_member(uuid), public.is_chat_participant(uuid), public.is_chat_owner(uuid) from public, anon;
grant execute on function public.is_shared_with_me(uuid), public.is_chat_member(uuid), public.is_chat_participant(uuid), public.is_chat_owner(uuid) to authenticated;
revoke all on function public.my_chats(), public.my_shares(), public.chat_senders(uuid), public.mark_chat_read(uuid) from public, anon;
grant execute on function public.my_chats(), public.my_shares(), public.chat_senders(uuid), public.mark_chat_read(uuid) to authenticated;
