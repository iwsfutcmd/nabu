# 0115. A report says where it goes, and the device says what came of it

- Status: Proposed
- Date: 2026-11-12

## Context

Learners report problems: corrections to sentences, story lines and words
([ADR 0051](0051-corrections.md), [ADR 0057](0057-word-corrections.md)), and claims about how an
answer was graded ([ADR 0052](0052-learner-claims.md)). A report leaves the device through the
deployment's intake ([ADR 0055](0055-report-intake.md)), through an account's sync to its server's
review queue ([ADR 0074](0074-review-workspace.md)), or not at all.

The 2026-11 review (M2) found two problems:
- **An untrue confirmation.** "A reviewer will look at your answer too" showed every time, even
  where the report never leaves the device (no `reports.json`, no account).
- **Nothing comes back.** No route gives a report's status, and "You suggested a correction" stayed
  on an item for good, even after the course took the fix up.

Contributors who never hear back stop contributing. A status route would need the server to know
whose reports are whose. The intake carries no device, user or session id, by design, and most
learners have no account.

## Decision

**The confirmation says where the report goes** (`useReportsReach`, apps/web/src/reports.ts).
- **To the reviewers.** The deployment has an intake, or the learner has an account (its server
  files every report it takes in its review queue): "A reviewer will look at your answer too", "A
  reviewer will check your correction", as before.
- **To them once the learner signs in.** No intake and no account, but the app has a server: the
  report waits in the outbox, and signing in or up uploads it. "A reviewer will see your report once
  you sign in."
- **Nowhere.** Neither (or the server's age gate turned the person away, [ADR 0069](0069-age-gate.md)):
  "Your report stays on this device: no reviewer will see it." A claim still counts for the learner,
  as before.

**The device says what came of a report, by the bundle it has** (pure, @nabu/core). Nothing new
leaves the device, and no server is asked.
- **A correction** (`correctionStatus`, @nabu/core/corrections) is compared field by field with the
  item as the course has it now:
  - *in the course* (`adopted`): every field it changed reads as the learner suggested;
  - *pending*: every field it changed still reads as the learner saw it;
  - *changed*: the course changed those fields some other way since (for a note alone: the item
    reads otherwise than the learner saw it);
  - *gone*: the course no longer has the item.

  Texts compare as written (NFC). Where the learner changed letters, the vowel marks the profile
  lists (`match.marks`) are left out on both sides, as `nabu corrections apply` compares: the source
  has the letters, and the vocalization adds the marks ([ADR 0053](0053-vocalization.md)). A change of
  marks alone compares with the marks. Readings compare by the word's place and the scheme. A
  translation in another support language than the course's is left out.
- **A claim** (`claimStatus`, @nabu/core/reports) is graded again, with the course's grader, against
  the accept set it was graded against:
  - into the target language (translate-type, translate-tap.l1-l2): the form's `reverse`;
  - into the support language (translate-tap.l2-l1): the translation's accept set;
  - written down from a clip (listen-type, listen-tap): the sentence itself.

  A claim that the answer should have been accepted is *accepted* once the grader accepts it; one that
  it should have been wrong is *rejected* once the grader marks it wrong. Some claims are *unchecked*,
  with no status shown: a choice (graded by its place among the options), a filled blank (the claim
  holds the blank's text alone), a story question (no accept set), and "I said it right" (about the
  scoring, not the course).
- **The list** (`reportsOf`): a course's reports newest first, the latest correction of each item
  and each claim once.

**Where it shows.**
- **The sentence list** (and the match-pairs chooser) marks a correction the course took up "In the
  course now. Thank you!", and one it changed some other way "Changed since your correction".
  - Only a pending correction offers "Change your correction" and starts the form; otherwise a new
    correction starts from what the course has now.
  - The download holds the pending corrections only: the others have nothing left to apply.
- **Your reports** (`#/<course>/<orthography>/reports`, @nabu/ui/corrections `ReportList`).
  - Each report: what it is about, as the course has it now; what the learner suggested or answered,
    in its own language through `<T>`; when; and what came of it.
  - At the top, where reports go from this device now.
  - The course page links to it beside "Check the sentences", once there is a report, with how many
    the course took up ("2 in the course now").

## Consequences

- **News comes with a bundle.** A learner hears back when the course they have changes (an app
  update, a course download), not when a reviewer decides. A rejection in the review queue never
  shows.
- **A fix made otherwise reads as changed.** A correction a reviewer applied differently reads as
  changed, not taken up, and invites another look.
- **Where a report went is said for reports made now.** Your reports does not say, report by report,
  whether one reached anyone. A report made before the deployment had an intake never went there;
  with an account, every report syncs.
- **Unchecked claims.** Claims on choice cards, filled blanks, story questions and speech have no
  status. A status route for accounts could give them one later, as could a filled blank's claim
  holding its whole sentence.
- **Visual matrix.** The sentence list's badge says more, and Corrections › Your reports is a new
  story in the corrections matrix.
