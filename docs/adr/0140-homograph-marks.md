# 0140. Homographs are marked, and a tap names their other readings

- Status: Accepted (2026-11-18)
- Date: 2026-11-17
- Amended by: [ADR 0132](0132-a-choice-asks-one-thing.md)'s amendment of 2026-11-21 (no mark among a choice's options)

## Context

The sources-of-truth study (docs/sources-of-truth.md, §5) proposed "ambiguity marking": a mark on
the words whose spelling has more than one reading in the course, and a tap that shows both with
their meanings. Some examples:

- Chaghatay's اوزوم is *üzüm* "grape" and *özüm* "myself".
- Classical Chinese 知 is *zhī* "know" and *zhì* "wise".
- Cantonese 呀 is *aa3* and *aa4*.

A reader of the script can't tell these apart from the spelling. The reading layer, where shown, gives
this word's reading, but nothing says the spelling could be read otherwise. The project owner chose
the reading side next (decision 6a).

## Decision

**Core finds them** (`homographsOf(course, scheme)`). These are the spellings of the course
orthography that its sentences read more than one way in a reading scheme. For each reading:
- the reading;
- the words it reads;
- what the first of those words means (its card gloss).

Two readings that differ only in these ways are one reading:
- case (a name's capital);
- the mark that binds a word to the next (the Tiberian maqaf hyphen, ADR 0135).

**Lessons and stories mark them** (`HomographsProvider`). <T> gives such a word a dashed underline
in the accent colour, distinct from tap-for-gloss's dotted one. The scheme used is the reading layer
shown, else the first (lzh: the learner's tradition, ADR 0138). Outside a lesson or story nothing is
marked.

**A tap names the others.** The tapped word's gloss lists the spelling's other readings under
"Also read", each with what it means (`useOtherReadings`, core `otherReadings`). The tapped word's
own reading is left out. The panel is a live region, so the list is announced: the underline is a
hint, never the only way to learn of it.

## Consequences

- **Where it shows:** Chaghatay (10 spellings), Classical Chinese (4 in each tradition), Cantonese
  (呀), Biblical Hebrew (pointed spellings the Codex reads two ways).
- **Data questions surface.** A homograph that is really one word read inconsistently shows as two
  (chg *šaharī / šahari*). ADR 0135's reading check names the same cases.
- **Visual baselines** change where a story shows such a word.
