-- DBoard Designer: blocking and reporting members (required by the App Store and Google Play for apps with chat).
-- Run once in the Supabase SQL editor, after 0005_members_files.sql. Safe to run more than once.
--
-- * A member can block another member. Neither can then start a private chat with the other, invite the other to a
--   group or share a project with them; their existing private chat stops accepting messages; they disappear from each
--   other's member list; the blocker gets no notifications from the blocked person and does not see their messages
--   in shared groups. Blocking is silent: the blocked person is not told.
-- * A member can report a message or a member. Reports go to administrators (Admin, Reports, plus a notification and,
--   if email is set up, an email) with a copy of the reported message. Administrators can delete the message or
--   suspend the account.

-- ---------------------------------------------------------------------------
-- Blocks
-- ---------------------------------------------------------------------------
create table if not exists public.user_blocks (
  blocker_id  uuid not null references auth.users (id) on delete cascade,
  blocked_id  uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index if not exists user_blocks_blocked_idx on public.user_blocks (blocked_id);
alter table public.user_blocks enable row level security;
revoke all on public.user_blocks from anon, authenticated;
grant select, insert, delete on public.user_blocks to authenticated;
drop policy if exists blocks_select_own on public.user_blocks;
create policy blocks_select_own on public.user_blocks for select to authenticated using (blocker_id = auth.uid());
drop policy if exists blocks_insert_own on public.user_blocks;
create policy blocks_insert_own on public.user_blocks for insert to authenticated
  with check (blocker_id = auth.uid() and blocked_id <> auth.uid() and public.is_active());
drop policy if exists blocks_delete_own on public.user_blocks;
create policy blocks_delete_own on public.user_blocks for delete to authenticated using (blocker_id = auth.uid());

-- Is there a block, in either direction, between two people?
create or replace function public.blocked_between(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_blocks x where (x.blocker_id = a and x.blocked_id = b) or (x.blocker_id = b and x.blocked_id = a));
$$;
-- Is this a private chat whose two members have a block between them?
create or replace function public.chat_blocked(cid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.chats c
    join public.chat_members m1 on m1.chat_id = c.id
    join public.chat_members m2 on m2.chat_id = c.id and m2.user_id <> m1.user_id
    where c.id = cid and c.kind = 'direct' and public.blocked_between(m1.user_id, m2.user_id));
$$;
revoke all on function public.blocked_between(uuid, uuid), public.chat_blocked(uuid) from public, anon, authenticated;
grant execute on function public.chat_blocked(uuid) to authenticated, service_role;   -- used by the message policy
grant execute on function public.blocked_between(uuid, uuid) to service_role;         -- not exposed: would reveal who blocked whom

drop policy if exists messages_insert on public.chat_messages;
create policy messages_insert on public.chat_messages for insert to authenticated
  with check (sender_id = auth.uid() and public.is_chat_member(chat_id) and public.is_active() and not public.chat_blocked(chat_id));

-- People I have blocked, with their names, for Account settings.
create or replace function public.my_blocks()
returns table (id uuid, name text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select b.blocked_id, coalesce(public.person_label(b.blocked_id), 'Former member'), b.created_at
  from public.user_blocks b where b.blocker_id = auth.uid() order by b.created_at desc;
$$;
revoke all on function public.my_blocks() from public, anon;
grant execute on function public.my_blocks() to authenticated;

-- The member list leaves out people you blocked and people who blocked you.
create or replace function public.member_directory(q text default '', lim int default 60, off int default 0)
returns table (id uuid, name text, company text, country text, occupation text, member_since timestamptz, total bigint)
language sql stable security definer set search_path = '' as $$
  with pat as (
    select '%' || replace(replace(replace(left(btrim(coalesce(q, '')), 80), '\', '\\'), '%', '\%'), '_', '\_') || '%' as p
  ), base as (
    select p.id,
           coalesce(nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), 'Member') as name,
           p.company, p.country, p.occupation, p.created_at
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.status = 'active' and p.show_in_directory and u.email_confirmed_at is not null and p.id <> auth.uid()
      and not public.blocked_between(auth.uid(), p.id)
  )
  select b.id, b.name, b.company, b.country, b.occupation, b.created_at, count(*) over ()
  from base b, pat
  where public.is_active()
    and (btrim(coalesce(q, '')) = ''
         or b.name ilike pat.p or coalesce(b.company, '') ilike pat.p
         or coalesce(b.country, '') ilike pat.p or coalesce(b.occupation, '') ilike pat.p)
  order by lower(b.name), b.id
  limit least(greatest(coalesce(lim, 60), 1), 100) offset greatest(coalesce(off, 0), 0);
$$;

-- No notifications from someone you blocked.
create or replace function public.chat_messages_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  c record; r record; who text := public.person_label(new.sender_id);
  snip text := left(regexp_replace(public.chat_message_preview(new.body, new.attachment, new.project_name), '\s+', ' ', 'g'), 120);
  ttl text;
begin
  update public.chats set last_message_at = new.created_at where id = new.chat_id;
  select * into c from public.chats where id = new.chat_id;
  ttl := case when c.kind = 'group' then coalesce(c.title, 'Group chat') else who end;
  for r in select m.user_id from public.chat_members m
           where m.chat_id = new.chat_id and m.status = 'joined' and m.user_id <> new.sender_id
             and not exists (select 1 from public.user_blocks b where b.blocker_id = m.user_id and b.blocked_id = new.sender_id) loop
    update public.notifications set count = count + 1, body = who || ': ' || snip, created_at = now()
    where user_id = r.user_id and kind = 'chat_message' and ref_id = new.chat_id and read_at is null;
    if not found then
      insert into public.notifications (user_id, kind, ref_id, title, body) values (r.user_id, 'chat_message', new.chat_id, ttl, who || ': ' || snip);
    end if;
  end loop;
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- Reports (written by the Worker; administrators read them through the Worker)
-- ---------------------------------------------------------------------------
create table if not exists public.content_reports (
  id              uuid primary key default gen_random_uuid(),
  reporter_id     uuid references auth.users (id) on delete set null,
  target_user_id  uuid references auth.users (id) on delete set null,
  chat_id         uuid references public.chats (id) on delete set null,
  message_id      bigint references public.chat_messages (id) on delete set null,
  message_body    text check (message_body is null or char_length(message_body) <= 2200),
  reason          text not null check (reason in ('spam', 'harassment', 'inappropriate', 'impersonation', 'other')),
  details         text check (details is null or char_length(details) <= 1000),
  status          text not null default 'new' check (status in ('new', 'reviewed')),
  created_at      timestamptz not null default now()
);
create index if not exists content_reports_status_idx on public.content_reports (status, created_at desc);
create index if not exists content_reports_reporter_idx on public.content_reports (reporter_id, created_at desc);
alter table public.content_reports enable row level security;
revoke all on public.content_reports from anon, authenticated;

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in ('chat_invite', 'chat_message', 'project_share', 'report'));
