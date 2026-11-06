# 0071. Signing off content: in the app, applied to the source

- Status: Proposed
- Date: 2026-11-06
- Amends: [0051](0051-corrections.md), [0060](0060-audio-check.md)

## Context

Phase 13 asks for sign-off: a reviewer moves content from draft to reviewed, with their
provenance, in the browser. Every fixture course is an `llm:` draft, and so far the only way to
mark an item reviewed was to edit its unit file by hand. The audio check (ADR 0060) already shows
a way that needs no reviewer accounts: judge in the app, download a file, apply it with the CLI.

## Decision

**Sign-off lives in the sentence list,** beside "This is wrong" (ADR 0051), for reviewers only
(debug mode, `?debug=1`):
- **Per sentence:** "Looks right", a toggle.
- **Per story:** "The whole story looks right". A story's provenance is the story's, so its lines
  are signed off together.
- **Per unit:** "Sign off everything here" signs off every item the reviewer has not marked
  incorrect and the source does not mark reviewed already. Reviewed items show a badge instead.

**What was seen is pinned.** Each sign-off carries `shown`, the sha256 of `signoffText`
(@nabu/core/corrections): every orthography's form and every translation, as compiled (vowel
marks and all), one tab-separated line each. A story's text is its lines, in order; its questions
are not content to sign off. `pipeline/src/nabu/review` builds the same text from its own compile
of the course, and the tests pin one sentence's text on both sides.

**The file:** sign-offs stay on the device (localStorage) and download as
`nabu-signoffs-<course>.json` (schemas/signoffs.schema.json).

**`nabu review apply <course> <file> --reviewer human:<id>`** compiles the course, then for each
sign-off:
- **Item gone, or changed since:** skipped, with the reason. A sign-off never lands on text the
  reviewer did not read.
- **Reviewed already:** counted, and left alone.
- **Otherwise:** the item's provenance becomes `{author, status: reviewed, reviewedBy,
  reviewedAt}`, in place in its unit file. An item without a `provenance:` gets a line after its
  `id:`, with the author it inherited from the course. `reviewedAt` is the day of the sign-off, in
  UTC.

The course must still compile afterwards, or the command fails.

## Consequences

- **A reviewer needs no account and no server:** the hosted demo with `?debug=1` is enough. The
  review workspace for reviewer accounts (Phase 13) can produce the same file.
- **Words (KCs) have no provenance of their own** yet, so they are not signed off; images keep
  theirs.
- **A release build** (Phase 13) can now leave out what is not reviewed.
