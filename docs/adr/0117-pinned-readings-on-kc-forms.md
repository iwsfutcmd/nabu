# 0117. One pinned reading per word, pinned by the compiler on KC forms

- Status: Proposed
- Date: 2026-11-12
- Amends: [0040](0040-audio-pipeline.md) (how a word KC's clip finds its reading),
  [0054](0054-pronunciation-exercises.md) and [0071](0071-classical-chinese.md) (KC forms carry
  ruby), [0109](0109-names-and-schemes-are-data.md) (reading schemes are data)

## Context

A word card shows a KC's form. Three places each worked out the reading of that form on their own
(the 2026-11 review's C10):

- **The compiler** pinned readings and ruby on KC forms for the profile's ruby layers only. It took
  the most common reading of the KC's sense in sentences and story lines together (a tie went to
  the alphabetically first), then a morph's share of a longer word's reading, then the reading every
  token spelled like the form had.
- **The audio planner** took the first token spelled like the form, in any sense: sentences, then
  story lines, then morph shares, then (for Attic) a token whose cited form is the form's.
- **The app** (minimal pairs) took the first sentence token spelled like the form, in any sense.

A word spelled like another sense with another reading could get a clip of one reading and a card
showing the other. Checked over every course, the three disagreed on these words:

| Course | Word | Card (compiler) | Clip lookup (planner) | Minimal pairs (app) |
|---|---|---|---|---|
| yue | 呢 "this" (`sense:呢`) | ni1 | ne1 (the particle) | ne1 |
| yue | 嗰, 百, 禮拜, 日 (met only inside longer words) | their share | their share | none |
| lzh | 知.zhi "wisdom", 有.you "and", 強.qiang "to force" | zhì, yòu, qiǎng (and the Jyutping and Baxter) | zhī, yǒu, qiáng | the same |
| hbo | עַד (`sense:ad`) | none (no ruby layer) | ʿaḏ- | none |
| grc | 17 words a sentence writes with a grave (καὶ, παρὰ…) | none | cited: καί, πᾰρᾰ́… | none |

None of it reached a learner:

- the yue voice reads characters, not readings (ADR 0094), and both clips of 呢 failed the round
  trip and are held back;
- lzh has no audio and no minimal pairs;
- hbo, grc and tok have no ruby layer for their schemes, so no card showed one.

The risk was latent, as the review said. It would have become real with the first course that
shows a scheme as ruby and also has a voice that reads it.

## Decision

**The compiler pins one reading per word of every KC form, for every scheme the orthography's words
pin** (`nabu.compiler.readings`): the ruby layers and also the schemes voices read (tiberian, attic,
lasina), read from the tokens, never named in code. Nothing is guessed. A word's reading is, in
order:

1. the readings of the KC's sense spelled as the form, **in the lesson sentences**: the most
   common, a tie going to the first in course order;
2. the same in story lines, only for a word no lesson sentence has. Story lines are authentic
   passages, and their readings are often their context's: a pausal form, a word bound by maqaf;
3. the KC's share of longer words, from their ruby (禮拜 in 禮拜一);
4. where the scheme cites a word otherwise than a sentence says it (its `cite` plug-in, ADR 0109:
   Attic's acute for a sentence's grave), the KC's sense cited the same way;
5. the reading every token spelled as the form has, when they all agree. A polyphone gets none.

The profile's ruby layers also get ruby, where the reading lines up with the word's characters.

**Everyone reads that reading:**

- **The audio planner** reads a word KC from the reading pinned on its first form
  (`form_readings`). It has no lookup of its own any more, and skips a form without one, as before.
- **The app's minimal pairs** compare the readings pinned on the two forms (`pinnedReading` in
  `lesson/templates.ts`).
- **The card** shows the ruby pinned with it.

**No clip went stale.** The order above was chosen so that every existing clip is still what its
voice reads:

- every reading a voice reads (hbo, grc, tok) is the one the planner took before;
- of the ruby the app showed, nothing changed.

The two orders differ only where no clip depends on them:

- yue's 呢, whose clip reads characters;
- lzh's three senses, which have no audio.

hbo's עַד keeps ʿaḏ-, the reading its clip was made from. Lesson sentences tie at one ʿaḏ- and one
ʿaḏ, and the tie goes to the first. Merging story lines (one more ʿaḏ, Genesis 24:19) would have
picked ʿaḏ and made that clip stale.

**The bundle format is unchanged** (ADR 0110's `formatVersion` stays 1). KC forms are tagged text
whose tokens could always carry `readings`. They now carry one in hbo's, grc's and tok-Latn's
schemes too (414 words). An app that ignores them behaves as before. An app reading an older bundle
finds the ruby layers' readings where it looks (KC forms had them), and no readings in the other
schemes, which no card shows.

## Consequences

- A word card's clip, its ruby and its minimal pairs come from one reading. A course that shows a
  scheme as ruby and has a voice that reads it is safe.
- The word list's search (`wordMatcher`, ADR 0100) also finds hbo, grc and tok words by their SBL,
  Attic or sitelen Lasina readings, as its comment always said. A word's correction form shows those
  readings, and `nabu corrections apply` refuses to edit them, as it does Jyutping: a word's
  reading comes from the sentences that pin it.
- **עַד's card says ʿaḏ-, the bound form, unstressed** ([ʕað]). On a card alone, ʿaḏ ([ʕˈaːð]) is
  the better reading. It needs either a lesson sentence with a free עַד, or the order above to
  prefer a word's unbound reading. Either makes its clip stale. hbo's voice is Piper and runs on a
  CPU, so the clip is cheap to make again. That is the owner's call.
- Words spelled alike that a voice reads as characters (yue's 呢 "this" and the particle 呢) cannot
  get two clips: the voice says the character as it likes. The card is right, and the round trip
  holds the clips back. A voice's `spoken` text is the way to tell them apart, where a voice takes
  one.
- `pipeline/tests/test_readings.py` pins the order. `test_no_clip_of_any_course_is_stale` checks
  every course's clips against what their voices read now, including grc, whose `bad` voice makes
  the compiler skip its audio check (ADR 0091).
