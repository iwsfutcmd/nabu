# 0126. Cantonese in Jyutping: a second orthography, written from the characters

- Status: Proposed
- Date: 2026-11-13
- Amends: [0040](0040-audio-pipeline.md) (a clip's timings name their orthography),
  [0109](0109-names-and-schemes-are-data.md) (an orthography written in a scheme's syllables)

## Context

yue is written in Hong Kong characters, with each word's pinned Jyutping shown above it as ruby. The project
owner asked for the other way round as well: Jyutping as the text a learner reads and types, the characters
above it. Many learners of Cantonese, heritage speakers above all, speak before they read characters, and
Jyutping is how they write the language.

Other courses already teach two orthographies, every sentence pinned in both (uz Latin and Cyrillic, apc
Arabic and Arabizi, tok sitelen Lasina and sitelen pona). yue's Jyutping differs from those in one way: every
word of it is already in the course, as the readings pinned on the characters. Writing it by hand would make a
second copy that could drift from the first.

## Decision

**A second orthography, `yue-Latn/jyutping`** (profiles/yue-Latn.jyutping.yaml, lang
`yue-Latn-HK-jyutping`), as uz and apc have theirs. The learner chooses it on the course list, by its name and
hint in `course.yaml` (ADR 0109); progress is the course's, whatever the orthography.

**Never written by hand.** `nabu jyutping <course>` (nabu.jyutping) writes it from the Hant forms:

- **A sentence or story line:** each word token's pinned Jyutping becomes the word (its sense and morphs kept,
  a morph's syllables its share of the word), its characters the word's `characters` reading. The text joins
  the words with spaces and Latin punctuation (。？！，as . ? ! ,): `ngo5 hai6 hok6 saang1.`
- **A KC form or a character name:** what the course's tokens of that KC read it as.
- **An accept set:** the notation kept, each character read as it is in that alternative:
  - the sentence's pinned words first, then the course's (longest first);
  - then PyCantonese, reading the whole alternative in context.
  - A character a typed alternative spells for another word reads as that word (既 for 嘅 is ge3, 無 for 冇
    mou5); a few characters take the reading the course uses them in (咪 mai6 in 係咪, 位 the classifier wai2,
    會 wui5 "will"). REVIEW: the tool lists these, and every reading PyCantonese gave, for a person to check.
  - 呀 where the sentence does not pin it is aa3 or aa4: the characters cannot tell, so neither may the
    Jyutping.
  - Spellings said alike are one answer (我(哋|地) is ngo5 dei6). A line that adds no answer is left out.
- The number drill (RBNF) gets its Jyutping from the scheme's `read` plug-in.

**Checked, not trusted.** The Hant profile names the orthography it is read into (`transliterate: {to:
yue-Latn/jyutping, via: jyutping}`). The compiler checks each sentence's Jyutping text and tokens are what the
characters give (`enrich.transliteration-mismatch`). A test runs `nabu jyutping --check` over the course, the
accept sets included.

**The characters are ruby: a scheme of their own.** profiles/schemes/characters.yaml (`lang: yue-Hant-HK`),
shown and never asked.

- An orthography that is a scheme's `answer` (Jyutping's is yue-Latn/jyutping) writes its words in that
  scheme's syllables. The compiler takes the syllable shape from the scheme's data (`typed`), with no Jyutping
  in its code:
  - such a word carries its characters as ruby, one character over each syllable;
  - an unpinned text that is all syllables (a KC form, `hok6 saang1`) is one word.
- The app sets ruby in its own script's face, and loads that face even where the text's own would not load it
  (a Han font for Latin text). Han ruby is set at 0.75em, not the 0.55em that suits a romanized syllable.

**Typing it: the profile.**

- **Syllables:** lowercase, spaced or joined (`hok6saang1`). A new normalization step, `split: {after:
  "123456"}`, puts a space after a tone number that a letter follows. Case is folded.
- **Tones are never typos** (REVIEW). A wrong tone number is WRONG_WORD with the note "The sounds are right:
  check the tones", even where the digits are neighbours on the keyboard. A missing one is WRONG_WORD with "Each
  syllable needs its tone number". Both are contrast sets of the digits (ADR 0066).
- **Letters:** a slip in a syllable's letters is a typo only if it spells no other syllable of the course (the
  lexicon): vowel length is phonemic (sang1, saang1).
- Conformance vectors pin all of this in both harnesses.

**One set of clips.** A clip's timings index the tokens of the orthography its voice read (the characters).
The bundle now says which (`BundleClip.orthography`). The app moves them to the chosen orthography's tokens
word for word (the k-th word of one is the k-th of the other). Where the words do not line up, it shows no
highlight rather than the wrong word. This also mends sitelen pona's highlighting, which used the Latin
tokens' indices.

## Consequences

- yue is taught in Jyutping as fully as in characters: every lesson, story, word card, drill and review. Cards
  that drill the characters (which character reads so, type a word's Jyutping, which tone) are not made where
  the text is already Jyutping.
- Changing a yue sentence means running `nabu jyutping ../courses/yue` after it; the compiler says so if
  forgotten.
- **Not done:**
  - speaking in Jyutping has no speech tiers (the recognizer writes characters);
  - a correction made in the Jyutping view is to the Jyutping form, which `nabu jyutping` would write over.
    The reading belongs on the characters.
