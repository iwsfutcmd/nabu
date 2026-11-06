# 0075. Courses exercise every person their language marks

- Status: Proposed
- Date: 2026-11-06
- Amends: [0056](0056-persons.md), [0040](0040-audio-pipeline.md)

## Context

ADR 0056 let a sentence say who speaks and who is spoken to. The drafts used it for the
default case:

| Course | to a man | to a woman | to several | a man speaking | a woman speaking |
|---|---|---|---|---|---|
| apc | 56 | 8 | 0 | 11 | 0 |

Nearly every tagged apc sentence was a man talking to one man. Plural "you" and a woman
speaking were never practised.

The other courses tagged nothing:
- Cantonese marks number (你 against 你哋), but none of its 57 number-ambiguous "you"
  sentences was tagged. Their accept sets held only 你, so a learner who wrote 你哋 for an
  untagged "you" was marked wrong. ADR 0056 says an untagged sentence accepts both.
- Persian (تو / شما) and Uzbek (sen / siz / sizlar) mark number and politeness. Their untagged
  sentences already accept both, as ADR 0056 asks, so plural was never asked for on its own.

The sentences were also voiced by a single voice. apc's voice is a man's, so a woman's words would
have been read in a man's voice.

## Decision

**A course exercises every person its language marks, not one default.**
- **Speaker:** a woman as well as a man, where adjectives or participles agree with the speaker
  (apc *ana jou3ane*).
- **Addressee:** one man, one woman, one person, two people, several people: each value the
  language distinguishes.
- **Drafting:** a new sentence that tags one value should usually come with sentences for the
  others in the same unit (*kifak / kifik / kifkon*).
- **Spread:** no value the language marks may be missing, and the default value should not drown
  out the rest. Reviewers check the counts (courses/REVIEW.md).
- **The compiler warns `curriculum.one-gender`** when a course tags a man speaking but never a
  woman, or a man spoken to but never a woman (or the other way round). It cannot know which
  numbers a language marks, so a missing plural is left to review.

**`addressee` gains two values** (common.schema.json `Persons`):
- **`sg`, "to one person":** for a language that marks number but not gender (Cantonese 你). In
  apc, `m` and `f` are already singular.
- **`du`, "to two people":** for a language with a dual (Slovene, Modern Standard Arabic,
  Sámi). No course uses it yet. The tag and its UI message exist so that one can.

**A voice says whose voice it is: `speaker: m | f`** on a course voice.
- **No wrong-gender clips:** a sentence whose `persons.speaker` is the other gender gets no
  clip from that voice. `nabu audio generate` lists it and leaves it out.
- **Existing clips:** the compiler marks a clip that such a voice already made as `audio.stale`,
  and it stays out of the bundle.
- **No `speaker`:** a voice without it says everything, as before.
- **Until a second voice is cast:** apc's voice is `speaker: m`, so its sentences said by a
  woman have no audio. They are still taught; listening exercises skip them, as they skip any
  item without a clip.

**Register is the next dimension. It is not modelled yet.**
- **Javanese speech levels:** ngoko, krama, krama inggil.
- **T–V:** Persian تو / شما, Uzbek sen / siz.
- **Honorific systems:** Korean, Japanese.

When the first such course arrives, register gets the same treatment as persons:
- the prompt says it (a UI tag);
- the accept set holds only the forms that fit it;
- the course exercises every level.

Until then, Persian and Uzbek can tag plural (`pl`, with accept sets that drop تو / sen). A
familiar-singular tag would restrict nothing, because شما and siz are also the polite singular.
Gendered plurals (Hebrew *atem / aten*, MSA *antum / antunna*) will need a gendered `pl` when a
course has them.

## Consequences

**The fixture courses now cover more persons** (LLM drafts, awaiting native review):

| Course | Addressee | Speaker |
|---|---|---|
| apc | to a man 56, to a woman 21, to several 29 | a man 11, a woman 8 |
| yue | to one person 57, to several 15 | — |
| fa | to several 10 | — |
| uz | to several 7 | — |

- **New apc lessons:** `apc.fam.you-pl`, `apc.food.you-pl`, `apc.day.you-pl` and
  `apc.past.you-pl` teach the plural endings. The new KCs are `form:poss-2pl` (-kon),
  `form:imp-2pl`, `form:impf-2pl`, `form:past-2pl`, `form:pl` (adjectives, -in) and `sense:ento`.
  Each lesson comes after the one that teaches the masculine and feminine forms. Earlier lessons
  are unchanged (ADR 0050).
- **yue tags:** 57 number-ambiguous 你 sentences are tagged `sg`. Each of the 15 new 你哋
  sentences is derived from one of them, with the same tokens and Jyutping.
- **fa and uz:** each plural sentence is the counterpart of a singular or polite one in the
  same lesson. The fa sentences use شما with -ید; the uz sentences use sizlar with -sizlar.
- **UI:** the new tags `player.persons.addressee.sg` and `.du` are in every catalog (drafts
  stamped).
- **Stories are not covered yet.** Story lines have characters but no gender, so apc's Maya
  still speaks in the course's one voice. Casting a woman's voice, and letting a character say
  which voice reads it, is the follow-up.
