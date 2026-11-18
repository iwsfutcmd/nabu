# 0139. Feature cards: one thing the script leaves open

- Status: Accepted (2026-11-18)
- Date: 2026-11-17

## Context

The sources-of-truth study (docs/sources-of-truth.md, §6.2) found that the reading cards ask the
whole reading. A char-read card's wrong options mix:

- the same syllables in another tone;
- a letter the script writes alike, traded;
- the course's other readings of the spelling;
- other words' readings.

A miss says the learner lacks the reading, not which part of it. tone-identify already asks one
feature of a syllable, but by ear.

What a script leaves open is in the reading schemes' data:

- `variants`: the letters a script writes alike. Schluessel's vowels under alif and waw, and k/g
  under kāf. Pinyin's four tone marks on a vowel. Baxter's x and h.
- `tones`: the tone numbers of a scheme typed in syllables (Jyutping).

The project owner chose the reading side next (decision 6a): feature cards, minimal ruby, and
homograph marks.

## Decision

**A new card, `reading-feature`** (read-script), wherever a word's reading has one place the
script leaves open in two or more ways.
- It asks the word a char-read card would ask: the sentence without ruby, one word marked, its
  meaning below.
- The options are the word's reading and that reading with one place changed, in every way the
  data allows there:
  - a letter traded for each other letter of its `variants` set (üzüm, özüm, uzüm, ozüm, ūzüm);
  - or one syllable in each other tone the course's readings use (ngo5, ngo1, ngo4).
  At most four options.
- The place is picked by the session's seeded RNG among those with two or more alternatives.
- It never shows two places: the options differ in one place only, so a miss names that place.
- It asks the learner's tradition (ADR 0138) and names it where there are several.
- It credits only the word (ADR 0095), as char-read does. It is planned once the word is
  recognized, at most one a session.

**Where it comes:**
- chg: its vowels, k/g, and the other sets.
- lzh in Pinyin: its tones, as marks on the vowel.
- lzh in Jyutping, and yue: its tones, where the course attests the syllable in two or more other
  tones.
- Baxter's x/h set has a single alternative, so lzh in Baxter gets none.
- Courses without a reading layer get none: fa, apc and hbo ask their marks with vocalize cards.

## Consequences

- **Diagnostic misses.** Wrong on a feature card is wrong on that one place. A later step can
  credit a feature KC (`reading:vowel`, `reading:tone`) so the planner aims practice at the
  feature (§6.2). This ADR credits the word only.
- **Plans change** for chg, lzh and yue: some lessons trade a reading card for a feature card. No
  golden plan is in those courses. The simulations stay within their bounds.
- **The e2e solver** answers it as it answers any choice.
