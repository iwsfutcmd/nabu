# 0095. Pronunciation cards ask about a word in its sentence; an orthography that spells the vowels counts

- Status: Proposed
- Date: 2026-11-12
- Amends: [0054](0054-pronunciation-exercises.md) (what the cards show, how lessons get them)

## Context

ADR 0054's `vocalize` and `transcribe` cards were word cards, built from a KC's form, and only the
Phase-3 lesson builder made them. The planner never added them (its candidates left out the KC
templates), so no learner saw one. The 2026-11 review found this (C1).

The owner asked for two things:
- **Test the words in context.** Which vowels an Arabic word takes, and how a Han character is read,
  often depends on the sentence: a word alone leaves both open.
- **In Lebanese Arabic, Arabizi is a vocalization.** Arabizi writes the vowels that the Arabic
  script leaves out, so writing the word in Arabizi shows the same knowledge.

## Decision

**Both cards are sentence templates.**
- **`vocalize`** shows the sentence without vowel marks, one word marked. The field starts from that
  word's letters; the learner writes its marks in.
- **`transcribe`** shows the sentence without ruby, one word marked. The learner types that word's
  reading.
- Both show the sentence's translation under it.
- **The word asked about** is the first word the lesson introduces among those that qualify (marks
  to supply; a pinned reading), else the sentence's last. For `vocalize`, words with a spelling in
  another orthography (below) come first. `word` is its token in the prompt.
- **Credit.** Only the asked word's KCs (its sense and morphs) are credited, on `read-script`; the
  rest of the sentence is given, as in a gap-fill. "Recognized before read" applies to the asked
  word alone.
- **Marking.** `<T emphasis>` marks the word in the focus style (never the style of a wrong answer),
  as a `<mark>`.

**Lessons get one.** A lesson plans one pronunciation card where the course can make one: at most one
of each a session. When the plan is full, the card takes the place of the last card that no new
word depends on. For a learner who has done the earlier lessons:

| Course | Lessons with a card |
|---|---|
| fa | 60 of 61 |
| apc-Arab | 99 of 99 |
| yue | 58 of 59 |
| hbo | 90 of 90 |

lzh gets none, since its facets rule out `read-script`. Mistakes rebuild the card from its sentence.

**Only marks that ordinary writing leaves out** get a `vocalize` card: an orthography whose profile
ignores its marks in answers (`marks.policy: ignore`: the abjads fa, apc, ar and hbo). Accents and
breathings that are part of the spelling (es, grc: `accept-with-note`) get none, as ADR 0054 meant:
alphabets write their vowels.

**An orthography that spells the vowels** (`match.marks.spelledIn` in the profile) is accepted.
- apc-Arab/standard names apc-Latn/arabizi.
- **Where the course has that orthography,** a `vocalize` card also takes the word as that
  orthography writes it: the token with the same sense and morphs, at the same occurrence in the
  sentence. 84% of apc words line up this way; the rest offer the marks alone.
- **The learner switches modes** with "Write it in Arabizi instead".
- **How it is graded.** An answer with letters of that orthography's script, and none of the word's,
  is graded as that spelling. It is compared as the profile compares letters (case and the
  profile's equivalences aside), all or nothing: a slip in Arabizi may be a vowel, so no typos.

## Consequences

- The KC-based cards are gone. Earlier mistakes on them no longer rebuild and drop out of practice.
- The golden files changed: in fa's first lesson a gap-fill gives way to a vocalize card. The
  30-day simulation still holds every course within ±5 pp of 85%.
- The Storybook pronunciation stories render the new cards, so their visual baselines need
  regenerating in the pinned container.
- REVIEW:
  - whether Arabizi spellings other than the course's own (ee for i, h for 7) should count;
  - whether hbo's SBL transliteration should be a `spelledIn` too, though it is a reading and not an
    orthography of the course.
- **Not yet:** a card for a whole phrase's vowels, and any `spelledIn` for fa (the course has no
  Latin orthography).
