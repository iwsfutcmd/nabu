# 0038. Server event store, sync and optional accounts

- Status: Proposed
- Date: 2026-11-03

## Context

Phase 4 asks for:
- a server event store and sync endpoints;
- optional accounts that "sign up and upload local history";
- server projections identical to the device's (gameplan §14.1–14.3).

The device is already a complete node ([ADR 0037](0037-local-first-app.md)). The server has to:
- accept its log idempotently;
- hand it to the user's other devices;
- agree with it.

## Decision

**Storage** (`apps/api/src/db`).
- Postgres through Drizzle, as §4 decides.
- When `DATABASE_URL` is unset, the API runs on PGlite (Postgres compiled to WASM, in process), in a
  directory or in memory. So `pnpm dev`, the unit tests and the e2e tests need no database server,
  and they run the same SQL.
- Migrations are ordered plain-SQL statements, recorded in `schema_migrations`.
- Tables:
  - `users`;
  - `auth_sessions`;
  - `events`: the §14.3 log, with the client's UUIDv7 `id` as primary key and idempotency key, a
    `seq` bigserial as the sync cursor, and the event as `payload` jsonb.

**No projection tables yet.**
- `GET /v1/state?course=` replays the user's log for that course with core's `replay`, exactly as
  the device does.
- §14.3's `facet_state`, `user_ability` and the rest are caches of that fold. They come with the
  features that need to query across users (leagues, shared item difficulties, nightly FSRS
  fitting).

**Endpoints:**
- `POST /v1/events` takes `{events}`, up to 500 per batch.
  - Each event is validated with Ajv against `schemas/learner-event.schema.json`, the same source
    the client's types are generated from.
  - Events are inserted with `on conflict (id) do nothing`.
  - The response is `{accepted, duplicates, cursor}`.
  - An event stamped with another user's id is refused.
- `GET /v1/events?since=&limit=` returns the user's log in receipt order, by cursor.
- `GET /v1/state?course=` returns the replayed projection (the whole state, not §14.1's deltas,
  for now).

**Accounts, behind our own adapter** (`apps/api/src/accounts.ts`).
- Email and password:
  - scrypt (node:crypto) with a per-user salt;
  - opaque 256-bit bearer tokens, stored as SHA-256 and expiring after 180 days;
  - when the address is unknown, sign-in still hashes, so timing does not reveal which accounts
    exist.
- **Addresses:**
  - NFC;
  - the domain converted to IDNA ASCII, which also lower-cases it;
  - the local part keeps its case and its script (EAI).
- **Passwords:** at least 8 graphemes (`@nabu/core/text`), at most 1 KiB, NFC before hashing.
- Errors are codes (`email-taken`, `wrong-credentials`, …), which the client turns into MF2
  messages.
- **CORS is `*`.** Auth is a bearer header, never a cookie, so another origin gains nothing.
- §4 names Better Auth. The interface (`Accounts`: sign up, sign in, sign out, user of a token)
  is what it would sit behind. Swapping it in is a contained change once OAuth, email
  verification or passkeys are needed.

**Client sync** (`apps/web/src/store.ts`, `sync.ts`).
- The IndexedDB log gains an **outbox** of event ids the server has not acknowledged.
  - Every event recorded on the device enters it, with or without an account. Signing up later is
    therefore an ordinary sync of the whole history.
  - Events pulled from the server skip it.
  - Version-1 logs migrate into it.
- **A sync pass:**
  1. Upload the outbox oldest first, in batches of 200, acknowledging each batch.
  2. Pull other devices' events by cursor.
  3. For each course touched, compare the server's projection with the device's own replay, using
     canonical JSON with sorted keys. The client checks; the server stays authoritative (§14.2).
- **When it runs:** after an event is recorded (debounced), on `online`, every minute while
  anything is pending, and on start.
- **Where the server comes from:** `VITE_NABU_API` at build time, or `?api=`. Without one there is
  no account UI and nothing leaves the device. The Pages demo is local-only.

**Acceptance** (`apps/web/tests/e2e/sync.spec.ts`, against the real API on PGlite):
- Three sessions with no account and no network, then sign-up: the server's projection equals the
  device's replay, byte for byte in canonical JSON.
- With the server unreachable, the outbox survives a reload and drains when the server is back.
- Duplicate and overlapping uploads change nothing (`apps/api/test/sync.test.ts`).

## Consequences

- One user's projection costs a replay of their log for that course. That is cheap for months of
  practice. Projection tables can be added later without changing the API.
- Signing out keeps the local log. If a different user then signs in on the same device, events
  still in the outbox go to them. Per-account outboxes come with multi-profile devices.
- Not yet built: rate limiting, account deletion and export endpoints (§14.4), and email
  verification.
