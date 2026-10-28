-- RIO private workspace v0.1. Application-local person references are admitted
-- administratively; this migration issues no canonical PALACO or P.P. identity.
-- Apply only as the trusted database migration owner, never from a browser.
begin;

create schema rio_backend_private;
revoke all on schema rio_backend_private from public, anon, authenticated;
grant usage on schema rio_backend_private to authenticated;

create table public.rio_person_bindings (
  person_id uuid primary key,
  provider_subject uuid not null unique references auth.users(id),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'REVOKED')),
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);

create table public.rio_notes (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  person_id uuid not null references public.rio_person_bindings(person_id),
  title text not null check (pg_catalog.char_length(title) between 1 and 120),
  body text not null check (pg_catalog.char_length(body) between 1 and 8000),
  client_request_id uuid not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique (person_id, client_request_id),
  unique (id, person_id)
);
create index rio_notes_person_created_idx on public.rio_notes (person_id, created_at desc, id);

create table public.rio_note_events (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  note_id uuid not null unique,
  person_id uuid not null references public.rio_person_bindings(person_id),
  actor_subject uuid not null references auth.users(id),
  action text not null check (action = 'CREATED'),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  foreign key (note_id, person_id) references public.rio_notes(id, person_id)
);
create index rio_note_events_person_created_idx on public.rio_note_events (person_id, created_at desc);

-- Supabase default grants vary by project. Remove them explicitly before
-- granting only the two read surfaces and the two authenticated RPCs.
revoke all on table public.rio_person_bindings, public.rio_notes, public.rio_note_events from public, anon, authenticated;
alter table public.rio_person_bindings enable row level security;
alter table public.rio_person_bindings force row level security;
alter table public.rio_notes enable row level security;
alter table public.rio_notes force row level security;
alter table public.rio_note_events enable row level security;
alter table public.rio_note_events force row level security;

create function rio_backend_private.current_person()
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_session text := auth.jwt() ->> 'session_id';
  v_person uuid;
begin
  if v_actor is null or v_session is null or v_session !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;

  -- Confirmation, ban, binding and session state are read from current rows,
  -- never from editable user_metadata or a client-supplied person identifier.
  select b.person_id into v_person
  from public.rio_person_bindings as b
  join auth.users as u on u.id = b.provider_subject
  join auth.sessions as s on s.user_id = u.id and s.id = v_session::uuid
  where b.provider_subject = v_actor
    and b.status = 'ACTIVE'
    and (u.email_confirmed_at is not null or u.phone_confirmed_at is not null)
    and u.is_anonymous is false
    and (u.banned_until is null or u.banned_until <= pg_catalog.clock_timestamp())
    and (s.not_after is null or s.not_after > pg_catalog.clock_timestamp());
  return v_person;
end;
$function$;
revoke all on function rio_backend_private.current_person() from public, anon, authenticated;
grant execute on function rio_backend_private.current_person() to authenticated;

create function public.rio_current_person()
returns uuid language sql security invoker set search_path = ''
as $wrapper$ select rio_backend_private.current_person(); $wrapper$;
revoke all on function public.rio_current_person() from public, anon, authenticated;
grant execute on function public.rio_current_person() to authenticated;

create policy rio_notes_own_read on public.rio_notes
for select to authenticated
using (person_id = (select public.rio_current_person()));
create policy rio_note_events_own_read on public.rio_note_events
for select to authenticated
using (person_id = (select public.rio_current_person()));
grant select on table public.rio_notes, public.rio_note_events to authenticated;

create function rio_backend_private.note_events_append_only()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  raise exception using errcode = '42501', message = 'RIO_EVENT_APPEND_ONLY';
end;
$function$;
revoke all on function rio_backend_private.note_events_append_only() from public, anon, authenticated;
create trigger rio_note_events_append_only
before update or delete on public.rio_note_events
for each row execute function rio_backend_private.note_events_append_only();

create function rio_backend_private.create_note(
  p_client_request_id uuid,
  p_title text,
  p_body text,
  p_consent boolean
)
returns setof public.rio_notes
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_person uuid := public.rio_current_person();
  v_note public.rio_notes%rowtype;
  v_whitespace text := E' \t\n\r\f\v' || U&'\0085\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
begin
  if v_actor is null or v_person is null then
    raise exception using errcode = '28000', message = 'RIO_AUTH_REQUIRED';
  end if;
  if p_consent is distinct from true then
    raise exception using errcode = '42501', message = 'RIO_CONSENT_REQUIRED';
  end if;
  if p_client_request_id is null or p_title is null or p_body is null
    or pg_catalog.char_length(p_title) not between 1 and 120
    or pg_catalog.char_length(p_body) not between 1 and 8000
    or pg_catalog.btrim(p_title, v_whitespace) = ''
    or pg_catalog.btrim(p_body, v_whitespace) = '' then
    raise exception using errcode = '22023', message = 'RIO_INVALID_NOTE';
  end if;

  -- Serialize this person's quota and idempotency checks. Hash collisions
  -- merely serialize unrelated people; they cannot broaden authorization.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_person::text, 0));

  -- Lock the authorization rows while writing. A concurrent revoke/sign-out
  -- orders before this write or waits for its transaction, rather than racing
  -- an unchecked client-supplied identity. Recheck after all possible waits.
  perform b.person_id
  from public.rio_person_bindings as b
  join auth.users as u on u.id = b.provider_subject
  join auth.sessions as s on s.user_id = u.id
  where b.person_id = v_person and u.id = v_actor
    and s.id = (auth.jwt() ->> 'session_id')::uuid
  for share of b, u, s;
  if public.rio_current_person() is distinct from v_person then
    raise exception using errcode = '28000', message = 'RIO_AUTH_REQUIRED';
  end if;

  select n.* into v_note from public.rio_notes as n
  where n.person_id = v_person and n.client_request_id = p_client_request_id;
  if found then
    if v_note.title is distinct from p_title or v_note.body is distinct from p_body then
      raise exception using errcode = '23505', message = 'RIO_REQUEST_CONFLICT';
    end if;
    return next v_note;
    return;
  end if;

  if (select pg_catalog.count(*) from public.rio_notes as n where n.person_id = v_person) >= 500 then
    raise exception using errcode = '54000', message = 'RIO_NOTE_LIMIT';
  end if;
  if (select pg_catalog.count(*) from public.rio_note_events as e
      where e.person_id = v_person
        and e.created_at > pg_catalog.clock_timestamp() - interval '1 minute') >= 30 then
    raise exception using errcode = 'P0001', message = 'RIO_RATE_LIMIT';
  end if;

  insert into public.rio_notes (person_id, title, body, client_request_id)
  values (v_person, p_title, p_body, p_client_request_id)
  returning * into v_note;
  insert into public.rio_note_events (note_id, person_id, actor_subject, action)
  values (v_note.id, v_person, v_actor, 'CREATED');

  -- An expiry during the operation fails the entire statement, including its
  -- note and event. Tests deliberately delay an event insert to cover this.
  if public.rio_current_person() is distinct from v_person then
    raise exception using errcode = '28000', message = 'RIO_AUTH_REQUIRED';
  end if;
  return next v_note;
end;
$function$;
revoke all on function rio_backend_private.create_note(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function rio_backend_private.create_note(uuid, text, text, boolean) to authenticated;

create function public.rio_create_note(p_client_request_id uuid, p_title text, p_body text, p_consent boolean)
returns setof public.rio_notes language sql security invoker set search_path = ''
as $wrapper$
  select * from rio_backend_private.create_note(p_client_request_id, p_title, p_body, p_consent);
$wrapper$;
revoke all on function public.rio_create_note(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.rio_create_note(uuid, text, text, boolean) to authenticated;

comment on table public.rio_person_bindings is 'Administrative application-local mapping only; not canonical PALACO/P.P. issuance or group authority.';
comment on table public.rio_notes is 'Private user-requested notes. No peer chat, AI processing, household-runtime migration or automatic external execution.';
comment on table public.rio_note_events is 'Append-only creation events with server-derived actor and person references. Never store note content here.';

commit;
