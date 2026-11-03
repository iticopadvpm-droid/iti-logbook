-- Minimal stand-ins for the parts of Supabase that schema.sql relies on.
-- Used ONLY by the tests (PGlite); real Supabase already has all of this.
create schema if not exists auth;
create schema if not exists storage;

do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb
);

create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create table if not exists storage.buckets (
  id text primary key, name text, public boolean default false
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text, name text
);
alter table storage.objects enable row level security;

create or replace function storage.foldername(name text) returns text[]
language sql immutable as $$
  select case when array_length(string_to_array(name, '/'), 1) > 1
              then (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
              else '{}'::text[] end
$$;

grant usage on schema auth, storage to anon, authenticated;
grant select on all tables in schema storage to authenticated;
grant insert, update, delete on storage.objects to authenticated;
