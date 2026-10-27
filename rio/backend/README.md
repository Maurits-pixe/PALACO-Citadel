# Mijn RIO — Supabase private workspace

DRAFT. This is a real Supabase Auth/Postgres integration with a first, deliberately small create/list notes surface. It is not operational peer chat, an AI backend, a PALACO identity registry, a P.P. issuer, or an ambassador appointment service. The existing RIO temporary chat, Engine, NOVA gates, HARAM runtime and household database are separate.

## Run the connected application

From the repository root, use Node24 or later:

```sh
npm ci --include=dev --ignore-scripts
node scripts/build-rio-unified-preview.mjs
node --env-file=rio/backend/.env.local rio/backend/server.mjs --port=4201
```

Create the ignored env file from .env.example. Only a real project HTTPS origin and a modern publishable key belong here. No service-role/secret key, database password, access/refresh token or OpenAI key is used by this server. It binds loopback only. The public config endpoint deliberately contains the publishable key; the key identifies the application and grants no private row access.

Open / for RIO and select “Mijn RIO · Nederlands”, or open /rio/account/. The personal workspace is currently Dutch; the entry is translated across the existing12RIO languages. The separate static build contains32explicit public files and no project-specific configuration. On a plain static host the configuration request is unavailable and the account UI remains disconnected, with input disabled. A configured server means the project settings are loaded, not that the user has signed in.

The server gives only account HTML a connect-src policy permitting that exact Supabase project; other documents keep the original self-only policy. It serves fixed hash-verified bytes from memory, exact routes and public config, never a filesystem or API proxy. Read/write/data operations go from the official bundled Supabase SDK directly to that project under the user's token and database RLS. The account page and all API/auth responses are outside both existing RIO worker cache lists.

## First account and contact verification

The email form is for an existing Supabase Auth account. It calls signInWithOtp with shouldCreateUser:false and verifyOtp typeemail. Configure the provider's email OTP template to include {{ .Token }} rather than only a magic link before enabling this flow for a person. Provider email delivery/SMTP and rates must also be configured for that test recipient. The app does not silently enroll an account or mark a supplied email as verified.

Create/enroll the first Auth user through the provider's supported administration flow, have the person confirm ownership, then add the administrative RIO mapping. Example below is a template, not a pre-authorized enrollment; replace the fixture address only in the private administrator session:

```sql
insert into public.rio_person_bindings(person_id, provider_subject)
select gen_random_uuid(), id
from auth.users
where lower(email) = lower('person@example.invalid')
  and email_confirmed_at is not null
  and is_anonymous is false;
```

Inspect the selected subject before admission. person_id is a new application-local reference, not a canonical PALACO-Person-ID or P.P. number; existing identities are not merged. Separate verified Auth subjects need separate mappings. No shared-group membership or rights are inferred. A verified phone account can satisfy the database rule, but this first browser UI provides email OTP only. It does not configure or send SMS.

## Database boundary

The two reviewed migrations are under supabase/migrations. Apply them once to the selected empty test project through the migration workflow; never automatically push a schema on app startup or from CI.

- rio_person_bindings: administrator-managed subject-to-person reference and ACTIVE/REVOKED status. Clients have no table grants and an explicit deny policy.
- rio_notes: private title/body, server timestamp and per-person request UUID. Authenticated clients may select only their own rows; no direct insert/update/delete grants.
- rio_note_events: immutable creation event with server-derived actor, person and note references, without note text. Events and notes commit atomically.
- public.rio_current_person and public.rio_create_note are security-invoker wrappers. Necessary privileged work is confined to rio_backend_private with empty search_path and explicit execute grants. That private schema must remain outside the Data API exposed schema list.

Every private read or write checks current Auth rows, email_confirmed_at ORphone_confirmed_at, not-anonymous status, bans, active binding and ownership of the JWT session_id in auth.sessions. Removed sessions or expired not_after fail closed. New writes lock and recheck relevant rows, including after waits and before returning; they cannot use a client-selected actor or stale browser metadata.

A write requires explicit per-note consent, a nonblank title of1–120 Unicodecodepoints and body of1–8000, max500notes per person and max30new creations/minute per person. Same request UUID+exact payload returns the prior note; changed payload with the same UUID conflicts. There is no automatic retry or import of temporary RIO chat, Engine, household context or AI output. The original note remains on an uncertain network result; retrying the same draft reuses its request UUID.

Storage in this first test surface supports create/list only. Editing, export and deletion are not provided yet; administrators retain access and operational responsibility. This is not end-to-end encryption or a retention policy. Use synthetic test notes until those product/privacy decisions are resolved. Signing out clears tab-private UI and SDK memory and requests local-scope provider signout. Failed network signout is reported; it is not called confirmed revocation. Other devices retain their separate sessions.

## Verification

```sh
# No network or hosted accounts; actual PostgreSQL engine in WASM, single connection:
RIO_TEST_DATABASE_MODE=pglite node --test rio/backend/client.test.mjs rio/backend/test/database.test.mjs

# HTTP checks use actual loopback sockets:
node --test --test-concurrency=1 rio/backend/server.test.mjs

# A fresh, disposable localhost PostgreSQL database named rio_backend_test_*:
RIO_TEST_DATABASE_URL=postgresql://... node --test rio/backend/test/database.test.mjs

# Browser tests: actual bundled SDK, explicitly intercepted synthetic provider:
npx playwright test --config rio/backend/playwright.config.mjs

# Real project HTTPS/Auth availability and anonymous denials, without email or user writes:
node --env-file=rio/backend/.env.local rio/backend/check-connection.mjs
```

PGlite deliberately skips PostgreSQL connection concurrency and statement_timeout cancellation; the draft workflow runs those against an actual PostgreSQL17 service. It must never point at a hosted or existing Auth database: the harness refuses non-loopback URLs, unexpected database names and an existing Auth/RIO schema. Synthetic Auth fixture rows are not real verified people or a hosted provider proof.

A green test or security advisor does not establish a real person's successful email delivery, login or durable save/readback on a second device. Those need an explicitly approved test account and a real user roundtrip. The project check reports authenticatedUserRoundTrip:NOT_TESTED until then. No cloud secrets, real users, email messages, automatic migrations, merge or deploy are used by CI.
