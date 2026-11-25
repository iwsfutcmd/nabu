# 0054. Learners write in the pronunciation their script leaves out

- Status: Accepted (2026-11-18)
- Date: 2026-11-04
- Decided, not yet built (ADRs 0145–0151, accepted 2026-11-20), to amend this:
  [0148](0148-projections-and-misses.md) (options come from leftovers)
- Amended 2026-11-21 (Proposed): a fatha before an alif may be written or not (below)
- Amended 2026-11-25 (Proposed): so may a kasra before a bare ya and a damma before a bare waw (below)

## Context

Some scripts leave a word's pronunciation partly unwritten:
- **Abjads** (Persian, Arabic) usually omit the short vowels: کتاب is *ketāb* only to someone
  who knows the word.
- **Han characters** say nothing reliable about sound: 我哋 is *ngo5 dei6*.

Reading these scripts means knowing what is missing. Learners asked for an exercise where, given a
word's written form and its meaning, they write its pronunciation:
- for abjads, the short vowels;
- for ideographic scripts, the transcription into Latin script.

Alphabets and abugidas write their vowels, so they need no such exercise.

The gameplan's catalog (§8.2) has `vocalize` ("add the harakat to an Arabic word or phrase") but
nothing for Han. Since [ADR 0053](0053-vocalization.md), the fa and apc bundles carry each word's
vocalized form, and the yue KC forms carry their Jyutping (ADR 0050).

## Decision

**Two templates, both on the `read-script` facet** (knowing how the script reads, card key
`kc|read-script|orthography`):

- **`vocalize`.** It shows a word's letters (its KC form with every mark of the profile's mark
  set removed) and its meaning. The field starts from the letters, and the profile's marks are
  keys under it, each shown on a tatweel. The learner writes the marks in.
  - **Where.** A sense KC whose form, as the vocalization marks it, has a mark to supply. Sukun
    alone does not count, and neither does a word with only long vowels (آب).
- **`transcribe`.** It shows a Han word without its ruby, and its meaning. The learner types the
  word's reading in the ruby scheme. The field is tagged as that scheme's text
  (`yue-Latn-HK-jyutping`, left to right).
  - **Where.** A sense KC whose every word has a pinned reading, in a scheme with a known
    syllable shape. Only Jyutping has one so far.

**Grading is all or nothing** (`@nabu/core` `gradeVowels`, `gradeReading`; conformance vectors
in `conformance/pronounce.json`, run by both harnesses):

- **Vowels.** Compared per letter (grapheme), after NFC.
  - **The letters must stay as they are.** A letter added, dropped or changed, or a mark on no
    letter, is `vocalize-letters`.
  - **Each letter's marks must be the vocalization's** (`vocalize-marks`, listing the letters
    that are off).
  - **Optional marks.** The profile's `match.marks.optional` may be written or left out. That set
    is sukun for fa, apc and ar (REVIEW): the fa draft writes none, the apc draft writes every one.
  - **Shadda** counts like a vowel.
- **Readings.** Compared syllable by syllable, after NFC and lower-casing. Spaces, hyphens and
  apostrophes between syllables are ignored, since tone numbers end Jyutping syllables.
  - **Tones are required:** `reading-no-tones` when there are none.
  - **The right sounds with another tone** is `reading-tone`; anything else is
    `reading-syllables`.
  - **No variants** are accepted (*n*/*l*, *ng*-loss) (REVIEW).

**In lessons:** after the reading drills, a lesson adds one `vocalize` or `transcribe` card for a
word it introduces, where the course can make one. The rotation is unchanged. Mistakes mode
rebuilds a missed card from its KC.

**In the player:**
- the vocalize solution always shows its marks, whatever "Show vowel marks" says;
- the transcribe prompt never shows ruby, whatever "Show readings" says, since the ruby is the
  answer.

## Consequences

- **Lessons gain a card.** 55 of 61 fa lessons and 54 of 55 apc-Arab lessons gain a vowel-marks
  card for a new word; 58 of 59 yue lessons gain a Jyutping card. The others introduce no word with
  marks to supply or a pinned reading. No lesson reaches the 14-card cap, and the 30-day
  simulation still holds every course within ±5 pp of 85%.
- Cold-start difficulty 0.8 for both (typed, all or nothing), next to `complete-translation`
  (0.6) and `translate-type` (1.0).
- **The gameplan's `vocalize` facet was `form`.** It is `read-script` here, because the card
  asks how the script reads, not about inflection ([errata 62](../gameplan-errata.md)).
- **Not yet:**
  - Pinyin, Yale or kana readings (each needs a syllable shape and a field tag);
  - a vocalize card for whole phrases;
  - accepting dialect variants of a Jyutping syllable.

## Amendment (2026-11-21, Proposed): a fatha before an alif

**Context.** A learner building مرحبا's marks on the buttons (`vocalize-build`, ADR 0137) put a
fatha on the ب: مَرْحَبَا. apc's vocalization writes مَرْحَبا, so the card said the ب was off. Both
are right. The fatha before an alif spells the *a* the alif writes anyway: fully vocalized Arabic
writes it (كِتَابٌ), and apc's draft leaves it out (but for عَالبيت, هَالجِمْعَة).

**Decision.** A profile can make marks optional on a letter before certain letters:
`match.marks.optionalBefore`, a list of `{marks, letters}`. Such a mark may be written or left
out there, as the optional marks may anywhere; the same mark before any other letter counts.
- **apc-Arab and ar-Arab (REVIEW):** the fatha before a plain alif (ا) or an alif maqsura (ى).
- **Not before a hamza's seat** (أ, إ, آ): a fatha there is a vowel of its own (مْأَخَّر).
- **Only the fatha.** The kasra of bi- before the article's alif (بِالبيت) still counts. So do a
  kasra before ي and a damma before و: in Lebanese those letters also write ē, ō and the
  diphthongs, so the mark says which.
- **Not Persian.** fa writes no fatha before ا, and its profile keeps one there wrong
  (conformance `vowels/fa/extra`).

**Where.** `gradeVowels`, `hasVowelMarks`, `attestedMarks` and `vocalizationVariants`
(@nabu/core match/pronounce.ts) all compare a letter's marks through the same function, which
knows the letter after it. So a choice card never offers the word with that fatha added or left
out as a wrong option, and a word whose only mark is such a fatha has nothing to ask. A
`vocalize-build` card carries the profile's `optionalBefore`, as it carries `optional`.

**Consequences.** Nine vectors in conformance/pronounce.json, in both harnesses: the fatha written
and left out, before ى, beside a shadda; the kasra, the hamza's seat, a fatha elsewhere and a
missing shadda, which still count; ar-Arab as apc.
- **Choice cards lose wrong options that were right.** In a walk of the apc course, 8 of 118
  planned vocalize cards offered the word with a fatha before its alif as a wrong option
  (مَرْحَبَا, وَاحَد, دَايْماً, بُكْرَا, سَافَرِت, لَازِم, رِسَالِة, وَاقِف). Each now offers another.
  Which cards a lesson plans, and in what order, is unchanged (golden files).
- **The pronunciation story's feedback baselines change** (apc-Arab, six cells): their wrong pick
  was مَرْحَبَا.

## Amendment (2026-11-25, Proposed): a kasra before a bare ya, a damma before a bare waw

**Context.** A vocalize card for فيلم offered فيلِم (right) and فِيلِم (wrong). The owner: both should
be accepted. The kasra on ف spells the long i the ya writes anyway, as the fatha before an alif
spells its a. The 2026-11-21 amendment kept that kasra counting, because a bare ya also writes ē
(بيت bēt, وين wēn, ليش lēš) and a bare waw ō (هون hōn, يوم yōm, لون lōn), and a kasra or damma would
say which. But apc's vocalization writes ē and ō with a bare ya or waw too, exactly as it writes ī
and ū, so the marks the course shows never tell them apart: a learner could not see why فِيلِم is
right and بِيت wrong.

**Decision.** An `optionalBefore` rule may ask for two more things, both read off the expected word:
- `bare`: the letter after carries no mark of the set. A ya or waw with a mark of its own is a
  consonant (مِيِّة miyye, هُوّ huwwe), and the vowel before it counts.
- `unless`: marks on the letter itself that keep the rule's marks counting. A sukun says the letter
  after begins a syllable: فاضْيين is fāḍyīn, and فاضِيين (fāḍiyīn) stays wrong.

apc-Arab and ar-Arab (REVIEW) add a kasra before a bare ي and a damma before a bare و, each `bare`,
`unless` a sukun. Only that mark: a fatha before a bare ya (فَيلِم, *fay-*) still counts.

**Where.** `optionalHere` (@nabu/core match/pronounce.ts) gives the marks optional on a letter from
the letter and the next one, for `gradeVowels`, `hasVowelMarks`, `attestedMarks` and
`vocalizationVariants` alike, so a choice card never offers فِيلِم as wrong. A `vocalize-build` card
carries the rules (`OptionalBeforeRule`), so the card link's format is 2.

**Consequences.**
- **Seven vectors** in conformance/pronounce.json, in both harnesses: the kasra written and left
  out, the damma, and four that still count (a fatha before the ya, the kasra before a marked ya,
  the damma before a marked waw, the kasra after a sukun).
- **ē and ō take the kasra or damma too.** بِيت is accepted for بيت (bēt) and يُوم for يوم (yōm):
  the script, as the course marks it, does not say the vowel's quality. To ask it, the vocalization
  would need a mark for ē and ō (a fatha, بَيت), which would change what the voices read.

