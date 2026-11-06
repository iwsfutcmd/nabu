# 0067. A learner's data on the server, and abuse limits

- Status: Proposed
- Date: 2026-11-06
- Amends: [0038](0038-server-sync-and-accounts.md)

## Context

Phase 11 (docs/next-steps.md) asks for privacy (§14.4) and abuse limits (§14.5) before anyone runs
an instance for others:
- **A learner could not get their server data**, only the device's log ("Export progress").
- **A learner could not delete their account.**
- **Nothing limited sign-up, sign-in or uploads:** a script could create accounts, try passwords
  or fill the event store as fast as the server answered.

## Decision

**`GET /v1/export`** returns everything the account holds as one JSON file:
- the account, its profile and the whole event log;
- each course's projection (as `/v1/state`), and the game state;
- league memberships and results;
- reminder registrations, counted by platform (the endpoints and tokens are left out).

What the learner filed for review carries only a salted hash of their id, the subject (ADR 0045).
The export finds it through that: their reports, corrections, explanation ratings and AI usage.

**`DELETE /v1/account`** deletes the account. It asks for the password again, as a stolen session
must not be enough.
- **The user row:** it takes its sessions, events, profile, league rows and push registrations
  with it, by cascade.
- **Through the subject:** the learner's votes on reports and corrections go. So does a pending
  report or correction no one else backs, since it holds their words. One a reviewer already
  decided stays, no longer linked to anyone. Their explanation ratings and AI usage go too.
- **Shared aggregates recompute:** a league's standings come from its members, and a report's
  agreement count from its votes.
- **The device keeps its own log:** the app forgets the session, as signing out does.

**Abuse limits,** a fixed window per key, in memory (one API process serves an instance):

| What | Key | Default |
|---|---|---|
| Sign-up | client address | 5 an hour |
| Sign-in | client address, and the account | 10 per 15 minutes each |
| Event uploads | user | 120 a minute |

- **Over a limit:** 429 with `Retry-After`; the app says to wait.
- **The client address:** the socket's, or with `NABU_TRUST_PROXY=1` the first `X-Forwarded-For`
  entry (only behind a proxy the instance runs, as anyone can send the header).
- **Settings:** `NABU_RATE_LIMITS=off`, or `NABU_RATE_LIMIT_SIGN_UP|SIGN_IN|EVENTS=<max>/<seconds>`.
  The e2e suite turns them off; the API tests check them.

**In the app,** the account section gains "Your account's data":
- "Download my account data" saves the export.
- "Delete my account" opens a form that says what goes and what stays, and asks for the password.

## Consequences

- **A learner can take their data and leave.** Nothing that names them stays on the server.
- **One process, one memory:** limits reset on restart, and several API processes would each
  count alone. A shared store (Postgres or Redis) waits until an instance needs more than one.
- **An age gate** (§14.4, optional) is still to do.
