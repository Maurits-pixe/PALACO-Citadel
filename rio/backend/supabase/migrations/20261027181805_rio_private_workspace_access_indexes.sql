begin;
create policy rio_bindings_no_client_access on public.rio_person_bindings as restrictive for all to anon, authenticated using (false) with check (false);
create index rio_note_events_actor_subject_idx on public.rio_note_events (actor_subject);
create index rio_note_events_note_person_idx on public.rio_note_events (note_id, person_id);
commit;
