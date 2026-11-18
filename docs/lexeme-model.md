# The lexeme, diagrammed

- Status: working notes, 2026-11-18, beside [lexemes.md](lexemes.md) (the discussion and its decisions).
- Uses the proposed renames (lexemes.md §2): **lemma** for the lexical meaning, **lexical form** for the
  fully specified form, **surface form** for a projection, **features** for cells and properties.

## What is stored, and what is derived

```mermaid
flowchart LR
  subgraph LEMMA["Lemma: stored, shared by a paradigm"]
    direction TB
    L1["lexical meaning<br/>(a gloss per support language)"]
    L2["part of speech"]
    L3["lemma-wide features<br/>(a noun's gender, a verb's class)"]
  end

  subgraph LEX["Lexeme: stored, underivable"]
    direction TB
    X1["its lemma"]
    X2["its own features<br/>(tense, person, case; register; dialect)"]
    X3["attachment<br/>(independent, clitic, or dependent + position)"]
    X4["lexical forms<br/>(the elsewhere form + forms with their contexts)"]
    X5["parts, with a source<br/>(base; root + pattern)"]
    X6["provenance, license,<br/>notes, image"]
  end

  subgraph DATA["Language and course data"]
    direction TB
    R1["projection rules<br/>(per orthography, per scheme)"]
    R2["contexts"]
    R3["course: orthographies,<br/>facets, voice"]
  end

  subgraph DER["Lexeme: derived"]
    direction TB
    D1["surface forms per orthography,<br/>with variants; citation form"]
    D2["phonemic forms per scheme"]
    D3["sense = lemma + features,<br/>and its gloss (run, past)"]
    D4["open or closed class"]
    D5["paradigm, homographs, family"]
    D6["literal gloss"]
    D7["facets asked"]
    D8["audio"]
  end

  X1 --> L1
  R2 --> X4
  X4 --> R1
  R1 --> D1
  R1 --> D2
  D2 --> D8
  L1 & X2 --> D3
  L2 --> D4
  X1 & D1 & X5 --> D5
  X5 --> D6
  L3 & D1 & D2 & R3 --> D7
```

### Stored on the lemma (shared by every lexeme of a paradigm)

| | Examples |
|---|---|
| lexical meaning, as a gloss per support language | RUN "run"; HOUSE "house" |
| part of speech | VERB, NOUN |
| lemma-wide features | *casa*: feminine; *pensar*: e→ie |

### Stored on the lexeme (underivable)

| | Examples |
|---|---|
| its lemma | *ran* → RUN |
| its own features | *ran*: past; *nedha*: krama; *carro*: Cuban |
| attachment | independent; clitic (*me*); dependent + position (‑ga, suffix) |
| lexical forms: the elsewhere form, plus forms with their contexts | ‑ga; ‑ka after k; ‑qa after q |
| parts, with a source (where it has them) | *writer* (occupation) ← *write* + ‑er; مَكْتَب ← ك‑ت‑ب + مَفْعَل |
| provenance, license, notes, image | |

### Derived

| | From |
|---|---|
| surface forms per orthography, with variants; the citation form | lexical forms + projection rules |
| phonemic forms per scheme | lexical forms + projection rules |
| audio | phonemic forms |
| sense, and its gloss (*ran*: "run (past)") | lemma + its own features |
| open or closed class | part of speech |
| inflectional or derivational (an affix) | its lemma: a feature value, or a function making a new lemma |
| paradigm | lexemes sharing its lemma |
| homographs | lexemes sharing its surface forms |
| family | parts |
| literal gloss | parts and their glosses |
| facets asked | surface and phonemic forms (where they're unpredictable), lemma-wide features needing evidence, the course's orthographies, facets and voice |

## Worked examples

| | *casa* | ‑ga (uz) | *fue* (*ser*) | *me* (es) |
|---|---|---|---|---|
| **lemma** | HOUSE (NOUN, feminine) | dative: Case=Dat, "to" | BE (*ser*) | 1SG pronoun |
| **own features** | none | none | preterite, 3sg | object case |
| **attachment** | independent | dependent, suffix | independent | clitic |
| **lexical forms** | *casa* | ‑ga; ‑ka after k; ‑qa after q | *fue* | *me* |
| **parts** | none | none | none | none |
| *derived* | *casas* by rule (a combination); gloss "house" | closed; inflectional; gloss "to (dative)" | gloss "was"; a homograph of *fue* (*ir*) | paradigm with *yo*, *mí*; joined in *dame* by the orthography's projection |

## What diagramming surfaced

1. **Features split by where they're stored, not by UD's lexical / inflectional line.** Register and dialect
   vary within a lemma (*mangan* / *nedha* / *dhahar*; *carro* / *coche*), so they sit on the lexeme, like
   tense. Lemma-wide features (part of speech, a noun's gender, a verb's class) sit on the lemma.
2. **The gloss belongs to the lemma.** A lexeme's gloss is derived from the lemma's and its own features,
   with an override where that reads badly.
3. **An affix's lemma says what kind it is.** ‑ga's lemma is a feature value (Case=Dat), so it's
   inflectional; ‑er's is a function that makes a new lemma, so it's derivational. Nothing to store.
4. **Open or closed comes from the part of speech**, as UD groups its tags, with a language override where
   needed.
5. **Where do lexemes live?** Today KCs belong to a course. With surface forms projected per orthography,
   a language-wide lexicon that courses draw on would let two courses of one language share lexemes.
6. **Next: combinations** (below).

## Combinations

A combination is derivable by definition: whatever isn't is a lexeme (lexemes.md §3). Only its lexemes are
stored, in the course text; everything else is derived, and the derived surface form is checked against
what the author wrote.

```mermaid
flowchart LR
  subgraph IN["Stored: in the course text"]
    direction TB
    T1["its lexemes, in order<br/>kitob + ‑lar + ‑im + ‑dan"]
    T2["its setting<br/>(neighbours, pause)"]
  end

  subgraph RULES["Language rules"]
    direction TB
    C3["order and templates<br/>(affix order; root + pattern)"]
    C1["allomorph choice<br/>(‑im after a consonant, ‑m after a vowel)"]
    C2["boundary rules<br/>(vowel reduction, sandhi, assimilation)"]
    P1["projection rules"]
  end

  subgraph OUT["Derived"]
    direction TB
    O1["the combination's lexical form"]
    O2["surface forms<br/>kitoblarimdan · китобларимдан"]
    O3["phonemic forms"]
    O4["features<br/>plural, 1sg possessor, ablative"]
    O5["interlinear gloss<br/>book-PL-1SG.POSS-ABL"]
    O6["morphs: where each lexeme sits"]
  end

  CHECK["compared with the authored text:<br/>a mismatch means a missing rule,<br/>or something that is really a lexeme"]

  T1 --> C3 --> C1 --> C2 --> O1 --> P1
  T2 --> C1
  T2 --> C2
  P1 --> O2
  P1 --> O3
  T1 --> O4 --> O5
  C2 --> O6
  O2 --> CHECK
```

**Combining is more than concatenating.** It works on lexical forms, then projects:
- **order and templates:** affix order; a root interleaved with its pattern;
- **allomorph choice by context:** uz ‑im after a consonant, ‑m after a vowel; ‑qa after q;
- **boundary rules on the lexical form:** Hebrew vowel reduction (דָּבָר + ‑ִים → דְּבָרִים), sandhi;
- **projection rules on the result:** Spanish *da* + *me* + *lo* keeps its stress on *da*, and the
  orthography writes *dámelo* because that stress is now antepenultimate; Persian کتاب + ‑ها is written
  with a ZWNJ; chg puts one before ‑dur.

**What is derived:**
- the combination's lexical form, surface forms and phonemic forms;
- its features: the union of its lexemes' (plural, 1sg possessor, ablative);
- its interlinear gloss (book‑PL‑1SG.POSS‑ABL), mechanically. A natural translation ("from my books") is
  the sentence's job, authored with its accept sets;
- its morphs: where each lexeme's exponent sits. The combining rules must keep track of this.

**A mismatch with the authored text** means a missing rule, or a "combination" that is really a lexeme.
That is the lint from lexemes.md §3.7.

**The span is open-ended.** A word (*kitoblarimdan*) is a combination; so is a phrase (*the writer of X*) and
a sentence. Constructions are rules at the phrase level: apc's *used to* is a periphrastic way of filling a
feature. A construction whose meaning isn't derivable is a lexeme with slots.

### Where lexemes and combinations meet

Some lexemes have an underivable meaning but a derivable form: *writer* (the occupation) is spelled *write*
+ ‑er; fa زمین خوردن "fall" is زمین + خوردن; *darse cuenta*; *kick the bucket*.
- **Such a lexeme stores its parts, not a lexical form**, and its form is combined from them like any
  combination's. Only its meaning is listed.
- **One part is where inflection goes:** زمین خوردم "I fell" inflects خوردن; *me di cuenta* inflects *dar*;
  *kicked the bucket* inflects *kick*. The lexeme names that part.
- **Parts now do two jobs:** the literal gloss (lexemes.md §10) and the form, inflection included.
- So a lexeme stores **either lexical forms or parts**: forms where the form is underivable (*ran*, *casa*),
  parts where only the meaning is.
