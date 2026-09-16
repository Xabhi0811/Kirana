-- LOCAL SCHEMA DEVELOPMENT ONLY. Do not run on hosted Supabase.
-- Provides dependency schemas/roles for existing application migrations.
-- This is NOT an authentication API, a token verifier, or object storage.
do $$ begin
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
 if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema auth;
create schema storage;
create schema extensions;
create table auth.users(id uuid primary key default gen_random_uuid(),email text unique,raw_user_meta_data jsonb not null default '{}');
create function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
alter table storage.objects enable row level security;
create function storage.foldername(text) returns text[] language sql immutable as $$
 select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1]
$$;
create publication supabase_realtime;
grant usage on schema public,auth,storage to anon,authenticated;
alter default privileges in schema public grant select,insert,update,delete on tables to authenticated;
alter default privileges in schema public grant select on tables to anon;
grant select,insert,delete on storage.objects to authenticated;
grant select on storage.objects to anon;
