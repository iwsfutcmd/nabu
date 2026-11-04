# 0053. A course's vocalization gives its words their vowel marks

- Status: Proposed
- Date: 2026-11-04

## Context

The gameplan (§6.6) stores Arabic-script text fully vocalized and derives the plain form by
stripping a profile's mark set. The player's "Show vowel marks" toggle does that stripping.

The fixture courses were written without vowel marks ([errata 26](../gameplan-errata.md)):
- fa writes only the ezafe kasra and two tanwins;
- apc writes the shadda, and its stories are vocalized.

So the toggle did nothing for Persian lessons and little for Levantine ones. Writing the marks
into every sentence by hand would mean editing each word every time it appears, and a single
spelling convention (say, whether و for short *o* takes a damma) would be scattered across
hundreds of lines.

## Decision

**A course can list vocalization files (`vocalization:` in course.yaml).** Each file, or an
inline entry, is a `VocalizationSource` (`schemas/course-source.schema.json`):
- `orthography`, `license`, `provenance`;
- `words`: each written word (the letters, and any marks the source writes) and its vocalized form;
- `ambiguous`: words with several vocalizations (fa نه "no" and "nine"; apc كيفك *kifak* and
  *kifik*), with the candidates;
- `uncertain`: words a reviewer should check first. These still have a best guess in `words`.

**The compiler marks every word token (stage 2, `mark_vowels`).**
- **Where the marks come from.** A token's own `vocalized` comes first; otherwise the
  vocalization's entry for its surface.
- **Words with marks of their own.** A word written with some marks keeps them. Each letter
  takes the vocalization's marks, unless it already has marks they do not include: an ezafe's
  kasra stays, and a lone shadda gives way to fatha + shadda.
- **Ambiguous words** stay as written unless their token gives `vocalized`
  (`vocalization.ambiguous`, a warning). Drill sentences, which have no tokens to annotate, stay
  quiet.
- **The letters must not change.** A vocalized form whose letters, without marks, are not the
  word's is an error (`vocalization.mismatch`).
- **Morphs.** Morphs are cut where their letters are, each keeping its letters' marks.
- **KC forms.** KC forms (the glossary and word cards) are marked the same way.

The marks set is the orthography profile's `match.marks`, the same set grading ignores and the
toggle strips.

**Everything that compares text compares the letters.**
- **Grading.** Grading already folds the marks (`policy: ignore`).
- **Glossary.** The glossary's folded pass already finds a word whose marks differ from its
  entry's.
- **Credit.** Per-word credit on a wrong typed answer now strips the marks from both sides.
  The accept sets are written without marks.
- **Voices.** Voices read each sentence as its source writes it: the compiler keeps the written
  surfaces (`Compiled.written`) for the audio planner. Adding a vocalization leaves every clip,
  its identity and its round-trip check as they were.
- **Corrections.** `nabu corrections apply` checks `shown` against the source by letters. In an
  unvocalized source it writes a correction's letters only, and asks the reviewer to check the
  marks the learner wrote. A correction that only changes marks is listed for a person: it
  belongs in the vocalization or a token's `vocalized`.

**The fixture courses get LLM-drafted vocalizations** (`courses/fa/vocalization.yaml`,
`courses/apc/vocalization.yaml`, provenance `llm:claude@vocalization-v1`, status draft):
- **fa:** formal written Persian, no sukun. The ambiguous نه is pinned on its 11 "no" tokens.
- **apc:** Beirut speech, following the course's Arabizi. It uses sukun on every vowelless
  consonant, as the stories do. The four ambiguous second-person forms are pinned on their tokens.

Their open questions are in `courses/REVIEW.md`.

## Consequences

- "Show vowel marks" works throughout the fa and apc lessons, stories and word cards. Turning it
  off shows the letters alone, as before.
- **Errata 26 is resolved for the fixture courses.** The vocalizations are drafts, though, and
  the marks a learner sees are only as good as their review.
- **A new word needs an entry** (or a token's `vocalized`), or it is shown unmarked. Nothing
  fails: a missing entry is silent, because many words (آب, وين) have no short vowels to mark.
- **Audio does not yet use the marks.** §10.1's "synthesize from fully vocalized text" would mean
  regenerating the fa clips from the vocalized forms and re-running the round-trip check, after
  the vocalization is reviewed. That is a separate decision.
- **A pronunciation exercise can now use the data.** The gameplan's `vocalize` template (§8.2)
  asks the learner to supply the marks.
