# Sources of truth for written languages

- Date: 2026-11-17
- Status: exploration for Ben to read, argue with and cut. Nothing here is decided; any part taken up
  becomes an ADR.
- Related: ADR 0053 (vowel marks), 0054/0095/0098 (pronunciation cards), 0071 (several ruby layers),
  0086 (sitelen pona), 0087 (Attic), 0109 (schemes as data), 0117 (KC readings), 0126 (Jyutping as
  an orthography), 0128/0129 (Chaghatay), 0131 (readings that fade), 0132 (script tracks ask the reading).

## The question

Every course has a layer that represents how the language sounds: the phonemes, or a transcription
standing in for them. It also has the written form the learner is learning to read.

- **Reading direction:** can that written form be turned into the phonemes without loss?
- **Writing direction:** can the phonemes be turned into the written form without loss?
- **Source of truth:** where neither direction is lossless, the course must store both, so what
  exactly must it store, and at what grain?

The answer decides what the app presents, what it tests and how it grades. This document:

1. measures where our ten courses stand (§2);
2. names every combination we can meet, today or with a future course (§3);
3. proposes a data model (§4) and many presentation (§5), testing (§6), grading (§7), audio (§8)
   and authoring (§9) ideas;
4. maps the courses onto them (§10) and ends with a ranked list (§11) and questions for Ben (§12).

## 1. Terms

**Layers.** A sentence or word has several representations:

- **O**, the orthography. A course can have several (uz Latin and Cyrillic, apc Arabic and
  Arabizi). An orthography can have an *unmarked* view (Arabic without harakat) and a *marked* view
  (with them).
- **P**, a phonological layer: a reading scheme or transcription (Jyutping, Pinyin, Baxter,
  Schluessel, the Tiberian reading, Attic with vowel lengths, sitelen Lasina). A course can have
  several *traditions* (lzh reads one text three ways).
- **P′**, a phonetic layer derived from P for voices (`tiberian.ipa`, `attic.piper`). It is never
  shown to learners.
- **A**, audio: a clip, synthesized or recorded.
- **M**, meaning: the sense KC, its gloss, the translation.
- **G**, grammatical annotation: morphs and their form KCs, `persons`, the sentence type.

**Displays of P.** A learner who can't read the script yet needs P shown in letters they already read:
its Latin display, or audio where the voice is good enough. That is P written another way, not a
layer of its own:
- by a rule from P where P isn't Latin (Attic → Latin keeps the lengths: χώρᾱ *chōrā*);
- as P itself where P is Latin already (Schluessel).

A romanization of O, letter for letter, says nothing O doesn't, so the model doesn't need one. The
alphabet tracks used one until ADR 0132; they now ask P in its Latin display (a scheme's `latin`).

**Determinacy.** A mapping from one layer to another is:

- **rule**: computable for any word, even one the course has never seen (uz Latin → Cyrillic by the
  CLDR transform; stripping Hebrew points). A closed table counts as a rule (sitelen pona's glyphs,
  one per word).
- **lexicon**: computable for a known word, one entry per word (the length of a grc α; the vowels
  of a chg word).
- **context**: needs the word's place in its sentence (yue 呀 *aa3* in a statement, *aa4* in a
  question).
- **none**: no fact decides it (free variation: chg یتی / یتتی for *yätti*; hbo plene and
  defective spellings).

Only what a rule can't give counts as *left out*: a predictable feature is part of reading the
script, not a deficiency.

**Source of truth.** The layers a course stores, from which every other layer is derived. A
stored layer that could be derived is redundant: it either agrees with its derivation (wasted
effort) or doesn't (a bug).

## 2. What our courses show

Method: the committed bundles, every word token of every sentence. For each pair of layers the
courses hold, count:

- spellings with more than one reading;
- readings with more than one spelling.

Twins across orthographies are paired by sense and morphs.

The numbers are *within the course's vocabulary*: they measure determinacy at the context level.
Lexicon-level loss (each word has its own reading the learner must know) shows up as zero here,
because each word has one entry. The rule level is noted where a converter exists.

| Course | Pair | A → B ambiguous | B → A ambiguous | Examples |
|---|---|---|---|---|
| uz | Latin ↔ Cyrillic | 0 / 365 | 0 / 365 | The compiler's CLDR check finds 0 mismatches: **rule both ways** |
| tok | Latin ↔ sitelen pona | 0 / 126 | 0 / 126 | The generator is the check: **rule both ways** |
| tok | sitelen pona ↔ lasina | 0 / 120 | 0 / 120 | One glyph, one word |
| grc | spelling ↔ Attic reading | 0 / 349 | 0 / 349 | The reading minus its length marks *is* the spelling in 1055 of 1055 tokens: **P → O by rule**; O → P by lexicon |
| fa | unmarked ↔ marked | 20 / 320 (108 tokens) | 0 | کتاب → کِتاب / کِتابِ: every residual case is the ezafe |
| apc | unmarked ↔ marked | 11 / 699 | 0 | بدك → بَدَّك / بَدِّك (*baddak / baddik*): the addressee's gender |
| apc | Arabic ↔ Arabizi | 16 / 559 | 9 / 564 | بدك → *baddak / baddik*; *ra7* → راح / رح; *bta3rfo* → بتعرفه / بتعرفوا (Arabizi *-o* is both ـه "him" and ـوا "they"); Arabizi *w* is its own word where Arabic joins و |
| hbo | unpointed ↔ pointed | 56 / 640 (315 tokens) | 0 | את → אֶת / אֵת / אַתְּ / אָתְּ; לך → לְךָ / לֵךְ / לֶךְ / לָךְ |
| hbo | unpointed ↔ Tiberian | 62 / 640 (363 tokens) | 0 | both gaps at once: the points and the juncture |
| hbo | pointed ↔ Tiberian | 13 / 708 | 4 / 717 | לֹא *lōʾ / lōʾ-* (maqaf); *lî* ← לִּי / לִי, *lô* ← לוֹ / לּוֹ (dagesh after a vowel-final word) |
| chg | Arabic ↔ Schluessel | 8 / 776 | 2 / 782 | اوزوم *üzüm / özüm*; یر *yer / yär*; ملک *malik / malik-i*; *yätti* ← یتی / یتتی |
| yue | characters ↔ Jyutping | 1 / 289 (102 tokens) | 2 / 288 | 呀 *aa3 / aa4*; *saam1* ← 三 / 衫; *gau2* ← 狗 / 九 |
| lzh | characters ↔ Pinyin | 4 / 217 | 29 / 186 (513 tokens) | 有 *yǒu / yòu*; 見 *jiàn / xiàn*; *yú* ← 于 / 踰 / 於 / 魚 |
| lzh | characters ↔ Jyutping | 4 / 217 | 23 / 192 (427 tokens) | *ji5* ← 爾 / 耳 / 矣 / 已 / 以 |
| lzh | characters ↔ Baxter | 4 / 217 | 10 / 211 (123 tokens) | Middle Chinese keeps distinctions the modern readings merged: *nyin* ← 人 / 仁 |
| lzh | Pinyin ↔ Baxter | 22 / 186 | **1 / 211** | Older → newer is almost a function (sound change merges): only *lak* → *lè / luò*. Newer → older is lossy: *yú* → *hju / yu / 'jo / ngjo* |
| lzh | Jyutping ↔ Baxter | 17 / 192 | **1 / 211** | The same: only *dojx* → *toi5 / doi6* |

es has one orthography and no reading layer, so it has no pair to measure.

**The residual test.** Group tokens by (spelling, sense KC, morph KCs) and ask whether a reading
still varies. Nearly all the ambiguity above disappears:

| Course | Still read two ways | What's left |
|---|---|---|
| lzh | 0 / 227 | nothing: polyphones are already split into senses (知, 知.zhi) |
| yue | 1 / 298 | 呀 *aa3 / aa4*: the sentence type |
| apc | 2 / 725 | بدك, سلامتك: the addressee's gender, carried by `persons` but not used |
| chg | 3 / 783 | *malik / malik-i*, *āwāz / āwāz-i*: the ezafe, an unmodelled morpheme; یر *yer / yär*: variation or a data question |
| fa | 19 / 330 | the ezafe, every one |
| hbo (pointed → Tiberian) | 13 / 708 | maqaf binding, a juncture |
| hbo (unpointed → pointed) | 40 / 666 | pausal forms (לַיְלָה / לָיְלָה), construct vs absolute (אֶחָד / אַחַד), juncture (תְּהוֹם / תְהוֹם) |

**Rule-level checks.** PyCantonese disagrees with yue's pinned Jyutping 186 times:

- 141 are 呀 (*aa3* pinned, *aa4* PyCantonese): context.
- 30 are 呢 (*ni1* "this" vs *ne1* the particle): sense.
- The rest are literary vs colloquial readings (平 *peng4 / ping4*, 名 *meng2 / ming4*) and changed
  tones (女兒 *ji2*, 英文 *man2*): variation within one tradition.

**What this says.** Once sense and morphs are known, the residue has exactly five kinds:

1. unmodelled morphemes (the ezafe, construct state);
2. juncture and pause;
3. sentence type;
4. persons;
5. genuine free variation.

Each can be lifted into structured annotation, after which every reading is a function of the
annotations (§4.4). That is the strongest result here.

## 3. Every combination

### 3.1 One orthography, one phonological layer

Each direction is determinate at one of four levels: rule, lexicon, context or none. That gives
sixteen cells, and they collapse into seven classes by what must be stored.

| Class | O → P | P → O | Store | Ours | Elsewhere |
|---|---|---|---|---|---|
| **Transparent** | rule | rule | either one; derive the other | tok (both scripts), uz, yue-Latn (Jyutping) | Finnish, Georgian, Serbian |
| **Reading-transparent** | rule | lexicon or none | O; derive P | es (b/v, silent h) | Turkish, Italian |
| **Writing-transparent** | lexicon or context | rule | P; derive O | grc (strip length), hbo pointed → unpointed, fa/apc marked → unmarked | Latin (macrons → plain), Russian with stress marks, Yoruba with tone marks |
| **Lexical both ways** | lexicon | lexicon | both, per lexeme; derive per token | yue for most words, chg for most words | Japanese kanji readings, English |
| **Contextual** | context | lexicon or context | both, per token, plus the context feature that decides | yue 呀, hbo maqaf, fa ezafe, apc -ak/-ik | Hebrew unpointed, Thai segmentation, Japanese 生 |
| **Variable** | any | none | O as a set: a canonical spelling plus its variants | chg یتی / یتتی, apc راح / رح, hbo plene/defective | pre-standard English, Arabizi generally |
| **Opaque** | lexicon only (no letter-to-sound rule at all) | lexicon, with M deciding the graph | both, per lexeme | lzh, yue characters | Chinese, Egyptian, Maya |

sitelen pona is logographic, but its table is closed and one-to-one, so it is Transparent: being
logographic doesn't make a script opaque; an open table does.

Two refinements:

- **Rule with exceptions.** A transparent orthography still has loanwords, names, numerals and
  abbreviations whose reading the rule gets wrong (es *pizza* [ˈpitsa], *México* [ˈmexiko]; uz
  Russian loans). Store O, derive P, and *pin P per token only where the rule fails*. A pin the
  rule already gives is a lint warning.
- **Rule with a richer O.** Sometimes the full truth is an O we strip for display. hbo's reading is
  a rule from the *accented* Westminster text (stress from the accent, maqaf from the punctuation);
  our displayed text drops the accents and so drops the stress. The true source is the fuller O,
  and the displayed O is derived from it.

### 3.2 Several orthographies (uz, apc, yue, tok)

Each pair of orthographies is its own edge with its own level in each direction.

- **uz Latin ↔ Cyrillic:** rule both ways. Store one.
- **tok Latin ↔ sitelen pona:** rule both ways (with names in cartouches). Store Latin; sitelen pona
  is already generated.
- **yue characters ↔ Jyutping:** lexicon and context one way, lexicon the other. Jyutping is already
  generated from the characters' pinned readings, so P is stored as ruby and the Jyutping
  orthography is derived.
- **apc Arabic ↔ Arabizi:**
  - Arabic → Arabizi: vowels are missing (lexicon and context).
  - Arabizi → Arabic: variation (راح / رح); Arabizi often writes emphatics as plain letters, and its
    *-o* is both ـه and ـوا.
  - The two **disagree on word boundaries**: Arabizi writes *w* "and" as a word, Arabic joins و to
    the next word.

  Store both, aligned by morph, not by word.

New thing to model: **boundary mismatch.** Two orthographies can tokenize the same sentence
differently (clitics, compounds, Chinese words vs characters). Alignment must go through morphs.
The twin pairing used in this measurement already shows the noise: an Arabizi *enta* paired with
an Arabic سالم.

### 3.3 Several phonological layers (traditions)

lzh has three; hbo and grc each picked one of several (Tiberian, Attic).

- **Between traditions, older → newer is close to a rule** (sound change merges). Baxter → Pinyin
  is ambiguous for 1 of 211 readings. Newer → older is lossy (Pinyin → Baxter, 22 of 186). That
  suggests storing the most conservative layer and deriving or checking the others, though only
  where a regular correspondence exists. Mandarin literary readings have exceptions, so this stays
  a check, not a generator.
- **Within one tradition, readings vary:** literary vs colloquial (yue 平 *ping4 / peng4*), changed
  tones (yue 女兒 *ji2*), regional (apc Beirut vs elsewhere). These are variation in P, and accept
  sets for typed readings must allow them where the course does.
- **A learner may choose a tradition.** lzh already lets them pick the layer shown. Cards could ask
  in the chosen tradition (see §6).

### 3.4 Marked and unmarked views of one script (fa, apc, hbo)

The marked view is an **in-script P**: it carries most of what P would.

- Marked → unmarked is always a rule (strip the marks).
- Unmarked → marked is lexicon or context (§2).
- The marked view can still fall short of P:
  - hbo's points don't show stress or maqaf binding;
  - Arabic harakat don't mark stress (fa, apc), which a voice needs;
  - Arabic vowel points have one damma for *o ö u ü* and one kasra for *i e ä*, so even fully pointed
    Chaghatay wouldn't settle its vowels.

  That last case is why chg reads with a separate P (Schluessel, ADR 0128/0129) rather than marks.

### 3.5 The phonological layer is itself deficient

P is a choice of granularity, and it can leave out what audio needs:

- **Schluessel** marks no stress.
- **SBL transliteration** needs `tiberian.ipa` to become Khan's phonetics.
- **Pinyin** writes citation tones, not sandhi (你好 *nǐ hǎo* is said *ní hǎo*; 不 *bù* before a fourth tone is *bú*).
- **Jyutping** writes changed tones only where the course pins them.

So there is a P → P′ edge. It's usually a rule (IPA conversion) with lexical exceptions (stress).
Audio is generated from P′, and a reading card tests P, never P′.

### 3.6 Readings that depend on meaning or grammar

The residue in §2 shows five context features. Each has a natural home:

| Feature | Example | Home |
|---|---|---|
| sense | 知 *zhī / zhì*, 呢 *ni1 / ne1* | sense KCs (already) |
| morpheme | ezafe (fa, chg), construct state (hbo) | a morph with a form KC (`form:ezafe`, `form:construct`) |
| persons | apc *baddak / baddik* | `persons` tags, which already decide accept sets |
| sentence type | yue 呀 *aa3 / aa4* | a sentence attribute (statement, question), derivable from punctuation |
| juncture and pause | hbo maqaf, pausal forms, dagesh after a vowel-final word | token attributes `bound: true`, `pausal: true` |

### 3.7 Edge cases to anticipate

- **Mixed scripts within an O:** Japanese kanji + kana, where only the kanji need ruby; Arabizi
  with English code-switching; Latin brand names in Persian text.
- **Numerals and abbreviations:** fa ۲۵ read *bist-o-panj*. The digits are an orthography of their
  own with their own reading rules (the pipeline's RBNF number drills).
- **Names:** readings that no rule or lexicon of common words gives (yue 美玲 *mei5 ling4*).
- **Abugidas** with inherent vowel deletion (Hindi schwa deletion): O → P is a rule with
  exceptions.
- **Morphophonemic orthographies** (Korean 국물 → [kuŋmul]): O → P is a rule, P → O is lexicon
  (which morpheme?).
- **Syllabaries that under-specify** (Cherokee: no tone or length; Linear B): like an abjad.
- **Scripts with positional forms only** (Greek final ς, Arabic letter joining): no deficiency;
  these are graphic, not phonological.
- **Logo-syllabic scripts with determinatives and phonetic complements** (cuneiform, Egyptian):
  opaque, with partial rules. They would need per-sign readings plus readings of the word.
- **One text, several reading lects:** literary Chinese read in Mandarin, Cantonese, Middle
  Chinese or Japanese (kanbun); English read in any accent. P depends on the learner's chosen lect,
  as with traditions (lzh already is this).

A few hypothetical future courses, to check that the classes hold:

| Language | Class | Store | Notes |
|---|---|---|---|
| Japanese | opaque + transparent (kana) | O, plus per-token kanji readings | ruby only over kanji; kana are a rule |
| Korean | transparent with morphophonemics | O | P by rule (sandhi); spelling tests are lexicon |
| Russian | writing-transparent from stressed P | P (with stress) or O + stress pins | stress is the only gap; ё is optional |
| Hindi | rule with exceptions | O + schwa-deletion pins | |
| Thai | contextual (segmentation, tone rules) | O + word boundaries + tone pins | tone mostly by rule from class + marks |
| Mongolian (traditional script) | lexical both ways | both | o/u, ö/ü, t/d share letters, like chg |
| Uyghur (modern Arabic script) | transparent | O | a fully vowelled Arabic script: no gap |
| Ottoman Turkish | like chg | both | the closest relative of what we already do |
| Yiddish | nearly transparent; Hebrew-origin words lexical | O + pins for Hebrew-origin words | rule with a lexical class of exceptions |
| Vietnamese | transparent | O | |
| English | lexical both ways | both, or O + exception pins | the worst-case Latin orthography |

## 4. A data model: the layer graph

### 4.1 Declare the layers and the edges

Profiles already hold pieces of this:

- `transliterate: {to, via}` (uz, tok, yue, apc);
- `scriptTrack` and a scheme's `latin` (the alphabet tracks ask P in Latin, ADR 0132);
- `annotations` (ruby and marks layers);
- reading schemes with `answer`, `typed`, `variants` and `typedByProfile`.

One declaration could replace the scatter. A sketch, not a schema:

```yaml
# course.yaml
layers:
  orthographies: [chg-Arab/standard]
  readings: [schluessel]
edges:
  - { from: chg-Arab/standard, to: schluessel, level: lexicon, context: [sense, morphs, ezafe], pinned: token }
  - { from: schluessel, to: chg-Arab/standard, level: lexicon, variation: true }
  # (no edge to Latin: Schluessel is its own Latin display, the scheme's `latin`)
store: [chg-Arab/standard, schluessel]
```

```yaml
# uz
edges:
  - { from: uz-Latn/standard, to: uz-Cyrl/standard, level: rule, via: cldr-transform }
  - { from: uz-Cyrl/standard, to: uz-Latn/standard, level: rule, via: cldr-transform }
store: [uz-Latn/standard]          # Cyrillic derived; a pinned Cyrillic form is an exception
```

```yaml
# grc
edges:
  - { from: attic, to: grc-Grek/polytonic, level: rule, via: strip-length }
  - { from: grc-Grek/polytonic, to: attic, level: lexicon }
store: [attic]                      # or keep both and check them against each other
```

### 4.2 What the compiler does with it

- **Derive** every layer not in `store` and write it into the bundle as today.
- **Check** every stored layer that could be derived. Disagreement is an error unless the token pins
  an exception. Each course does part of this its own way today:
  - uz Cyrillic and tok sitelen pona: `enrich.transliteration-mismatch` (an info);
  - fa and apc vocalizations: `vocalization.mismatch` (an error);
  - grc: a pytest (`test_attic_greek_pins_every_vowel_length`);
  - yue: PyCantonese, `enrich.reading-mismatch` (a warning, 186 of them).

  One mechanism, with one severity per declared level, would replace the four.
- **Require** a pin wherever the edge's level is lexicon or context and no derivation exists. The
  compiler's `enrich.missing-reading` already does this for ruby layers, and course tests do it for
  the rest (grc, hbo); the graph would make it one rule for every lexicon-level edge.
- **Warn** on a pin that a rule already gives: redundant data drifts.
- **Residual check (§4.4):** where an edge declares its context features, two tokens with the same
  spelling and features but different readings are an error, unless the edge declares variation.

### 4.3 Grain: language, lexeme, token

ADR 0117 already chooses a KC's reading from its tokens. Make the grain explicit:

- **language:** a rule;
- **lexeme:** per KC, the default for its tokens;
- **token:** a per-sentence pin, only where context decides.

A token pin that equals its KC's reading is redundant. A KC whose tokens disagree, with no context
feature to explain it, is a modelling gap.

### 4.4 Lift context into annotation

The residue of §2 has five kinds, and each has a home (§3.6):

1. **Ezafe** (fa, chg) as a morph with `form:ezafe`. fa already has `construction:ezafe` as a KC; it
   would become the morph that a token's kasra or *-i* spells. The reading then follows from the
   morphs.
2. **hbo construct state** as a form KC; **maqaf binding and pausal forms** as token attributes. The
   Tiberian reading's final "-" already encodes binding by convention; this makes it data.
3. **Persons** decide apc's *-ak / -ik*: the vocalization of a suffix morph comes from the
   sentence's `persons`, as accept sets already do.
4. **Sentence type** decides yue's 呀. Punctuation (？) can supply it; a sentence attribute can
   override it.
5. **Variation** is declared: a token lists its variants (spellings or readings), and the canonical
   one comes first.

After this, the residual test of §2 passes with zero, and the compiler can enforce it.

### 4.5 A determinacy report: `nabu truth <course>`

The measurement in §2 as a command:

- per edge, the counts and examples at each level;
- the residual;
- PyCantonese-style disagreements;
- redundant pins.

Run it in CI per course, with a committed summary, so a change in the numbers shows up in review,
as the bundle hashes do. The Chaghatay vowel-set page (an artifact) was a one-off version of this
for one edge.

## 5. Presentation ideas

By class:

- **Transparent:** nothing to show; audio is the P. An optional IPA layer for learners who want one
  (Preferences, off by default).
- **Reading-transparent with exceptions:** a reading shown *only on the exception* ("exception
  ruby"): es *pizza* gets [ˈpitsa], nothing else gets anything. The learner learns that the rule
  holds except where marked.
- **Writing-transparent (P stored):** show P *inside* O where the script allows: grc with
  macrons and breves (ᾱ, ᾰ) as a "full spelling" view, like hbo's points or fa's harakat. One
  display mode, three courses.
- **Lexical or contextual:** ruby or marks, fading by facet (ADR 0131, built), plus:
  - **Minimal ruby:** show only what the script leaves out, not the whole reading.
    - chg: only the vowels, as small marks or a vowel-only ruby (*-ü-ü-*).
    - yue: only the tone number over a character a learner can already read (*⁵* over 我).
    - grc: only length, over α ι υ.
    - fa: harakat only on words that are ambiguous within the course (the 20 types), not on every
      word.
  - **Ambiguity marking:** a dotted underline on homographs ("this spelling has two readings in
    the course"), tapping to show both with their meanings: اوزوم *üzüm* "grape" / *özüm*
    "myself".
  - **Open-letter highlighting** (chg, mainly as a teaching aid): tint the letters whose reading is
    open (و, ا, ی, ک) in new words, so a reader learns where to look.
  - **Context cues:** show an ezafe as a visible joiner (کتابِ من with the kasra emphasised); for
    yue 呀, show the sentence type ("question") under the line in teaching cards.
- **Variable:** show the canonical spelling. Under feedback, note "also spelled یتتی" when the
  learner typed the variant. Never mark a variant wrong.
- **Opaque (logographic):** reading ruby with fading (built). Optionally decompose a character into
  its phonetic component (a later idea, needing data per character).
- **Several traditions:**
  - a tradition picker (lzh has one) that every view respects;
  - a comparison card as enrichment: 見 *jiàn / gin3 / kenH*, 見 "appear" *xiàn / jin6 / henH*.
- **Several orthographies:**
  - a dual-script view (uz Latin over Cyrillic, apc Arabic over Arabizi), aligned by morph;
  - a "show in the other script" tap on any word.
- **Scaffolding over time:** all readings → new words only (built) → ambiguous words only → none,
  per learner and per word, with the learner able to step back at any point.

## 6. Testing ideas

### 6.1 Skills are edges

Each edge of the graph is a skill, and the facets map onto edges:

| Edge | Facet | Cards now | Cards to consider |
|---|---|---|---|
| O → M | recognize | choose-translation, select-image, match-pairs, translate-tap.l2-l1, gap-fill | |
| M → O | produce | translate-type.l1-l2, translate-tap.l1-l2, complete-translation | spelling-choice (6.3) |
| O → P | read-script | vocalize, char-read, transcribe, reading-disambiguation, word-read | feature cards (6.2), homograph-in-context cards |
| P → O | write-script | word-write (alphabet track) | dictation of known words, spelling-choice |
| A → M, A → O | listen | listen-select, listen-tap, listen-type | |
| O or M → A | speak | speak, speak.tier-0, listen-speak | |
| A → P | (listen) | tone-identify, minimal-pair | |
| O₁ → O₂ | (convert) | script-convert nodes (uz, apc; not yet running) | |
| P₁ → P₂ | (none) | | tradition cards (lzh, enrichment only) |

**Facets could follow from the graph.** An edge that's a rule needs no ongoing drill, only a few
teaching cards (or none). An edge at the lexicon or context level gets the facet. Today `facets` is
set by hand in four courses (lzh, hbo, grc, chg); derived from the edges, it would be right by
construction. uz would never get read-script drills, and chg always would.

### 6.2 Feature cards: ask only what the script leaves out

tone-identify already asks one feature (a syllable's tone). Generalize:

- **chg:** "Which vowel? ü / ö / u / o" on the first syllable of اوزوم, the rest of the word shown.
- **grc:** "Long or short?" on the α of χώρα.
- **fa:** "Is there an ezafe here?" on کتاب من.
- **apc:** "Which form here?" *baddak / baddik*, where the persons tag decides.
- **hbo:** "Bound or free?" (maqaf); qamets *ā* or *o*.
- **Russian, if it ever comes:** "Where is the stress?"

These are fast and diagnostic: a miss says exactly which feature the learner lacks. They could
credit a feature KC (`reading:vowel-front`, `reading:length`) as well as the word, so the planner
can aim practice at the feature.

### 6.3 Spelling choice: the writing-side twin of reading cards

Where P → O is lossy (homophonous letters, homophonous characters, variation), ask the spelling:

- **fa:** /sad/ "hundred" → صد, not سد ("dam"), in a sentence.
- **yue:** *saam1* "shirt" → 衫, not 三.
- **hbo:** plene or defective → both accepted.

Wrong options come from **homophone letter sets** on the profile, the writing-side twin of a
scheme's `variants`: fa `[س, ص, ث] [ز, ذ, ض, ظ] [ت, ط] [ه, ح] [ء, ع] [ق, غ]`; chg inherits them. For
logographic scripts, wrong options are the course's homophone characters (the yue profile's
`homophones` table, which grades an IME slip today).

### 6.4 Dictation only where it's fair

listen-type asks P → O. It's fair when P → O is a rule, or the lexicon of words the learner knows.
For an opaque orthography it's fair only through an IME (yue already). For chg it would need the
spelling of every word known; for hbo, plene vs defective must be accepted. So gate dictation on
the edge level and the words' state, as the planner gates other cards.

### 6.5 Homographs in context

Pair two sentences that use one spelling two ways ("Read اوزوم here: *üzüm* or *özüm*?") and ask
each in turn. reading-disambiguation does this for Han characters. Generalize it to any course
whose residual report lists homographs: chg, hbo, fa (ezafe), apc (persons).

### 6.6 Rule drills, where a rule is the skill

Some edges are rules but not trivial: uz Latin ↔ Cyrillic (the convert nodes), vowel harmony in
chg suffixes, hbo dagesh after a vowel, Korean sandhi. A few cards that apply the rule to new
words teach it, then stop once the learner shows it.

### 6.7 Reading aloud

speak cards graded against P (tier 1–2 scoring) are the most direct reading test there is. Where
no scoring exists, a self-rated "read it aloud, then hear it" card (speak.tier-0) still tests
reading: hbo and grc have it (their `facets` include speak). chg could too, since P exists even
where no voice is good enough to rely on.

### 6.8 Teach the deficiency explicitly

A short intro card per course, generated from the graph and the report:

- chg: "Chaghatay writes few vowels: و can be *o, ö, u, ü*; ک can be *k* or *g*."
- fa: "Persian doesn't write the ezafe."
- yue: "Characters don't say how they're read; 呀 changes with the sentence."

A learner told where to look can look there.

## 7. Grading ideas

- **Grade each answer in the profile of the layer it's in:**
  - typed readings in the reading scheme's profile (chg-Latn/schluessel, yue-Latn/jyutping);
  - typed spellings in the orthography's.

  Built for chg and yue.
- **New outcomes, each with a conformance vector in both harnesses:**
  - **right sound, wrong letter:** fa سد for صد; yue 三 for 衫. A course decides whether it's wrong
    or accepted with a note. Today it's graded like any other letter: a typo if the keyboard model
    calls it one, WRONG_WORD if it spells another word of the course, otherwise wrong.
  - **right letters, wrong reading:** a homograph read as its twin (*özüm* for *üzüm*): WRONG_WORD
    with a note naming the other word.
  - **variant spelling:** accepted, with "also spelled".
  - **other tradition:** a Mandarin reading typed on a Cantonese card. Wrong, with a note naming the
    tradition, since the learner knows the word.
  - **feature slip:** the gap feature is never a typo (tones in Jyutping, vowels in chg, length in
    grc). This is the open question from chg's typed cards: today a missing ü there passes with a
    note.
- **Typos stay typos only outside the gap:** a keyboard slip on a consonant the script writes is a
  typo; one on the feature the script leaves out isn't.

## 8. Audio

- Synthesize from the most specific P (or P′), never from a lossy O. hbo (Tiberian), grc (Attic)
  and tok (lasina) do this, and apc reads its vowel-marked text. yue is the exception: its voice
  reads only characters (ADR 0094), and the round trip catches misreadings. From the graph, the
  rule is that a voice's input is the layer with no loss.
- The round-trip check compares in P: Whisper hears audio → P, compared with the pinned P. yue's
  check compares characters by reading already.
- **Recordings as a source of truth.** A native recording is A at the top of the graph. Align it
  (forced alignment) to the pinned P, and a disagreement flags the P for review, not the
  recording. For living dialects (apc Beirut), the recording is the tradition.

## 9. Authoring and review

- **Author only the stored layers;** generators fill the rest. Today there's one command per course
  (`nabu jyutping`, `nabu sitelen-pona`, `nabu tiberian`, `nabu attic`, vocalization files). A
  single `nabu derive <course>` driven by the edges would replace them, with the per-scheme plug-ins
  they already use.
- **Review sees derived layers next to stored ones,** with disagreements and residuals listed. The
  vowel-set page is an example of this view for one edge; a general layer explorer would serve
  every course.
- **Adding an orthography or tradition** means declaring its edges and running the report. The
  report says what must be pinned and how much.
- **Reviewers fix structure, not strings:** when a residual appears, the fix is a sense split, a
  morph or an attribute (§4.4), never a hand-edited reading that hides the cause.

## 10. Our courses, now and proposed

| Course | Stored now | Class | Proposed basis | Quick wins |
|---|---|---|---|---|
| tok | Latin, sitelen pona (generated, checked) | transparent | Latin | none needed |
| uz | Latin, Cyrillic (checked by CLDR) | transparent | Latin; derive Cyrillic | drop the hand-kept Cyrillic, keep pins only for exceptions |
| es | O | reading-transparent | O | exception pins for loanwords if a voice misreads them |
| grc | spelling + Attic reading per token | writing-transparent | Attic; derive spelling | move the pytest's spelling = strip(reading) check into the compiler (1055/1055 today) |
| fa | O + vocalization (per KC, token overrides) | lexical + contextual (ezafe) | O + vocalization + `form:ezafe` | make the ezafe a morph; residual → 0 |
| apc | Arabic + vocalization + Arabizi | lexical + contextual (persons) + variable | Arabic + vocalization, Arabizi aligned by morph | vocalize -ak/-ik from `persons`; Arabizi variants as sets |
| hbo | pointed + Tiberian per token | writing-transparent from the accented text | the accented WLC word (from which `nabu tiberian` already derives the reading) | `bound` and `pausal` token attributes; `form:construct` |
| chg | Arabic + Schluessel per token; chg-Latn KC forms (now read only for letters, ADR 0132) | lexical + contextual (ezafe) + variable | Arabic + Schluessel | `form:ezafe`; spelling variants as sets; check یر *yer / yär*; drop the word KCs' chg-Latn forms |
| yue | characters + Jyutping per token; Jyutping orthography generated | opaque + contextual (呀) | characters + Jyutping | sentence type for 呀; changed tones and literary readings as declared variation |
| lzh | characters + three readings per token | opaque, several traditions | characters + Baxter + per-tradition pins | check Pinyin and Jyutping against Baxter by regular correspondence, as a lint only |

## 11. What to do first, ranked

1. **`nabu truth <course>`** (§4.5). Small: the measurement in this document as a command and a CI
   summary. Everything else is easier to argue with numbers on hand.
2. **Make the existing checks one mechanism** (§4.2): grc's pytest, fa/apc's `vocalization.mismatch`, uz/tok's
   transliteration lint and yue's PyCantonese warnings. Raise uz's to an error (it holds at 0). Small, and it
   catches drift before any restructuring.
3. **The residual check and lifting context into annotation** (§4.4):
   - `form:ezafe` for fa and chg;
   - `persons`-driven vocalization for apc;
   - sentence type for yue 呀;
   - `bound` and `pausal` for hbo.

   Medium. After it, every reading is a function of its annotations, and the compiler can hold it
   there.
4. **Decide the grading outcomes** (§7), starting with "feature slip" (chg's typed readings tonight
   accept a missing ü) and "right sound, wrong letter" (fa). Small code, real decisions: an ADR
   with conformance vectors.
5. **Feature cards** (§6.2), generalizing tone-identify. Medium. Starts with chg vowels and grc
   length.
6. **Spelling choice with homophone letter sets** (§6.3). Medium. fa, chg, yue.
7. **The layer graph in the schema** (§4.1), replacing `transliterate` and the scatter.
   Large: an ADR, codegen, the compiler, the bundle. Worth it once 1–3 show where it pays.
8. **Facets from the graph** (§6.1), after 7.
9. **Minimal ruby and ambiguity marking** (§5). Medium, UI only, independent of the rest.

## 12. Questions for Ben

1. Is "reading = function of (spelling, sense, morphs, persons, sentence type, juncture)" the
   invariant you want the compiler to enforce, with variation as the only declared exception?
2. The ezafe as a morph: right for fa and chg both? It changes how ezafe sentences are annotated
   (a morph on the head noun) and adds a form KC each.
3. Feature slips: should a missing vowel mark in chg typed readings be wrong (consistent with the
   choice cards) or noted (kinder on phones)? The same question applies to grc length and yue
   tones; yue already says wrong.
4. grc: should the Attic reading be the only stored layer, with the Greek spelling derived from it?
   It would mean authoring in the reading, which is less natural than authoring in Greek. The
   alternative is to keep both and check.
5. Traditions: should learners pick one per course (lzh does), and should cards ever ask in a
   tradition other than the chosen one?
6. Which matters more next: reading-side tools (feature cards, minimal ruby) or writing-side tools
   (spelling choice, homophone letters)?
