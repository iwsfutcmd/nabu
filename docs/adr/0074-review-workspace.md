# 0074. The review workspace: reviewer accounts, in the app

- Status: Proposed
- Date: 2026-11-06
- Amends: [0045](0045-ai-services.md), [0051](0051-corrections.md), [0072](0072-sign-off.md)

## Context

Phase 13 asks for a review workspace for reviewer accounts:
- items by course and status;
- the source beside the compiled forms;
- audio playback and accept-set edits;
- the report queue.

Until now reviewers worked without accounts. They signed off in the sentence list in debug mode
and downloaded a file (ADR 0072). The report and correction queues had only an API, behind one
shared admin token (`/admin/v1`), with no screen.

## Decision

**Reviewers are accounts with a role.** An instance's admin grants it to an existing account:
`PUT /admin/v1/reviewers {email, handle, courses}`.
- **The handle** is the name provenance records (`human:<handle>`). It is NFC, made of letters and
  digits in any script plus `.`, `_` and `-`, and unique on the server.
- **Courses** are course ids, or `["*"]` for every course.
- **Revoking** (`DELETE /admin/v1/reviewers/:handle`) keeps the reviewer's sign-offs, under the
  handle they were made with. Giving a reviewer a new handle moves their unapplied sign-offs to it.

The shared admin token stays, for the instance's admin and the CLIs.

**The workspace is in the app,** at `#/review`. The course list links to it for reviewer accounts.
For each course a reviewer reviews (`/v1/review/*`; every route checks the course is theirs):
- **Sentences and stories:** the sentence list (ADR 0051). Each item has:
  - its clip;
  - its accept sets: each orthography's `reverse`, and the translation's, each line through `<T>`
    in its own language;
  - a field to accept one more answer in the reviewer's orthography.

  The field never submits on Enter, so IME composition is safe. An accepted answer is filed in
  the report queue as approved (template `translate-type.l1-l2`, no learner vote), so
  `nabu reports promote` adds it to the `reverse` accept set like any approved report.
- **Sign-off,** per sentence, story or unit as in ADR 0072, now kept on the server per account.
  The admin exports the sign-offs (`GET /admin/v1/signoffs`, one file per course and reviewer), and
  `nabu review apply` takes the export as it is: each file names its reviewer, so `--reviewer` is
  needed only for a device's own file. It refuses a `--reviewer` that contradicts the file.
- **Reports:** answers learners say should or should not count, with the sentence they answer, and
  corrections with what they change. The reviewer approves or rejects them. Promoting and applying
  stay with the CLIs, which edit the source and check it compiles.

**Privacy.** The role and unapplied sign-offs are in the account's export and go with the account
(ADR 0067). Accepted answers a reviewer adds are not linked to them: provenance names reviewers
only where they sign off.

## Consequences

- **Review needs no access to the repository.** A native speaker with an account reviews in the
  browser; whoever maintains the course runs `nabu review apply` and `nabu reports promote` on
  the exports, as before.
- **The debug-mode sign-off and its file stay,** for reviewing with no server (the hosted demo).
- **Not yet:**
  - The source YAML is not shown beside the compiled forms. The workspace shows what learners
    see, and the CLIs report anything that changed since.
  - An accepted answer goes through promote. It is not written into the source from the browser,
    because the source lives in git.
