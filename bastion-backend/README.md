# Bastion local demo API

This is an isolated API prototype for the fictional task data shown by Bastion. It is **not**
connected to the static `/citadel/bastion/` UI, the separate PostgreSQL Bastion prototype, or a
real calendar. It has no user authentication, identity verification, authorization service, secure
messaging, or production deployment configuration. CORS is a browser policy, not authentication.
Do not expose this service to a network or enter real or sensitive data.

The API demonstrates only local SQLite persistence and a short-lived, server-created, single-use
demo ticket for `COMPLETE` and `ESCALATE`. `acceptedAt` records the server time at which the
transaction accepted the demo operation. It does not prove the transaction commit completed before
ticket expiry or establish D-013 compliance. A response lost after commit has an unknown outcome;
check `GET /api/tasks` before taking any further action.

## Setup

From the repository root, generate a local certificate pair trusted by the test browser:

```sh
mkcert -install
mkcert -cert-file bastion-backend/localhost.pem \
  -key-file bastion-backend/localhost-key.pem localhost 127.0.0.1 ::1
```

Then install and start the isolated package:

```sh
npm ci --prefix bastion-backend
npm --prefix bastion-backend test
npm --prefix bastion-backend start
```

The server binds only to `127.0.0.1:3005` and requires the certificate files above. To change
allowed browser origins, set `ALLOWED_ORIGINS` to a comma-separated list of exact origins, for
example `https://localhost:5173,https://localhost:5175`. The default allows those two local
origins. This setting does not restrict non-browser clients; loopback binding is not an identity
or authorization boundary.

The SQLite database is created beside this README with WAL journaling and `synchronous=FULL`.
Database and certificate files are ignored by Git. Seed records are fictional.

## API

- `GET /health` — reports `demo-only`.
- `GET /api/tasks` — returns synthetic tasks.
- `POST /api/mutations/prepare` — accepts `COMPLETE` or `ESCALATE` with `{ "taskId": <positive integer> }` and returns a ticket valid for 30 seconds.
- `POST /api/mutations/execute` — accepts `{ "ticketId": "<uuid>" }`, serializes the single-use operation in an SQLite immediate transaction, and rejects expired tickets without changing a task.

The fixed `local-demo` ticket owner is not a real user identity. The backend is not wired to the
launcher metadata endpoint, and the static Bastion frontend remains local-only until separately
integrated and reviewed.
