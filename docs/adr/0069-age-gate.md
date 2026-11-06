# 0069. An optional age gate at sign-up

- Status: Proposed
- Date: 2026-11-06
- Amends: [0038](0038-server-sync-and-accounts.md)

## Context

Gameplan §14.4: "Deployments that may serve minors get an age gate." Laws on children's data set
different ages by place (13 under COPPA in the United States; 13 to 16 under the GDPR, by country),
and an instance's operator knows where it serves; the code does not.

What needs the gate is an account. Without one, nothing leaves the device (ADR 0038): the event
log, the progress and the settings stay in the browser. So a gate at sign-up covers what the
server would keep, and turning someone away never stops them from learning.

## Decision

**Off unless the instance sets `NABU_MIN_AGE`** (whole years, 1 to 150). Then:
- **The server asks.** `POST /v1/auth/sign-up` without an `age` answers `400 age-required`. Asking
  costs no sign-up attempt; answering does, like any sign-up, so the abuse limit (ADR 0067) also
  limits guessing.
- **The server decides,** from a whole number of years: below the minimum, `403 age`, and no
  account. A value that is not a whole number from 0 to 150 is `400 invalid-request`.
- **The server keeps nothing of the answer:** no age, no birth date, no "under age" flag, in the
  database or the logs. Sign-in is never gated.

**The question is neutral** (the FTC's advice for age screens): the app asks "How old are you?",
never shows the minimum, and never says why it turned someone away.

**The answer is an age, not a birth date.** An age is the same in every calendar, while a birth
date would need the Persian, Hijri and other calendars learners use, and is more than the check
needs.
- **Any script's digits:** the field takes digits from a Persian or Arabic keyboard, Devanagari,
  fullwidth and every other Unicode decimal set (`parseDigits` in `@nabu/i18n`). A number written
  with digits from two sets is refused.

**The device remembers a refusal,** per server, so changing the answer is not one tap away. It then
shows only that this server cannot create an account, and that learning here goes on. Signing in
to an existing account is still offered.

## Consequences

- **Operators choose the age** in `deploy/.env` (`NABU_MIN_AGE`); `deploy/README.md` says the right
  one depends on where the instance serves.
- **An age screen is a self-declaration.** It records nothing, so it proves nothing: an instance
  meant for children needs consent from a parent, which this does not attempt.
- **The remembered refusal** lives in the device's storage; clearing site data clears it.
- **The e2e suite plays a gated server's answers** (the shared e2e API has no gate); the API tests
  cover the server's side.
