# 0123. A server's sign-out is said, a password cannot be reset, and a new account takes the whole log

- Status: Proposed
- Date: 2026-11-13
- Amends: [0038](0038-server-sync-and-accounts.md) (what signing up uploads, what the sync status
  says) and [0108](0108-uploads-sessions-stopped-placement.md) (what signing up sends again)

## Context

The 2026-11 review (S9) found four ways an account let a learner down without saying so.

- **A silent sign-out.** On a 401 (the session expires after 180 days, or the account was deleted
  on another device) the device dropped the account. "You've been signed out" never rendered: Your
  progress showed the account form, as if there had never been an account. Progress stopped syncing,
  and nothing said so.
- **No recovery.** There was no "Forgot password". An instance sends no email, so there is nothing
  to build a reset on: no way to prove a learner owns an address.
- **A new account lacked the history.** Signing up uploaded the outbox. After a deletion the
  device's log is all acknowledged, so a new account got only what was recorded since, despite
  "Everything you've done so far comes with you". Device and server then diverged; the check said
  they differed, not why.
- **Offline for a server that is down.** A request with no answer was "Offline", so a learner whose
  server was down was told to check a connection that worked.

## Decision

**A sign-out by the server is said, and stays said** (`apps/web/src/sync.ts`, `Progress.tsx`).
- A 401 `unauthorized` from a sync pass, the account's download or its deletion ends the session on
  the device as signing out does: the session, the pull cursor and the last check go; the log stays.
- The device remembers who was signed in (meta `signed-out`: the server and the address). Home says
  so at its top, across reloads: "You've been signed out of {address}. Your progress stays on this
  device, and syncs again when you sign in."
  - **Sign in again** moves focus to the password of the form under Your progress. The form opens
    on sign-in (it turns back if the learner switched it), with the address filled in and "You've
    been signed out. Sign in again to keep syncing." above it.
  - **Stay signed out** forgets who it was. The form goes back to creating an account.
- Signing in or up forgets it too. A sign-out remembered for another server than the build's is not
  shown.
- A pass under way as the learner signed out gets a 401 for the token they gave up. It never ends
  the session they started since.
- The server answers an expired session and a deleted account alike, so the notice names neither.
  Signing in to a deleted account fails as wrong credentials; Stay signed out, or a new account,
  settles it.

**A password cannot be reset, and the app says so.**
- The sign-in form's **Forgot your password?** says it plainly: the server can't reset passwords,
  as it sends no email. Then what is left: progress stays on the device, and a new account with
  another address takes everything on it (below).
- The old account stays on the server, and only its password deletes it (§14.4). Until an operator
  route exists, only an operator with database access can remove it.
- An instance that sends email can add a reset behind the `Accounts` adapter (ADR 0038 names Better
  Auth for email verification). The form would then offer it in place of the note.

**A new account takes the device's whole log.**
- Signing up puts every event of the log back into the outbox and sets none aside
  (`EventStore.requeue`); the first pass uploads it. A new account after a deletion or a forgotten
  password holds everything this device holds, and the check agrees.
- Signing in still sends the outbox, and what was set aside (ADR 0108). The account already has
  what the device sent it, and what the device recorded while signed out is in the outbox.
- Events another account's server stamped with its user (the judge's revisions) are rejected by the
  new one as `foreign-event`. They are set aside (ADR 0108): kept on the device, where they still
  count, and said.

**No network is not a server that does not answer.**
- A request with no answer is `offline` when the browser knows it has no network
  (`navigator.onLine` false), else `unreachable`. A proxy's 502, 503 or 504 is `unreachable` too.
- The sync status says "Offline. N updates will upload when you're back online." or "Can't reach
  the server right now. N updates will upload when it's back." (`data-sync-status` `offline` or
  `unreachable`). The account forms and the profile say "You're offline. Connect to the internet,
  then try again." or "Can't reach the server right now. Try again later."
- Either way the outbox waits, and asks for a Background Sync.
- `navigator.onLine` true promises no route to the server (a captive portal, Wi-Fi with no
  internet). Those read as unreachable, which is still true.

## Consequences

- A learner whose session ends is told the next time they open the app (Home is its start page),
  and until they act. The course page does not repeat it.
- A device holds one learner's log, as ADR 0038 assumed. A new account made on it takes all of it,
  what an earlier account's other devices sent it too. Someone else on the device should use their
  own browser profile. Per-account logs still wait for multi-profile devices.
- A new account receives the history now. As at a first sign-up, days older than the 72-hour grace
  window count for its XP but not its streak (§12.2, ADR 0047), on the server and the device alike.
- A long history goes up 200 events a request, within the upload limit (120 requests a minute). A
  longer one waits a minute where the limit stops it; the status meanwhile counts what waits.
- `app.error.account.unreachable` lost "Check your connection": its draft translations are stale
  until a reviewer checks them again.
- No API change: no table, route or migration.
