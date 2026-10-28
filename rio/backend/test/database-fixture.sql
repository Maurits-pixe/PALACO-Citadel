-- TEST ONLY: a deliberately small, synthetic Auth contract in an empty,
-- disposable database. This is not a Supabase service or production identity.
do $fixture$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end;
$fixture$;
revoke create on schema public from public;
create schema auth;
grant usage on schema auth, public to anon, authenticated;
create table auth.users (
  id uuid primary key,
  email_confirmed_at timestamptz,
  phone_confirmed_at timestamptz,
  is_anonymous boolean not null default false,
  banned_until timestamptz,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);
create table auth.sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id),
  not_after timestamptz
);
create function auth.uid() returns uuid language sql stable
set search_path = '' as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid;
$$;
create function auth.jwt() returns jsonb language sql stable
set search_path = '' as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
$$;
revoke all on auth.users, auth.sessions from public, anon, authenticated;
grant execute on function auth.uid(), auth.jwt() to anon, authenticated;

insert into auth.users (id, email_confirmed_at, phone_confirmed_at, is_anonymous, banned_until)
values
  ('11111111-1111-4111-8111-111111111111', now(), null, false, null),
  ('22222222-2222-4222-8222-222222222222', now(), null, false, null),
  ('33333333-3333-4333-8333-333333333333', null, null, false, null),
  ('44444444-4444-4444-8444-444444444444', null, now(), false, null),
  ('55555555-5555-4555-8555-555555555555', now(), null, true, null),
  ('66666666-6666-4666-8666-666666666666', now(), null, false, now() + interval '1 day'),
  ('77777777-7777-4777-8777-777777777777', now(), null, false, null),
  ('88888888-8888-4888-8888-888888888888', now(), null, false, null);
insert into auth.sessions (id, user_id)
select ('b' || substr(id::text, 2))::uuid, id from auth.users;
