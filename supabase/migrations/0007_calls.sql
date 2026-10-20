-- DBoard Designer: audio and video calls in chats (Cloudflare RealtimeKit), and instant notifications.
-- Run once in the Supabase SQL editor, after 0006_safety.sql. Safe to run more than once.
--
-- * Every chat (private or group) gets one call room, created the first time someone calls.
-- * Starting a call posts a call card in the chat and rings the other members (a 'call' notification).
-- * Call join tokens are stored here so they can be reused (they are valid for 100 days); only the Worker can read them.
-- * Notifications are sent to the browser instantly (Supabase Realtime), so incoming calls ring straight away.

alter table public.chats add column if not exists rtk_meeting_id text;

create table if not exists public.chat_call_tokens (
  chat_id         uuid not null references public.chats (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  participant_id  text not null,
  token           text not null,
  created_at      timestamptz not null default now(),
  primary key (chat_id, user_id)
);
alter table public.chat_call_tokens enable row level security;
revoke all on public.chat_call_tokens from anon, authenticated;

-- A call card in the chat: {"video": true|false}
alter table public.chat_messages add column if not exists call jsonb;
alter table public.chat_messages drop constraint if exists chat_messages_body_ok;
alter table public.chat_messages add constraint chat_messages_body_ok check (
  char_length(body) <= 2000 and (char_length(btrim(body)) > 0 or attachment is not null or project_name is not null or call is not null));

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('chat_invite', 'chat_message', 'project_share', 'report', 'call'));

drop function if exists public.chat_message_preview(text, jsonb, text);   -- replaced by the version below (adds calls)
create or replace function public.chat_message_preview(body text, attachment jsonb, project_name text, call jsonb)
returns text language sql immutable set search_path = '' as $$
  select coalesce(nullif(btrim(body), ''),
                  case when attachment is not null then '📎 ' || coalesce(attachment ->> 'name', 'File') end,
                  case when project_name is not null then '▦ ' || project_name end,
                  case when call is not null then case when (call ->> 'video') = 'true' then '📹 Video call' else '📞 Audio call' end end, '');
$$;

-- Chat notifications: a call card rings as a 'call' notification instead of a message notification.
create or replace function public.chat_messages_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  c record; r record; who text := public.person_label(new.sender_id);
  snip text := left(regexp_replace(public.chat_message_preview(new.body, new.attachment, new.project_name, new.call), '\s+', ' ', 'g'), 120);
  ttl text;
begin
  update public.chats set last_message_at = new.created_at where id = new.chat_id;
  select * into c from public.chats where id = new.chat_id;
  ttl := case when c.kind = 'group' then coalesce(c.title, 'Group chat') else who end;
  for r in select m.user_id from public.chat_members m
           where m.chat_id = new.chat_id and m.status = 'joined' and m.user_id <> new.sender_id
             and not exists (select 1 from public.user_blocks b where b.blocker_id = m.user_id and b.blocked_id = new.sender_id) loop
    if new.call is not null then
      insert into public.notifications (user_id, kind, ref_id, title, body)
      values (r.user_id, 'call', new.chat_id, ttl, who || case when (new.call ->> 'video') = 'true' then ' is video calling' else ' is calling' end);
      continue;
    end if;
    update public.notifications set count = count + 1, body = who || ': ' || snip, created_at = now()
    where user_id = r.user_id and kind = 'chat_message' and ref_id = new.chat_id and read_at is null;
    if not found then
      insert into public.notifications (user_id, kind, ref_id, title, body) values (r.user_id, 'chat_message', new.chat_id, ttl, who || ': ' || snip);
    end if;
  end loop;
  return null;
end $$;

create or replace function public.my_chats()
returns table (id uuid, kind text, title text, my_status text, my_role text, created_by uuid, last_message_at timestamptz,
               last_body text, last_sender text, unread bigint, members jsonb)
language sql stable security definer set search_path = '' as $$
  select c.id, c.kind, c.title, m.status, m.role, c.created_by, c.last_message_at,
         case when m.status = 'joined' then public.chat_message_preview(lm.body, lm.attachment, lm.project_name, lm.call) end,
         case when m.status = 'joined' then public.person_label(lm.sender_id) end,
         case when m.status = 'joined'
              then (select count(*) from public.chat_messages x where x.chat_id = c.id and x.created_at > m.last_read_at and x.sender_id <> auth.uid())
              else 0 end,
         (select coalesce(jsonb_agg(jsonb_build_object('id', cm.user_id, 'name', public.person_label(cm.user_id), 'status', cm.status, 'role', cm.role)
                                    order by cm.joined_at nulls last, cm.invited_at), '[]'::jsonb)
          from public.chat_members cm where cm.chat_id = c.id)
  from public.chats c
  join public.chat_members m on m.chat_id = c.id and m.user_id = auth.uid()
  left join lateral (select y.body, y.sender_id, y.attachment, y.project_name, y.call from public.chat_messages y where y.chat_id = c.id order by y.id desc limit 1) lm on true
  where public.is_active()
  order by c.last_message_at desc;
$$;
revoke all on function public.my_chats() from public, anon;
grant execute on function public.my_chats() to authenticated;

-- Send new notifications to the signed-in browser immediately (row level security still applies).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
