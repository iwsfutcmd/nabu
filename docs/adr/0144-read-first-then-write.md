# 0144. Words met in passages: read first, then written

- Status: Proposed
- Date: 2026-11-18
- Amends: [ADR 0043](0043-stories.md) (stories), [ADR 0050](0050-ten-unit-courses.md) (what a lesson
  introduces), [ADR 0071](0071-classical-chinese.md)'s rule that a unit's lessons teach every word of its
  story, [ADR 0100](0100-known-words.md) (where writing is asked)

## Context

The project owner, reading Schluessel's *An Introduction to Chaghatay* (2018) beside the chg course,
found that his first chapters use words Nabu's first lessons never teach. Is Nabu much slower than a
textbook, and should it be?

Schluessel's glossary gives each word the chapter that teaches it. Against chg's units:

| | Schluessel | Nabu chg |
|---|---|---|
| Ch. 1–6 / units 1–6 | ~170 words | 187 KCs (30 lessons) |
| Ch. 7–10 / units 7–10 | ~225 | 85 |
| Ch. 11–16 / units 11–19 | ~595 (56–150 a chapter) | 183 |
| Total | ~990, and ~440 more in the glossary | 455 (397 words, 58 suffixes) |

- **At the start the pace is the same.** So is the grammar: his chapter 6 (possessives, the simple past)
  is Nabu's unit 6. A lesson is 10–14 cards, a few minutes, so per hour Nabu may well be faster.
- **The words differ.** Nabu's come from its story excerpts; Schluessel's first lists are everyday
  vocabulary for drill sentences, after Raquette. Of the 147 words in his chapter 1–6 lists, Nabu has
  about 80 (spread over units 1–16). About half of the rest never occur again in his book (makiyan
  "hen", buqa "bull", inäk "cow", qetiq "yogurt", šorpa "soup", ögzä "roof"). A dozen recur in his
  passages, and Nabu lacks them: ḫudā, dunyā, yurt, ḫwāja, čöl, āḫūnd, dost, daraḫt, Ḫotan.
- **From chapter 7 Schluessel speeds up and Nabu does not.** His words become a passage's words: met in
  the text, looked up in its glossary. Nabu's lessons introduce 3–5 words each, and every word a story
  uses must have been introduced by a lesson first (`curriculum.never-introduced`, an error;
  `story.ahead`, a warning). So stories stay short excerpts, and a course is as large as its lessons:

| | apc | chg | es | fa | grc | hbo | lzh | tok | uz | yue |
|---|---|---|---|---|---|---|---|---|---|---|
| Lessons | 99 | 90 | 169 | 60 | 48 | 90 | 50 | 52 | 58 | 58 |
| Words | 358 | 397 | 721 | 237 | 170 | 311 | 227 | 126 | 213 | 260 |
| Words a lesson | 3.6 | 4.4 | 4.3 | 4.0 | 3.5 | 3.5 | 4.5 | 2.4 | 3.7 | 4.5 |

Reading unsimplified text needs most of its running words known: about 95% to read with help, 98% to
read comfortably (Laufer 1989; Hu and Nation 2000; Laufer and Ravenhorst-Kalovski 2010). That takes
thousands of words, which lessons at four words each never reach.

The owner's view settles one choice: **writing a word is the surest way to fix it in memory**, so every
word is drilled in writing, even in a language nobody writes today (chg, lzh, hbo, grc). This agrees
with the generation effect (Slamecka and Graf 1978) and with retrieval practice (Karpicke and Roediger
2008): a word recalled and written is kept better than one recognized. A recognition-only tier for
reading vocabulary is therefore ruled out.

## Decision

**A word comes in one of two ways, and is learned one way.**

- **Taught first**, as now: a lesson introduces it, in the course's own sentences, before any passage
  uses it. This is for grammar and for the frequent core.
- **Read first**, new: a passage introduces it. The learner meets it glossed in the passage, then
  drills it.
- **Either way, a word is known only once it has been written.** Every drilled word is asked in writing
  (typed) before it counts as known (ADR 0100's `produce`), in every course.

### Passages

- **A story node introduces the words its passage is the first to use:** every KC it uses that no
  earlier node introduces. The compiler works this out and puts it in the bundle; the source does not
  list them. `curriculum.never-introduced` no longer applies to stories. A KC is introduced once: a
  later lesson that also introduces it is an error (`curriculum.introduced-twice`). Its sentences may
  still use it, as an earlier word.
- **Passages can be long:** a whole passage, or a section of one per story node (part one, part two).
  chg's are Schluessel's typescripts of public-domain sources; translations stay the course's own.
- **A passage shows its new words before it,** as a textbook's vocabulary does: a list with glosses, and
  readings where the layer shows them over new words (ADR 0131). Taps gloss as now.
- **Names are glossed, never drilled.** A KC may be `drill: false`: proper names by default (`pos:
  PROPN`, ADR 0132), and words the author marks. Such words are never asked and never count toward
  known; they appear in the passage's list and in taps.

### Drilling words read first

- **Each passage is followed by drill sessions for its words.** The path shows a drill node after the
  story node: "Words of *the passage* (3 of 12)". The planner knows the passage was read from the fold's
  `completedNodes`, and which words it introduced from the bundle, so no new event data is needed.
- **A drill session is a lesson for up to the usual number of new words** (5–10), tuned against the
  simulation like lessons. Every word in it is presented (ADR 0050's hard constraint), then
  recognized, then written. A 100-word passage gives about a dozen sessions.
- **Most frequent first.** A passage's words are drilled in order of how often the course's passages
  use them. A learner who drills only part of the list has the most useful part.
- **Cards come from the passage's own lines**, so a word is practised in the context it was met in:
  - recognition: match-pairs, select-image where pictured, gap-fill on a line (asking which word, ADR
    0132);
  - writing in context: a typed blank in a line, with the line's translation (complete-translation).
    It is graded against the word as the line writes it (and its accepted spellings), since a story
    line has no sentence accept set;
  - writing out of context, new: `write-word` (facet `produce`): the gloss is shown and the learner
    types the word, its first form (the lemma, as word cards show it). It is graded by the profile's
    matcher like any typed answer, so there is no new matching behaviour.
- **Course sentences that use a read-first word join its drills and reviews** once the word is met.
- **Drills never block reading** (D6). The next passage opens when this one is read. The pace band
  (ADR 0105) decides when `continueOf` offers drills before the next passage, as it offers practice
  before a lesson.

### What lessons teach

- **Grammar, and the frequent core:** words that several passages use, and words the course's reference
  teaches early that recur in the sources. The compiler reports how often each word occurs across the
  course's passages (an info lint, `curriculum.core`: a word used in several passages that no lesson
  teaches before the first of them).
- **Lessons no longer teach every word of their unit's passage.** This amends ADR 0071's rule for lzh,
  and the practice of every course since.

### Known words

ADR 0100's rule stands. Writing is asked of every drilled word, not only where a course sentence uses
it: a passage line counts, and so does `write-word`. Words marked `drill: false` are asked nothing.

## Consequences

- A course can grow to the size of real reading without a lesson for every four words. chg can aim at
  Schluessel's ~1000 words.
- Writing every word costs time: a passage's drills take longer than reading it. Frequency order puts
  the useful words first, and drills never hold back the next passage.
- Core: a drill node kind, drill sessions in the planner, `write-word`, typed blanks graded against the
  word, the path's drill progress. Golden files change; the simulation gains a learner who reads ahead
  of their drills (pacing runs, ADR 0105).
- Compiler: story nodes' introduced words, `curriculum.introduced-twice`, `curriculum.core`, `drill`
  on KCs.
- UI: the passage's word list, drill nodes on the path, the `write-word` card, all in the visual matrix
  (LTR, RTL, vertical). New messages.
- Courses, chg first: lessons for the recurring words Schluessel teaches early (ḫudā, dunyā, yurt, ḫwāja,
  čöl, āḫūnd, dost, daraḫt, Ḫotan), then his passages at full length. The others follow: lzh, hbo and grc
  from their authentic passages; es, apc, yue, uz and fa with longer graded stories.

## Order of work

1. Schemas: `drill` on KCs; the bundle's introduced words on story nodes; a drill node kind; codegen.
2. Compiler: introduced words for story nodes, the two lints, the frequency report; lint fixtures.
3. Core: drill sessions, `write-word`, typed blanks on story lines, `continueOf`, known words; goldens;
   simulation.
4. UI: the passage's word list, drill nodes, `write-word`; visual matrix; messages.
5. chg: the early recurring words, then the passages at full length; then the other courses.

## Open questions

- **Gloss-only words:** only names and words the author marks, or also every word the course uses once
  (a hapax)? Proposed: names and marked words only. Every other word is drilled, as writing fixes it.
- **Intake:** should drill sessions take more new words than lessons, since the words were met in the
  passage already? Proposed: the same at first, then tuned against the simulation.
- **`write-word`'s form:** the lemma (bar-) or the form met in the line? Proposed: the lemma, as word
  cards show it; the typed blank in a line asks the form.
