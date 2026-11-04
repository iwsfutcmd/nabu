# 0055. Reports reach reviewers as GitHub issues, through a Firestore intake

- Status: Proposed
- Date: 2026-11-04

## Context

Learners report problems in the app:
- corrections to sentences and story lines ([ADR 0051](0051-corrections.md));
- claims that an answer should have been accepted, or should have been wrong
  ([ADR 0052](0052-learner-claims.md)).

Until now a report left the device only through an account on an API server. The public demo
has no server, so reports stayed in the browser unless someone exported the log by hand, and
the project's maintainer had to upload that file to look them over.

What reviewers need is a place that collects reports from every device automatically, where
people and coding agents can read them, discuss them and close them. The intake also has to run
without hosting the API.

## Decision

**The app sends each report to an intake, and a scheduled job files it as a GitHub issue.**

- **The intake is a Firestore collection** (`nabu_reports`) in a Firebase project the
  deployment names in `reports.json` beside the app: `{"firestore": {"project", "apiKey"}}`.
  The Pages build writes the file from repository variables; without it, nothing is sent.
- **What is sent: the submission** (`schemas/report.schema.json`, @nabu/core/reports
  `submissionOf`).
  - It has the event's id, course, orthography, support language and bundle, and only the local
    date.
  - A correction keeps what was shown and what changed; a claim keeps its item, template, text
    and kind (`accept` or `reject`).
  - It carries no device, user or session id.
- **How it is sent.** One document per report, named by the event's id. A retry cannot
  duplicate it: 409 means it is already there.
  - Sends that fail wait on the device (localStorage) and go when the browser is online again.
  - A refusal for good (a 4xx other than 408 or 429) is dropped. The report is still in the
    device's log.
- **Security rules** allow only creating a well-formed, bounded document. Reading, changing and
  deleting are left to the job's service account.
- **The Reports workflow** runs every 30 minutes (`apps/api/scripts/file-reports.ts`,
  `apps/api/src/report-issues.ts`).
  - It signs in as a service account (an RS256 JWT bearer grant; no SDK) and reads up to 50 new
    reports.
  - It validates each against the schema, and marks a malformed one `rejected` with the reason.
  - It files one issue per sentence or story line: the first report opens it, and later ones are
    comments. A closed issue is reopened, and the issue number is kept in
    `nabu_report_issues`.
  - It marks each report `filed`. Issues are written with the workflow's own `GITHUB_TOKEN`.
- **What an issue holds.** The item as the current bundle has it: each orthography, the
  translation and the accept sets. Then each report:
  - learner text in code spans, so it cannot mention, link or inject markup;
  - language data isolated with FSI/PDI, so right-to-left text reads correctly;
  - for a correction, the row `nabu corrections apply` reads.
- **The app says reports are public** where one is made, only when an intake is configured.

## Consequences

- **Where reviewers work.** They review in GitHub: labels per course and kind, one thread per
  sentence. A coding agent can read the same issues.
- **Reports are public.** No name or device goes with them, but learners' text does, and the
  app says so.
- **Spam.** Anyone can write well-formed junk into the intake. The schema check, the size
  bounds and labels contain it; App Check and rules-based rate limits are the next steps if
  needed.
- **Pace.** Filing runs on a schedule, so an issue appears within about half an hour (GitHub may
  delay scheduled runs).
- **Hosting.** A deployment with an API server keeps its review queues (`/admin/v1`). The two
  paths are independent, and neither needs the other.
- **Not yet:** turning issues back into rows automatically (`nabu corrections apply` from
  issues), App Check, and an intake for the native apps, which ship without `reports.json`.
