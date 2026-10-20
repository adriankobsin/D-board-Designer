-- DBoard Designer: member directory, files in chats, projects shared into chats.
-- Run once in the Supabase SQL editor, after 0004_community.sql. Safe to run more than once.
--
-- * Every active, verified member appears in the Community member directory (name, occupation, company, country).
--   Email addresses are never shown. Members can hide themselves from the directory in Account settings;
--   they can then still be reached by someone who knows their exact email address.
-- * Chat members can attach files (up to 25 MB each, 100 a day per person). Files live in a private
--   Storage bucket "chat-files" and only members of that chat can open them.
-- * A project shared into a chat appears there as a card; recipients can open their own copy.

-- ---------------------------------------------------------------------------
-- Member directory
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists show_in_directory boolean not null default true;
grant update (show_in_directory) on public.profiles to authenticated;

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
revoke all on function public.member_directory(text, int, int) from public, anon;
grant execute on function public.member_directory(text, int, int) to authenticated;

-- Used by the Worker (service role) when someone picks members from the list: only listed members can be reached by id.
create or replace function public.directory_members(ids uuid[])
returns table (id uuid, email text, first_name text, last_name text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.email, p.first_name, p.last_name
  from public.profiles p join auth.users u on u.id = p.id
  where p.id = any (ids) and p.status = 'active' and p.show_in_directory and u.email_confirmed_at is not null;
$$;
revoke all on function public.directory_members(uuid[]) from public, anon, authenticated;
grant execute on function public.directory_members(uuid[]) to service_role;

-- ---------------------------------------------------------------------------
-- Messages can carry a file or a shared project
-- ---------------------------------------------------------------------------
alter table public.chat_messages add column if not exists attachment   jsonb;
alter table public.chat_messages add column if not exists project_id   uuid references public.projects (id) on delete set null;
alter table public.chat_messages add column if not exists project_name text check (project_name is null or char_length(project_name) <= 200);
alter table public.chat_messages drop constraint if exists chat_messages_body_check;
alter table public.chat_messages drop constraint if exists chat_messages_body_ok;
alter table public.chat_messages add constraint chat_messages_body_ok check (
  char_length(body) <= 2000 and (char_length(btrim(body)) > 0 or attachment is not null or project_name is not null));
alter table public.chat_messages alter column body set default '';

-- The browser may write only text and a file reference. Project cards are posted by the Worker.
revoke insert on public.chat_messages from authenticated;
grant insert (chat_id, sender_id, body, attachment) on public.chat_messages to authenticated;

-- A share made from inside a chat is announced by the chat message, not by a separate notification.
alter table public.project_shares add column if not exists chat_id uuid references public.chats (id) on delete set null;
create or replace function public.project_shares_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.chat_id is null then
    insert into public.notifications (user_id, kind, ref_id, title, body)
    values (new.recipient_id, 'project_share', new.id, new.project_name, public.person_label(new.owner_id) || ' shared a project with you.');
  end if;
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- File storage (private bucket; path is <chat id>/<random id>/<file name>)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-files', 'chat-files', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = 26214400;

create or replace function public.chat_file_chat(path text)
returns uuid language sql immutable set search_path = '' as $$
  select case when path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]{1,180}$'
              then split_part(path, '/', 1)::uuid end;
$$;
create or replace function public.can_use_chat_file(path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.is_chat_member(public.chat_file_chat(path)), false) and public.is_active();
$$;
revoke all on function public.can_use_chat_file(text) from public, anon;
grant execute on function public.can_use_chat_file(text) to authenticated;
grant execute on function public.chat_file_chat(text) to authenticated;

drop policy if exists chat_files_insert on storage.objects;
create policy chat_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-files' and public.can_use_chat_file(name));
drop policy if exists chat_files_select on storage.objects;
create policy chat_files_select on storage.objects for select to authenticated
  using (bucket_id = 'chat-files' and public.can_use_chat_file(name));
drop policy if exists chat_files_delete_own on storage.objects;
create policy chat_files_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'chat-files' and owner_id = auth.uid()::text);

-- Check every file reference before a message is stored, and cap files at 100 a day per person.
create or replace function public.chat_messages_check_file()
returns trigger language plpgsql security definer set search_path = '' as $$
declare a jsonb := new.attachment;
begin
  if a is null then return new; end if;
  if jsonb_typeof(a) <> 'object' or jsonb_typeof(a -> 'path') <> 'string' or jsonb_typeof(a -> 'name') <> 'string'
     or public.chat_file_chat(a ->> 'path') is distinct from new.chat_id then
    raise exception 'Invalid file reference.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'chat-files' and o.name = a ->> 'path') then
    raise exception 'The file was not uploaded.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.chat_messages where sender_id = new.sender_id and attachment is not null and created_at > now() - interval '1 day') >= 100 then
    raise exception 'Daily file limit reached. Try again tomorrow.' using errcode = 'P0001';
  end if;
  new.attachment := jsonb_build_object(
    'path', a ->> 'path',
    'name', left(btrim(a ->> 'name'), 180),
    'size', case when jsonb_typeof(a -> 'size') = 'number' then least(greatest((a ->> 'size')::numeric, 0), 26214400)::bigint else 0 end,
    'type', left(coalesce(a ->> 'type', ''), 120));
  return new;
end $$;
drop trigger if exists chat_messages_file_trg on public.chat_messages;
create trigger chat_messages_file_trg before insert on public.chat_messages for each row execute function public.chat_messages_check_file();

-- Message previews: show the file or project when there is no text.
create or replace function public.chat_message_preview(body text, attachment jsonb, project_name text)
returns text language sql immutable set search_path = '' as $$
  select coalesce(nullif(btrim(body), ''),
                  case when attachment is not null then '📎 ' || coalesce(attachment ->> 'name', 'File') end,
                  case when project_name is not null then '▦ ' || project_name end, '');
$$;

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
  for r in select user_id from public.chat_members where chat_id = new.chat_id and status = 'joined' and user_id <> new.sender_id loop
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
         case when m.status = 'joined' then public.chat_message_preview(lm.body, lm.attachment, lm.project_name) end,
         case when m.status = 'joined' then public.person_label(lm.sender_id) end,
         case when m.status = 'joined'
              then (select count(*) from public.chat_messages x where x.chat_id = c.id and x.created_at > m.last_read_at and x.sender_id <> auth.uid())
              else 0 end,
         (select coalesce(jsonb_agg(jsonb_build_object('id', cm.user_id, 'name', public.person_label(cm.user_id), 'status', cm.status, 'role', cm.role)
                                    order by cm.joined_at nulls last, cm.invited_at), '[]'::jsonb)
          from public.chat_members cm where cm.chat_id = c.id)
  from public.chats c
  join public.chat_members m on m.chat_id = c.id and m.user_id = auth.uid()
  left join lateral (select y.body, y.sender_id, y.attachment, y.project_name from public.chat_messages y where y.chat_id = c.id order by y.id desc limit 1) lm on true
  where public.is_active()
  order by c.last_message_at desc;
$$;
revoke all on function public.my_chats() from public, anon;
grant execute on function public.my_chats() to authenticated;
