-- Plans: who has full access and who is limited to the demo.
-- Run once in the Supabase SQL editor. Safe to run again.
--
--   plan        demo  one project, demo PDF only, no chat, no panel import
--               free  full access, granted by an administrator
--               paid  full access, subscriber (set by an administrator now, by the payment webhook later)
--   plan_until  optional end date for free/paid access (null = no end)
--
-- Nothing is restricted until the administrator turns on "Enforce plans" in the admin console
-- (app_settings.plans_enforced). Everyone who already has an account keeps full access (plan = 'free').

alter table public.profiles add column if not exists plan       text        not null default 'demo';
alter table public.profiles add column if not exists plan_until timestamptz;
alter table public.profiles add column if not exists plan_note  text check (plan_note is null or char_length(plan_note) <= 200);
alter table public.profiles add column if not exists stripe_customer_id     text;
alter table public.profiles add column if not exists stripe_subscription_id text;
create index if not exists profiles_stripe_customer_idx on public.profiles (stripe_customer_id);
alter table public.profiles drop constraint if exists profiles_plan_check;
alter table public.profiles add constraint profiles_plan_check check (plan in ('demo','free','paid'));

-- Existing accounts stay exactly as they are. Only rows that have never had a plan set are touched,
-- and only the first time this migration runs (the marker below stops a second run from changing anyone).
create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;
grant select on public.app_settings to authenticated;
drop policy if exists app_settings_read on public.app_settings;
create policy app_settings_read on public.app_settings for select to authenticated using (true);

do $$
begin
  if not exists (select 1 from public.app_settings where key = 'plans_migrated') then
    update public.profiles set plan = 'free', plan_note = 'Existing account' where plan = 'demo';
    insert into public.app_settings (key, value) values ('plans_migrated', 'true'::jsonb);
  end if;
  insert into public.app_settings (key, value) values ('plans_enforced', 'false'::jsonb) on conflict (key) do nothing;
end $$;

-- True when the signed-in user may use every feature.
-- Limits apply when the administrator turned them on (plans_enforced) or when the chosen start date (plans_start_at) has passed.
create or replace function public.has_full_access(p_uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select
    case when not (
           coalesce((select (s.value)::text = 'true' from public.app_settings s where s.key = 'plans_enforced'), false)
        or coalesce((select (s.value #>> '{}')::timestamptz <= now() from public.app_settings s
                     where s.key = 'plans_start_at' and nullif(s.value #>> '{}', '') is not null), false))
    then true
    else coalesce((select p.role = 'admin'
                      or (p.plan in ('free','paid') and (p.plan_until is null or p.plan_until > now()))
                   from public.profiles p where p.id = p_uid), false)
    end;
$$;
revoke all on function public.has_full_access(uuid) from public, anon;
grant execute on function public.has_full_access(uuid) to authenticated, service_role;

-- Demo accounts can hold one project. Opening, editing and deleting it is unaffected.
create or replace function public.projects_plan_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_full_access(new.owner_id)
     and (select count(*) from public.projects x where x.owner_id = new.owner_id) >= 1 then
    raise exception 'PLAN_LIMIT_PROJECTS' using errcode = 'P0001', hint = 'The demo plan allows one project.';
  end if;
  return new;
end $$;
drop trigger if exists projects_plan_limit_trg on public.projects;
create trigger projects_plan_limit_trg before insert on public.projects for each row execute function public.projects_plan_limit();

-- Posting messages and uploading chat files need full access. Reading is always allowed.
drop policy if exists messages_insert on public.chat_messages;
create policy messages_insert on public.chat_messages for insert to authenticated
  with check (sender_id = auth.uid() and public.is_chat_member(chat_id) and public.is_active()
              and not public.chat_blocked(chat_id) and public.has_full_access());

drop policy if exists chat_files_insert on storage.objects;
create policy chat_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-files' and public.can_use_chat_file(name) and public.has_full_access());

-- Admin list now includes the plan.
drop function if exists public.admin_list_users(text, text, text, int, int);
create or replace function public.admin_list_users(
  p_search text default null, p_status text default null, p_verified text default null,
  p_limit int default 25, p_offset int default 0, p_plan text default null)
returns table (
  id uuid, email text, first_name text, last_name text, company text, country text, occupation text,
  role text, status text, created_at timestamptz, last_seen_at timestamptz,
  email_confirmed_at timestamptz, last_sign_in_at timestamptz, project_count bigint, total_count bigint,
  plan text, plan_until timestamptz, plan_note text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.email, p.first_name, p.last_name, p.company, p.country, p.occupation,
         p.role, p.status, p.created_at, p.last_seen_at,
         u.email_confirmed_at, u.last_sign_in_at,
         (select count(*) from public.projects pr where pr.owner_id = p.id) as project_count,
         count(*) over () as total_count,
         p.plan, p.plan_until, p.plan_note
  from public.profiles p
  left join auth.users u on u.id = p.id
  where (p_search is null or p_search = ''
         or p.email ilike '%' || replace(replace(p_search, '%', ''), '_', '') || '%'
         or (p.first_name || ' ' || p.last_name) ilike '%' || replace(replace(p_search, '%', ''), '_', '') || '%'
         or p.company ilike '%' || replace(replace(p_search, '%', ''), '_', '') || '%')
    and (p_status is null or p_status = '' or p.status = p_status)
    and (p_plan is null or p_plan = '' or p.plan = p_plan)
    and (p_verified is null or p_verified = ''
         or (p_verified = 'yes' and u.email_confirmed_at is not null)
         or (p_verified = 'no'  and u.email_confirmed_at is null))
  order by p.created_at desc
  limit greatest(1, least(coalesce(p_limit, 25), 100)) offset greatest(0, coalesce(p_offset, 0));
$$;
revoke all on function public.admin_list_users(text, text, text, int, int, text) from public, anon, authenticated;
grant execute on function public.admin_list_users(text, text, text, int, int, text) to service_role;
