-- DBoard Designer: accounts, projects, feedback and usage tracking.
-- Run once in the Supabase SQL editor (or with `supabase db push`).
-- Every table has Row Level Security enabled. Users can only reach their own rows.
-- Administrator reads and writes go through the Cloudflare Worker with the service role key, never from the browser.

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  email             text,
  first_name        text not null default '' check (char_length(first_name) <= 80),
  last_name         text not null default '' check (char_length(last_name)  <= 80),
  company           text check (company is null or char_length(company) <= 120),
  country           text check (country is null or char_length(country) <= 80),
  occupation        text check (occupation is null or occupation in
                      ('Electrical Engineer','Electrician','Panel Builder','System Integrator','Student','Other')),
  role              text not null default 'user'   check (role in ('user','admin')),
  status            text not null default 'active' check (status in ('active','suspended')),
  accepted_terms_at timestamptz,
  created_at        timestamptz not null default now(),
  last_seen_at      timestamptz
);
create index if not exists profiles_created_idx on public.profiles (created_at desc);
create index if not exists profiles_email_idx   on public.profiles (lower(email));

-- Create a profile row whenever Supabase Auth creates a user.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  occ text := nullif(btrim(m ->> 'occupation'), '');
begin
  if occ is not null and occ not in ('Electrical Engineer','Electrician','Panel Builder','System Integrator','Student','Other') then
    occ := 'Other';
  end if;
  insert into public.profiles (id, email, first_name, last_name, company, country, occupation, accepted_terms_at)
  values (
    new.id,
    new.email,
    left(coalesce(btrim(m ->> 'first_name'), ''), 80),
    left(coalesce(btrim(m ->> 'last_name'), ''), 80),
    left(nullif(btrim(m ->> 'company'), ''), 120),
    left(nullif(btrim(m ->> 'country'), ''), 80),
    occ,
    case when (m ->> 'accepted_terms') = 'true' then now() end
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper checks used by policies. SECURITY DEFINER so they can read profiles regardless of RLS.
create or replace function public.is_active()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select p.status = 'active' from public.profiles p where p.id = auth.uid()), false);
$$;

create or replace function public.touch_last_seen()
returns void language sql security definer set search_path = '' as $$
  update public.profiles set last_seen_at = now() where id = auth.uid();
$$;

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
-- Users may edit only their own descriptive fields. role and status can never be changed from the browser.
grant update (first_name, last_name, company, country, occupation) on public.profiles to authenticated;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated using (id = auth.uid());
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name            text not null default 'Untitled board' check (char_length(name) between 1 and 200),
  data            jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 8000000),
  meta            jsonb not null default '{}'::jsonb check (pg_column_size(meta) < 4000),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  last_opened_at  timestamptz
);
create index if not exists projects_owner_updated_idx on public.projects (owner_id, updated_at desc);
create index if not exists projects_owner_opened_idx  on public.projects (owner_id, last_opened_at desc nulls last);

create or replace function public.projects_touch()
returns trigger language plpgsql as $$
begin
  -- opening a project must not look like an edit
  if new.data is distinct from old.data or new.name is distinct from old.name then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;
  new.owner_id := old.owner_id;
  new.created_at := old.created_at;
  return new;
end $$;
drop trigger if exists projects_touch_trg on public.projects;
create trigger projects_touch_trg before update on public.projects for each row execute function public.projects_touch();

alter table public.projects enable row level security;
revoke all on public.projects from anon, authenticated;
grant select, insert, update, delete on public.projects to authenticated;

drop policy if exists projects_select_own on public.projects;
create policy projects_select_own on public.projects for select to authenticated using (owner_id = auth.uid());
drop policy if exists projects_insert_own on public.projects;
create policy projects_insert_own on public.projects for insert to authenticated
  with check (owner_id = auth.uid() and public.is_active());
drop policy if exists projects_update_own on public.projects;
create policy projects_update_own on public.projects for update to authenticated
  using (owner_id = auth.uid() and public.is_active()) with check (owner_id = auth.uid());
drop policy if exists projects_delete_own on public.projects;
create policy projects_delete_own on public.projects for delete to authenticated
  using (owner_id = auth.uid() and public.is_active());

-- ---------------------------------------------------------------------------
-- Feedback
-- ---------------------------------------------------------------------------
create table if not exists public.feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid default auth.uid() references auth.users (id) on delete set null,
  message     text not null check (char_length(message) between 1 and 4000),
  rating      smallint check (rating between 1 and 5),
  page        text check (page is null or char_length(page) <= 60),
  status      text not null default 'new' check (status in ('new','reviewed')),
  created_at  timestamptz not null default now()
);
create index if not exists feedback_created_idx on public.feedback (created_at desc);
alter table public.feedback enable row level security;
revoke all on public.feedback from anon, authenticated;
grant select, insert on public.feedback to authenticated;
drop policy if exists feedback_insert_own on public.feedback;
create policy feedback_insert_own on public.feedback for insert to authenticated
  with check (user_id = auth.uid() and status = 'new' and public.is_active());
drop policy if exists feedback_select_own on public.feedback;
create policy feedback_select_own on public.feedback for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Usage events (insert-only from the browser)
-- ---------------------------------------------------------------------------
create table if not exists public.usage_events (
  id          bigint generated always as identity primary key,
  user_id     uuid default auth.uid() references auth.users (id) on delete cascade,
  event       text not null check (event in ('login','project_created','project_opened','export_pdf','export_excel','export_csv','tool_opened','feedback_sent','import_analyzed','import_created')),
  meta        jsonb not null default '{}'::jsonb check (pg_column_size(meta) < 2000),
  created_at  timestamptz not null default now()
);
create index if not exists usage_events_created_idx on public.usage_events (created_at desc);
create index if not exists usage_events_user_idx on public.usage_events (user_id, created_at desc);
alter table public.usage_events enable row level security;
revoke all on public.usage_events from anon, authenticated;
grant insert on public.usage_events to authenticated;
drop policy if exists usage_insert_own on public.usage_events;
create policy usage_insert_own on public.usage_events for insert to authenticated
  with check (user_id = auth.uid() and public.is_active());

-- ---------------------------------------------------------------------------
-- Admin audit log (no browser access at all)
-- ---------------------------------------------------------------------------
create table if not exists public.admin_actions (
  id          bigint generated always as identity primary key,
  admin_id    uuid references auth.users (id) on delete set null,
  target_id   uuid,
  action      text not null,
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
alter table public.admin_actions enable row level security;
revoke all on public.admin_actions from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Admin reporting functions. Callable only with the service role key (the Worker).
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_users(
  p_search text default null, p_status text default null, p_verified text default null,
  p_limit int default 25, p_offset int default 0)
returns table (
  id uuid, email text, first_name text, last_name text, company text, country text, occupation text,
  role text, status text, created_at timestamptz, last_seen_at timestamptz,
  email_confirmed_at timestamptz, last_sign_in_at timestamptz, project_count bigint, total_count bigint)
language sql stable security definer set search_path = '' as $$
  select p.id, p.email, p.first_name, p.last_name, p.company, p.country, p.occupation,
         p.role, p.status, p.created_at, p.last_seen_at,
         u.email_confirmed_at, u.last_sign_in_at,
         (select count(*) from public.projects pr where pr.owner_id = p.id) as project_count,
         count(*) over () as total_count
  from public.profiles p
  left join auth.users u on u.id = p.id
  where (p_search is null or p_search = ''
         or p.email ilike '%' || replace(replace(p_search, '%', ''), '_', '') || '%'
         or (p.first_name || ' ' || p.last_name) ilike '%' || replace(replace(p_search, '%', ''), '_', '') || '%'
         or p.company ilike '%' || replace(replace(p_search, '%', ''), '_', '') || '%')
    and (p_status is null or p_status = '' or p.status = p_status)
    and (p_verified is null or p_verified = ''
         or (p_verified = 'yes' and u.email_confirmed_at is not null)
         or (p_verified = 'no'  and u.email_confirmed_at is null))
  order by p.created_at desc
  limit greatest(1, least(coalesce(p_limit, 25), 100)) offset greatest(0, coalesce(p_offset, 0));
$$;

create or replace function public.admin_stats()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'users_total',      (select count(*) from public.profiles),
    'users_verified',   (select count(*) from public.profiles p join auth.users u on u.id = p.id where u.email_confirmed_at is not null),
    'users_suspended',  (select count(*) from public.profiles where status = 'suspended'),
    'users_new_7d',     (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'users_new_30d',    (select count(*) from public.profiles where created_at > now() - interval '30 days'),
    'users_active_7d',  (select count(distinct user_id) from public.usage_events where created_at > now() - interval '7 days'),
    'projects_total',   (select count(*) from public.projects),
    'projects_new_7d',  (select count(*) from public.projects where created_at > now() - interval '7 days'),
    'feedback_new',     (select count(*) from public.feedback where status = 'new'),
    'signups_by_day',   coalesce((select jsonb_agg(jsonb_build_object('day', d.day, 'count', coalesce(c.n, 0)) order by d.day)
                          from (select generate_series((now() - interval '29 days')::date, now()::date, interval '1 day')::date as day) d
                          left join (select created_at::date as day, count(*) as n from public.profiles
                                     where created_at > now() - interval '30 days' group by 1) c on c.day = d.day), '[]'::jsonb),
    'events_30d',       coalesce((select jsonb_object_agg(event, n) from
                          (select event, count(*) as n from public.usage_events
                           where created_at > now() - interval '30 days' group by event) e), '{}'::jsonb),
    'countries',        coalesce((select jsonb_agg(jsonb_build_object('country', country, 'count', n) order by n desc)
                          from (select coalesce(nullif(country, ''), '(not given)') as country, count(*) as n
                                from public.profiles group by 1 order by n desc limit 10) x), '[]'::jsonb)
  );
$$;

revoke all on function public.admin_list_users(text, text, text, int, int) from public, anon, authenticated;
revoke all on function public.admin_stats() from public, anon, authenticated;
grant execute on function public.admin_list_users(text, text, text, int, int) to service_role;
grant execute on function public.admin_stats() to service_role;

-- Browser-callable helpers
revoke all on function public.is_active() from public, anon;
grant execute on function public.is_active() to authenticated;
revoke all on function public.touch_last_seen() from public, anon;
grant execute on function public.touch_last_seen() to authenticated;
