# 0061. Lemmas on word cards, morphs on taps

- Status: Proposed
- Date: 2026-11-05
- Amends: [0043](0043-stories.md), [0057](0057-word-corrections.md)

## Context

**The data already knows the morphology.** Every inflected token carries `morphs`, each naming
its KC: *Angliyadanmisiz* is Angliya (`sense:angliya`), -dan (`form:abl-dan`), -mi (`form:q-mi`)
and -siz (`form:cop-2-siz`). Learner credit already flows to each morph's KC (ADR 0036).

**Two things papered over it:**
- **Word cards show a KC's first form, and the drafts put inflected words there:** "England" was
  shown as *Angliyadanmisiz*, "living room" as بالصالون.
- **Tap-for-gloss matched strings against KC forms.** So the drafts listed inflected words as
  forms: *bormoq* had twelve (*boraman, borasiz, boring*…). Without them, a tap on *boraman*
  would have matched *bor* ("there is").

A scan found inflected forms on most uz words, and on a third of the fa, apc and yue ones.
Uzbek is in the course set to force agglutinative morphology early: so the app should use the
analysis rather than work around it.

## Decision

**A tap on an analysed word shows its morphs** (`glossAt`, @nabu/core/story).
- **When it applies:** a word whose annotation names more than one KC.
- **What it shows:** each morph in order, with its KC's meaning. Where a morph is written
  otherwise than its KC's dictionary form, the panel names that form: *bor* in *boraman* is
  *bormoq*.
- **Phrases first:** a phrase entry covering the word and its neighbours still comes first.
- **Unchanged:** an unanalysed word is glossed by longest match as before, and falls back to its
  own sense.

**A KC's forms are its lemma and the lemma's variants, never an inflected word.** The first form
is the dictionary form, which word cards, word clips and corrections show.
- **Verbs:** the infinitive (uz *ichmoq*, fa خوردن). A defective verb with no infinitive takes
  its stem, hyphenated: uz *e-*, whose past is *edi*.
- **Nouns:**
  - bare: *Angliya*, بيت (no article), شمال (no possessive);
  - an adjective in its masculine form (ماضي, *madi*).
- **Grammatical forms:** a KC like `form:1pl-im` has no whole word for a form.

**Lint `kc.inflected-form` (error):** a KC form that a sentence or story line analyses into
morphs of more than one KC. It caught 136 forms across the four courses.

**`glossary.dead-entry` accepts a lemma** that no text contains verbatim (*bormoq*), when the KC
is annotated somewhere: taps reach it through the morphs.

## Consequences

- **Word cards and word clips show and say the lemma.** Their clips are made again.
- **Each lemma needs vowel marks** in fa and apc (vocalization.yaml entries, drafts awaiting
  review, as the rest).
- **apc verbs are not analysed yet.** Their first forms are still conjugations (بروح "I go"), and
  the lint cannot see them until they carry morphs. The next step:
  - annotate Levantine verbs (b- imperfect, person prefixes and suffixes);
  - cite them in the 3rd person masculine perfective (راح), handling homographs such as أكل (food
    / he ate) through `ambiguous` vocalizations.
- **Next steps:**
  - grammatical-form KCs get their allomorphs as forms (-ga/-ka/-qa);
  - new cards: build the word from stem and ending tiles, and choose the ending.
