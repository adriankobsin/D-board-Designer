-- minimal stand-in for the Supabase pieces the migration relies on (TEST ONLY, never shipped)
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users(id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb, email_confirmed_at timestamptz, last_sign_in_at timestamptz, created_at timestamptz default now());
create function auth.uid() returns uuid language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
grant usage on schema public, auth to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
grant select on auth.users to service_role;
-- Storage stand-in (TEST ONLY): the two tables and the helper the policies use, with RLS like Supabase.
create schema storage;
grant usage on schema storage to anon, authenticated, service_role;
create table storage.buckets(id text primary key, name text not null, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid, owner_id text default (auth.uid())::text, created_at timestamptz default now(), metadata jsonb, unique(bucket_id, name));
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to authenticated, service_role;
grant select on storage.buckets to authenticated, service_role;
create publication supabase_realtime;   -- stand-in for Supabase's realtime publication
