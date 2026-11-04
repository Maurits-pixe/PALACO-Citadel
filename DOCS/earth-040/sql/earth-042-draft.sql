-- EARTH-042 · draft migration; NOT APPLIED
-- Public reads of published objects; all writes restricted to service role.
create table if not exists public.earth_world_objects (
 id uuid primary key default gen_random_uuid(),
 world_id text not null check (world_id = 'W-0001'),
 object_key text not null unique check (object_key ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
 title text not null check (char_length(title) between 1 and 160),
 region text not null check (region in ('Nature','Humanity','Knowledge','Peace')),
 geometry jsonb,
 payload jsonb not null default '{}'::jsonb,
 version bigint not null default 1 check (version > 0),
 published boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.earth_world_events (
 event_id uuid primary key default gen_random_uuid(),
 object_id uuid not null references public.earth_world_objects(id),
 event_key text not null unique,
 version bigint not null check (version > 0),
 actor_ref text not null,
 authorization_ref text not null,
 previous_digest text,
 payload_digest text not null,
 recorded_at timestamptz not null default now(),
 unique(object_id,version)
);
create or replace function public.earth_events_immutable() returns trigger language plpgsql as $$
begin raise exception 'EARTH audit events are append-only'; end $$;
drop trigger if exists earth_events_no_update on public.earth_world_events;
create trigger earth_events_no_update before update or delete on public.earth_world_events
for each row execute function public.earth_events_immutable();
alter table public.earth_world_objects enable row level security;
alter table public.earth_world_events enable row level security;
revoke all on public.earth_world_objects from anon, authenticated;
revoke all on public.earth_world_events from anon, authenticated;
grant select on public.earth_world_objects to anon, authenticated;
create policy earth_published_read on public.earth_world_objects for select to anon, authenticated using (published = true);
-- No INSERT/UPDATE/DELETE policies. No direct event-table access.
-- Service-role write procedures, authorization checks, digest chaining,
-- idempotent transactions, and revocation verification MUST be built and
-- independently tested before any mutation runtime is enabled.
