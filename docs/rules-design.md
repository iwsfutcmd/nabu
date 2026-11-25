# Rules in a lexicon: the design (apc first, then Spanish's verbs)

- Status: a draft for the owner, 2026-11-22. Nothing here is built. The owner chose rules in a lexicon, apc
  first, as the next piece of work that day; this is the design it would be built against. What is stated as
  decided below is the builder's reading of ADRs 0145, 0146, 0148, 0152, 0153 and 0154; what is the owner's is
  asked at the end, in six questions. Stage 1 needs none of the six.
- **The owner answered the six on 2026-11-23** (section 8, "The owner's answers"): 1 the he-past first; 2 follow
  Kline; 3 the compiler lists forms; 4 a card without a sentence; 5 a memory per branch now (against the
  draft's pick); 6 Arabizi's spellings free, one at a time. Where the text above section 8 still says
  otherwise (stage 5's "no memory"), the answers stand.
- Drafted by a reading pass over the ADRs, the notes, the data and the code. Its counts were made by read-only
  scripts on main at 92421c35; two were run again (the pinned forms per language; the three short stems).
- Builds on: [ADR 0145](adr/0145-lexical-model.md) (realisation, blocking, the three statuses of a form),
  [0146](adr/0146-what-is-learned.md) (a rule's parts; seen is logged), [0148](adr/0148-projections-and-misses.md)
  and [0153](adr/0153-projections-as-built.md) (projections are the profile's; the label regularised),
  [0152](adr/0152-a-word-and-its-parts.md) (built words), [0154](adr/0154-seven-decisions-from-the-notes.md) 1
  (the lemma is a realisation), [lexical-forms/apc.md](lexical-forms/apc.md) and the owner's rulings on it.
- Each stage gets an "as built" section here when it lands, as migration-design.md has, and at the end an
  ADR (Proposed) of where the build read the ADRs narrowly, as 0153 does.

## 1. What there is today

Counted on main at 92421c35 with read-only scripts over `lexicons/`, `courses/` and `docs/lexical-forms/`.

**apc's lexicon** (370 lexemes): NOUN 129, VERB 47, ADJ 37, INTJ 31, PRON 31, ADV 26, NUM 24, PROPN 16, ADP
10, SCONJ 5, DET 4, AUX 3, CCONJ 3, PART 3, one value head (`lexeme:dual`). No entry has a `form`, `classes`,
a listed form or a `statement`. 101 entries carry **267 forms, all `pinned`**: VERB 188, ADJ 39, INTJ 13,
NOUN 13, AUX 8, PRON 6. 42 entries carry 48 allomorphs, pinned spellings with no condition.

**What apc's course writes.** Per orthography 485 verb tokens, 473 outside the citation cell (the he-past):
**191 distinct (lexeme, feature values) pairs** for VERB, 10 AUX, 39 ADJ, 7 NOUN. 114 Arabic-script verb
tokens also write suffixed pronouns (`badd` + `poss-1sg` 68, `la-1sg` 24, `obj-1sg` 18). Of 1,166 tokens
outside their citation cell (both orthographies, every category), 1,148 match a pinned form of that cell and
spelling (marks aside); the other 18 belong to five multi-word lexemes (`shu-bak`, `kell-sene`, `3a-albak`,
`allah-ybarek`, `3mol-ma3rouf`) pinned as whole phrases.

**Nothing reads the pinned forms.** The compiler checks their shape only (`lexicon.form`), never against the
tokens, and `_bundle_lexicon` does not ship them. They are a second copy of what the tokens write, held
against nothing: removing one changes no byte of a bundle.

**Verb lemmas.** 31 of the 41 verbs with radicals show, as their first spelling (what a word card shows), a
form that is not their citation cell: `3emel` is spelled *ba3mel*, `ra7` *bru7*, `fehem` *fhemt*,
`eshteghel` *bishteghel*. ADR 0154 (1) has the lemma be the citation cell's realisation.

**docs/lexical-forms** (the owner ruled on its six questions, 2026-11-20 and 21). `apc.yaml`, written by
`docs/prototypes/apc-lexical-forms/build.py`, holds per spelled lexeme (352) its drafted form, its four
projections (Arabic, marks, Arabizi with free spellings, phonemes) beside what the course pins, and a review
note; per verb (41) its radicals, Form, vowels and Kline's two citation forms, `source`, and for eleven a
`basis`; the 256 verb forms the sentences write, pinned; each affix's shapes with counts, and no form.
`authored.yaml` (by hand) holds the verbs' data, each participle-shaped word's head, and the Form I
participle's template with its `back` letters (REVIEW). What `build.py` checks: of 1,025 distinct words, 951
come back in all three spellings, 65 differ in one, 9 have no form; of 354 listed forms 314 come back; for
58 of 74 reviewed clips the marks are the voice's (هَيدا/هَيدي's glide in 15); the template gives the 9
participle forms of `seken`, `2a3ed`, `wa2ef`, `nezel`. It does no conjugation, no affix forms, no stress, no
helping vowel inside a word, no other pattern; and it is Python (`lexform.py`), so none of it can ship:
realising and matching belong to core.

**Spanish, second.** 721 lexemes, 835 pinned forms, of which 642 are verbs' (VERB 603, AUX 39) on 163 of
165 verb lexemes; no `classes` stated, ten gender defaults. The course writes 2,014 verb and auxiliary
tokens outside the infinitive, 643 distinct pairs; 3,445 of its 3,473 inflected tokens (all categories)
match a pinned form, the rest being `tener-que` and `palma-real` (pinned as phrases) and nouns whose tokens
choose their gender (`hermanos`). Some cells leave a value out where forms coincide (*hablaría*:
`{Mood: Cnd, Number: Sing, VerbForm: Fin}`, no Person).

## 2. What a rule is here

In ADR 0145's terms: a lexeme with a **cell** (the feature values its token chooses) is **realised** into a
lexical form, which each orthography's projection spells. Realising is one function, run in core, in this
order:

1. **Blocking, the Elsewhere lookup.** Among the lexeme's `forms` (pinned or listed) whose `feats` are a
   subset of the cell, the most specific wins. One with `form` is the whole answer (*fue*); one with `stem`
   is the stem the rules continue (*tuv‑*). Two equally specific are an error (`lexicon.tie`) unless marked
   free variants. **Blocking off** skips listed forms and stated classes and keeps pinned ones (ADR 0145):
   its output, where it differs, is the regularised form.
2. **The stem.** A lexical form that is a string is its own stem. A `RadicalForm` is put through the
   language's **stem templates**, chosen by its Form, its **root class** (computed from the radicals by the
   language's conditions, never stored) and the stem the cell selects (apc: the perfect's long and short
   stems, the imperfect stem). A template is a pattern's allomorph: digits for radicals, the pattern's own
   letters and vowels around them, `{past}` and `{present}` for the vowels the Form leaves open.
3. **Affix blocks**, in order. Each block is a list of exponents keyed by feature values; the most specific
   whose values the cell has applies (Pāṇini; Stump's blocks), and at most one per block. An exponent may
   also select the stem (apc: the short perfect stem for first and second persons).
4. **Allomorphs of the token's other lexemes** (a suffixed pronoun, the dual), by what they follow (`after`).
5. **Ordered rewrite rules** of the language over the lexical form: apc's prefix vowel, prothetic alef,
   syncope, helping vowel, ة as ت before a suffix.
6. **Projection** into each orthography and the marked layer the voices read, by the profile (section 3).

A rule matches **letters with their sets of marks**, never code points in a row (NFC puts a fatha before a
shadda, classes 30 and 33, where apc.md names the shadda first); `+` boundaries are kept until projection.

**Patterns.** The participle's templates are one set with two heads (ADR 0145). They are stored once, on a
pattern lexeme (`lexeme:fa3il`, `head: {takes: [VERB], makes: NOUN}`, `form: {templates}`: the schema's
`PatternForm`). The verb's `Aspect=Part` cells take their stem from it (a value head: a form of the verb);
the agentive noun is a derivative on the same templates, which keeps the short vowel syncope drops
(*ketbe* against *ketibe*). In the first cut the agentive stays a stored lexeme (`m3allem`, with `base` and
`pattern` links); computing derivatives waits.

**The first cut covers** (apc, every branch REVIEW until the owner signs it off):
1. **The suffix conjugation** (`Aspect=Perf`), all eight cells, by root class: sound with a past in a or i,
   hollow (long stem راح in the third persons, short stem رُح before a consonant ending), doubled, defective;
   Forms II, III and VIII by their templates; syncope of the stem's last short vowel before a vowel-initial
   ending (عِمِل + ـوا → عِمْلوا *3emlo*; she-past as the speaker's *áklit*, so عَزْمِت *3azmet*, ruling 7);
   the helping vowel before the past's -t (رُحِت, شْرِبِت).
2. **The prefix conjugation** (`Aspect=Imp`, `Mood=Sub` and `Mood=Ind`): person prefixes ت ي ن and none
   for I; the indicative's ب (and ب + ن as من); the prefix's vowel, i before a cluster and a before ع
   (*bishrab*, *ba3mel*), none before a consonant with a vowel (*bru7*); the prothetic alef (*eshrab*);
   the endings -i and -o.
3. **The command** (`Mood=Imp`): the present stem with the prothetic alef, -i, -o.
4. **The participle** (`Aspect=Part`), Form I only, from `authored.yaml`'s template, its long a said e
   unless a back consonant precedes (REVIEW, ruling 3).
5. **Nouns and adjectives:** the feminine ة, -e or -a by the letter before (REVIEW); the adjective's plural
   -in; the dual -en, with ة as ت; the suffixed pronouns (possessive, object -ni, dative la-) with their
   allomorphs by what they follow; ة as ت before a suffix (عيلتي); the helping vowel inside a word, before
   an ending that begins with a said consonant (بِنِتْكُن) and not before a vowel or the silent ه (بِنْتي,
   بِنْتْهُن), as ruled on 2026-11-21.

**It leaves pinned** (rule debt, never a learner's part): `kan`'s and `zar`'s short stems (below); the
hamza-initial verbs' commands (*kol*, *khod*); `stanna` (a listed stem with a defective verb's endings);
participles of Forms II to X; the five multi-word lexemes; clitic joins (و, ب, ع, ال, هال: ADR 0152's "how
two words join", the article before a sun letter); stress; a q said q. Broken plurals (`wlad`, `jiren`,
`shabeb`, `tyeb`) stay lexemes of their own, cited in the plural: making them listed forms of a singular
changes lexeme ids and learners' state, and waits for the owner (not in it).

## 3. Where it is stored

**A lexeme's lexical form moves into `lexicons/apc/lexemes.yaml`, under the schema's existing `form` key:**
a string in apc's notation (حِلُو, بِنْت, قَهْو\u065cة), or for a verb a `RadicalForm`
(`lexeme:shereb`: `form: {radicals: [ش, ر, ب], form: I, vowels: {past: i, present: a}, source: kline 75}`).
`authored.yaml`'s verb data, participle heads and template move there and into `language.yaml`, its `basis`
lines into a `basis` field (for reviewers, never shown to learners). `apc.yaml` and `apc-review.md` are
frozen as a record, as `docs/migration/plans/` are; the review list is the compiler's from then on (`nabu
forms ../courses/apc`, beside `nabu projections`); `build.py` is kept as the record of the drafting.

**The rules go in `lexicons/apc/language.yaml`** under `notation`, `rootClasses`, `stems`, `realisation` and
`phonology`, one file and not a file per rule (as `language.schema.json` once planned): blocks and rewrite
rules interact by their order, which a file per rule would lose. Each realisation rule has a `rule:` id that
`rules` names with its gloss (what a learner is shown), as `rule:used-to` is named today, and each exponent a
`branch` (ADR 0146: a rule's parts are its branches; `PartId` already allows `rule:apc-imperfect|ind`).

**Worked example 1: a sound Form I verb in the imperfect** (*shereb*, ش ر ب, present vowel a):

```yaml
notation:                               # apc.md: what the lexical form's signs are
  vowels: {a: "َ", i: "ِ", u: "ُ", e: "\u065c", o: "\u065d"}
  long: {a: "َا", i: "ِي", u: "ُو", e: "\u065cي", o: "\u065dو"}
  none: "ْ"
  sets: {C: "[ء-يگپڤ]", V: "[َُِ\u065c\u065d]", ayn: "[ع]"}
rootClasses:                            # computed from the radicals, first that holds
  - {id: hollow, radical: 2, in: "[وي]"}
  - {id: doubled, same: [2, 3]}
  - {id: defective, radical: 3, in: "[وي]"}
  - {id: sound}
stems:
  - {id: imperfect, form: I, class: sound, template: "1ْ2{present}3"}        # شْرَب, عْمِل
  - {id: imperfect, form: I, class: hollow, template: "1{long present}3"}    # رُوح
realisation:
  - id: rule:apc-imperfect
    when: {pos: VERB, feats: {Aspect: Imp}}
    stem: imperfect
    blocks:
      - prefix:                         # the most specific whose values the cell has
          - {branch: 1sg, feats: {Person: '1', Number: Sing}, add: ""}
          - {branch: 1pl, feats: {Person: '1', Number: Plur}, add: "ن"}
          - {branch: 3fs, feats: {Person: '3', Gender: Fem, Number: Sing}, add: "ت"}
          - {branch: 2, feats: {Person: '2'}, add: "ت"}
          - {branch: 3, feats: {Person: '3'}, add: "ي"}
      - prefix:
          - {branch: ind, feats: {Mood: Ind}, add: "ب"}
      - suffix:
          - {branch: 2fs, feats: {Person: '2', Gender: Fem, Number: Sing}, add: "ـِي"}
          - {branch: pl, feats: {Person: '2,3', Number: Plur}, add: "ـُوا\u06df"}
phonology:                              # in order, over the whole form
  - {id: rule:apc-bn, find: "ب+ن", to: "م+ن"}                                # منشرب
  - {id: rule:apc-prefix-vowel, branch: ayn, find: "{C}+", before: "{ayn}ْ", to: "{C}َ+"}
  - {id: rule:apc-prefix-vowel, branch: cluster, find: "{C}+", before: "{C}ْ", to: "{C}ِ+"}
  - {id: rule:apc-prefix-vowel, branch: none, find: "{C}+", to: "{C}ْ+"}     # بْروح, بْتِشْرَب
  - {id: rule:apc-prothesis, at: start, find: "{C}ْ{C}", to: "اِ{C}ْ{C}"}    # اِشْرَب
  - {id: rule:apc-syncope, branch: imperfect, find: "{C}[ِ ُ]{C}+", before: "{V}", to: "{C}ْ{C}+"}
```

The cell `{Aspect: Imp, Mood: Ind, Person: '2', Gender: Fem, Number: Sing}` of *shereb* gives
ب + ت + شْرَب + ـِي → بْتِشْرَبِي: Arabic بتشربي, marks بْتِشْرَبي, Arabizi *btishrabi* (the course's three
spellings). Of *3emel* (عْمِل) the same cell gives بْتَعْمْلِي: *bta3mli*, marks بْتَعْمْلي, as the course has
them. 1sg indicative gives بِشْرَب *bishrab* and بَعْمِل *ba3mel*; 1sg subjunctive اِشْرَب *eshrab* and
اِعْزِم *e3zem* (the prothetic alef is no prefix, so ع does not make it a): the course's *ba3mel* beside
*e3zmak*, which authored.yaml noted as unsettled, is what these rules give.

**Worked example 2: a hollow verb in the perfect** (*ra7*, ر و ح, present vowel u):

```yaml
stems:
  - {id: perfect, form: I, class: hollow, template: "1{long past}3"}         # راح (past a; shef, ken: e)
  - {id: perfect-short, form: I, class: hollow, template: "1{present}3"}     # رُح
realisation:
  - id: rule:apc-perfect
    when: {pos: VERB, feats: {Aspect: Perf}}
    stem: perfect
    blocks:
      - suffix:
          - {branch: 1sg, feats: {Person: '1', Number: Sing}, add: "ت", stem: perfect-short}
          - {branch: 1pl, feats: {Person: '1', Number: Plur}, add: "نَا", stem: perfect-short}
          - {branch: 2fs, feats: {Person: '2', Gender: Fem, Number: Sing}, add: "تِي", stem: perfect-short}
          - {branch: 2pl, feats: {Person: '2', Number: Plur}, add: "تُوا\u06df", stem: perfect-short}
          - {branch: 2ms, feats: {Person: '2'}, add: "ت", stem: perfect-short}
          - {branch: 3fs, feats: {Person: '3', Gender: Fem, Number: Sing}, add: "ـِت"}
          - {branch: 3pl, feats: {Person: '3', Number: Plur}, add: "ـُوا\u06df"}
          - {branch: 3ms, feats: {Person: '3'}, add: ""}
```

It gives راح, راحِت *ra7et*, راحوا *ra7o*, رُحْنا *ru7na*, رُحْتي, رُحْتوا *ru7to*, and رُحْت, which the
helping vowel marks رُحِت, as `vocalization.yaml` does; `sar` (present i) gives صِرِت, as the course has it.
`zar` and `kan` (present u, like `ra7`) give زُرِت and كُنِت where the course writes زِرِت *zert* and كِنِت
*kent*: a vowel stored per verb (a lexical feature, so a part to learn), or one Beirut vowel spelled two
ways, is a fact the repo cannot settle (question 2). Until then their short-stem cells stay pinned.

**Worked example 3: a noun with a suffixed pronoun, and the helping vowel** (*bent*, بِنْت):

```yaml
# lexemes.yaml: the pronouns' allomorphs get their forms
- id: lexeme:poss-2pl
  allomorphs: [{form: "ـكُن"}]
- id: lexeme:poss-1sg
  allomorphs: [{form: "ـِي"}]
- id: lexeme:poss-2ms                            # the course: -ak 39 words, -k 1
  allomorphs: [{form: "ـَك", after: {endsIn: "{C}"}}, {form: "ـك"}]
- id: lexeme:poss-3pl
  allomorphs: [{form: "ـُه\u06dfن"}]          # -on: the vowel, then a silent ه
# language.yaml
phonology:
  - {id: rule:apc-helping-vowel, branch: inside, find: "{C}ْ{C}ْ+{C}", to: "{C}ِ{C}ْ+{C}"}
  - {id: rule:apc-helping-vowel, branch: end, find: "{C}ْ{C}", at: end, to: "{C}ِ{C}"}
  - {id: rule:apc-feminine-t, find: "ة+", to: "تْ+"}                          # عيلة + ي → عيلتي
```

بِنْت + ـكُن → بِنِتْكُن (marks), بنتكن (Arabic), *bentkon* (Arabizi: the helping vowel is free there and
unwritten by default). بِنْت + ـِي → بِنْتي: a vowel follows the cluster, so no helping vowel. بِنْت + ـُه\u06dfن
→ بِنْتُه\u06dfن, which the marks write بِنْتْهُن (their vowel on the ه, apc.md) and Arabizi with -on, as the
speaker's *ebnon*. بِنْت alone: بِنِت. The ruled conditions of the helping vowel (a doubled letter, a
glide closing a diphthong, three consonants in a row) are branches of the same rule.

**Projections are profile data,** under a new `spell` key of each profile, from the language's notation:

```yaml
# profiles/apc-Arab.standard.yaml
spell:
  from: lexical
  rules:
    - {find: "[ًَُِّْ\u065c\u065d\u06df]", to: ""}       # marks, length signs and the silent sign go
    - {find: "[گپڤ]", map: {گ: ك, پ: ب, ڤ: ف}}
annotations:
  - {id: vocalized, kind: vocalization, toggle: true, default: "on", spell: {rules: [...]}}   # apc.md's table
```

Why the profile: ADR 0148 and 0153 put what an orthography writes in its profile (the sound statement, read
forwards), and spelling from the lexical form is that statement's other direction. A profile is already one
orthography of one language, a second orthography adds a profile and leaves the language alone, and one file
holding both directions lets a check tie them: every free alternative `spell` gives must compare as `free`
under the profile's correspondences. The notation every rule and projection reads (what U+065C is) is the
language's. The marked text the voices read is a layer of the Arabic orthography: its `vocalized`
annotation's `spell`. Phonemes would be the language's, and wait: nothing on the device reads them (ADR 0153).

**Schema changes** (by hand in `schemas/`, then `pnpm codegen`). `language.schema.json`: `notation`
(`vowels`, `long`, `none`, `sets` of UnicodeSets); `rootClasses` (`id`; `radical` + `in`, or `same`); `stems`
(`id`, `form`, `class`, `template`); `realisation: [Rule]`, a Rule being `id`, `when` (a Condition), `stem`
(a stem id or `{pattern: LexemeId}`) and `blocks` of `{prefix|suffix: [Exponent]}`, an Exponent `branch`,
`feats` (a comma meaning one of), `add`, `stem`; `phonology: [Rewrite]`, a Rewrite `id`, `branch`, `find`,
`to` or `map`, `before`, `after`, `at` (`{name}` a set, `+` a boundary); `Condition.endsIn`. Each item takes
`notes`. `lexicon.schema.json`: `RadicalForm.source` and `.basis`; `LexemeForm.free` (ADR 0145's tie that
is no error). `orthography-profile.schema.json`: `spell` (`from: lexical`, `rules`, `alternatives`: the free
spellings), on the profile and on an annotation. `bundle.schema.json`: section 5.

## 4. The engine in core

A new pure module, `packages/core/src/lexicon/` (no I/O; the declared language, the lexicon and the profiles
passed in; no list of a language's letters or endings: sets and exponents are data):

```ts
compileLanguage(declared: LanguageDeclaration, lexicon: Lexicon): Result<CompiledLanguage, readonly string[]>
realise(lang: CompiledLanguage, lexeme: LexemeId, cell: UdFeatures, options?: { blocking?: boolean }): Result<Realisation, RealiseError>
realiseToken(lang: CompiledLanguage, written: readonly WrittenLexeme[]): Result<Realisation, RealiseError>
compileSpeller(profile: OrthographyProfile, lang: CompiledLanguage, layer?: string): Result<Speller, readonly string[]>
spell(speller: Speller, form: string): { readonly spelling: string; readonly alternatives: readonly string[] }
paradigm(lang: CompiledLanguage, lexeme: LexemeId, cells: readonly UdFeatures[]): readonly Realised[]

interface Realisation {
  readonly form: string;                                  // the lexical form, boundaries kept
  readonly status: "given" | "pinned" | "listed";          // ADR 0145's three statuses
  readonly steps: readonly { readonly rule: RuleId; readonly branch: string }[];
  readonly listed?: PartId;                               // the listed part it used: lexeme:tener|stem:tuv
}
type RealiseError = { kind: "no-rule"; cell } | { kind: "tie"; forms } | { kind: "template"; stem; root };
```

- **Blocking:** each lexeme's `forms` are indexed by feature set, most specific first; a lookup is a subset
  test over a handful. A tie is a compile error unless both are `free`. `blocking: false` skips listed forms
  and stated classes and keeps pinned ones, so a pinned form never yields a regularised one.
- **A cell that leaves a value out** (es *hablaría*; apc's first persons, with no Gender) is realised as
  written: an exponent that reads a feature the cell lacks does not apply. Nothing completes the cell.
- **The grader's inverse** ("is this typed word the rule's form for a listed form's cell?") is never computed
  on the device: the bundle carries each cell's spelling and, where blocking off differs, the regularised
  one (section 5), and the grader looks a typed word up in a map built once, as `spellingsIn` does today.
- **Cost.** Grading (p95 under 5 ms, 4× throttling, cold caches) does lookups only; the engine runs in the
  compiler through core-cli. `prepareGrading` adds the paradigm's spellings to its maps (apc about 1,200
  verb cells in each of two orthographies, es about 8,900); stage 4 times it on the perf harness, and fills
  the maps lazily per lexeme if it is too slow.
- **core-cli ops:** `realise`, `realise-token`, `spell`, `paradigm`, each also in `batch`. As `statement`
  does for projection vectors, a vector may pass a `language` object, so blocking is tested on a fixture.
- **Vectors**, in both harnesses: `conformance/realise.json` (`realise/blocking/*` on a fixture: a full
  form wins, a stem continues, a tie errs, a free tie does not, blocking off skips listed and keeps pinned,
  an unset value; `realise/apc/*`, one per branch of every apc rule, from the course's own forms);
  `conformance/spell.json` (apc's Arabic, marks and Arabizi with alternatives; es's identity); and
  `grade/labels/regularised/*` in `grade.json`. Defaults are matched in Python today (`lexicon.py`
  `default_for`); a default is a rule (ADR 0148), so stage 2 moves it into core (`lexical-features`).

## 5. The compiler

**For every token of the course**, in each orthography: `realise-token` over its lexemes with their chosen
values, then `spell` for the orthography (and the `vocalized` layer, against `vocalization.yaml`'s entry for
the token's spelling). The course's spelling must be the projection's spelling or one of its alternatives.
A token whose base is in its citation cell checks the lexeme's lemma the same way.

- **On a mismatch** the token needs a form of its lexeme for that cell: `pinned` (our rule is wrong or
  missing: rule debt, reported per language) or `listed` with its `statement` (the language has no rule).
  New lints, each with a registry entry in `diagnostics.py` and a mutation in `make_lint_fixtures.py`:
  `form.projection` (warning, stage 1: a form does not spell as its lexeme's first spelling, or its marks
  are not its vocalization's); `form.unaccounted` (warning in stage 2, error from stage 3: a token neither
  the rules nor a form of its lexeme give); `form.pinned-differs` (error: a pinned spelling no token of
  that cell writes); `form.redundant` (warning: a pinned form the rules give); `form.rule-debt` (info: pinned
  forms per language, ADR 0145). Expected warnings go into `tests/test_courses.py` `EXPECTED_WARNINGS`.
- **Pinned forms that a rule gives are removed** by a CLI (`nabu forms prune ../lexicons/apc`, writing with
  `nabu.yamlio`), never by hand: each form whose cell the rules give with every spelling it pins. The check
  that nothing a learner sees changes: `pnpm bundles` leaves `apps/web/public/bundles` byte for byte (pinned
  forms are not shipped, so a diff means a rule changed a token's surface, which the compiler never does:
  tokens stay the text); `nabu audio generate ../courses/apc --check` finds no clip stale (clips' inputs
  are token surfaces and `vocalization.yaml`, and their form keys come from tokens); `vocalization.yaml` is
  not touched; `nabu forms` lists every removed form for the record.
- **What the bundle carries (stage 4), weighed.** Rules and lexical forms realised on the device would follow
  ADR 0153's "no second place to be wrong", at the price of thousands of realisations at session start on a
  throttled phone, for answers the compiler has already checked. So the compiler precomputes, as it writes
  `leftovers`: the lexicon gains `cells` (per part of speech, the cells whose every value the course teaches,
  as form keys), each lexeme a `paradigm` (per orthography each cell's spelling or null, with the marked
  layer) and `regularised` (only where blocking off differs). About 60 KB for apc and 100 KB for es beside
  lexicons of 260 and 480 KB; rules, notation and lexical forms stay out. `formatVersion` 5.

## 6. What a learner gets

**The label regularised** (ADR 0148), produced from stage 6: apc's first cut lists nothing.
- **When:** the typed word, as the grader keys it, is the regularised spelling the bundle ships for the
  expected token's lexeme and cell (✗*tenió* for *tuvo*, ✗*penso* for *pienso*), and not the expected word.
  Never for a pinned form (no regularised spelling ships for one).
- **In the order of grading:** a new relation beside `lexical` and `grammatical`. In the slip step, a slip
  that lands on the regularised form is `regularised` + `slip` (*penso*), as *habla* for *hablo* is
  grammatical + slip; otherwise `regularised` (*tenió*). The sound question is asked as for grammatical, and
  feedback leaves "another sound" out for the pair, as it does for another form. The outcome: explained, so
  `WRONG_WORD`, never the judge's (it is never a question of meaning).
- **Credit:** the lexeme shown by the card's skill, the feature values shown, the listed part missed
  (`lexeme:tener|stem:tuv`, `lexeme:pensar|class:e-ie`). `feedback.label.regularised` exists. **Done:**
  `grade/labels/regularised/*` (*tenió*, *penso*, a slip onto it, a pinned form that yields none), the fold
  mirrored in `test/fold-before-r2.ts`, test:perf green.

**A grader that knows every form the rules give** (stage 4, ADR 0148): a slip onto an unwritten regular form
of the answer's own lexeme is grammatical + slip, where today it is a typo. Done: a vector per course with
rules, the fixture courses green, the acceptance runs rerun.

**A built word for a form no sentence writes** (stage 5, ADR 0146; ADR 0152's "not in this ADR"):
- **The card:** the lexeme's lemma with its gloss and the form's label; the learner types the form. Its
  answer is the paradigm's spelling (its alternatives accepted as the profile's free correspondences accept
  them). No sentence: none writes the form (question 4). Typed only, never a choice (ADR 0132 stands).
- **Offered only where:** the realisation is `given` (never pinned or listed); the lexeme is recognized (the
  fold's `shown`); every value of the cell is taught by the learner's unit; another lexeme of the course
  writes the cell (the branch has been shown); and the learner has **never seen** the pair.
- **What it needs from seen-logging:** the fold's seen pairs (ADR 0146: each card's `displayed`, each story
  line's `story_line_read`, as `DisplayedLexeme {lexeme, feats}`), keyed as the form key. Nothing logged
  before counts, so a pair also counts as seen where a sentence the learner has met writes it: an old log
  never makes a pair look unseen that its sentences showed.
- **Credit:** what `parts-whole` credits now, the cell's taught values (`choose`), one a session in its
  slot (ADR 0152). **Done:** tests over every fixture course; the view (`<T>`, MF2, `keyboardHint`,
  IME-safe) in the visual matrix; e2e by keyboard and touch; the simulation's acceptance runs.

**A rule's branches as parts** (`rule:apc-imperfect|ind`): named in the data from stage 2, and the
compiler reports a branch no content shows (ADR 0146). Memory for them waits: ADR 0146 leaves open what the
simulated learner knows of a rule and what the performance model keys (question 5).

## 7. Build order

Each stage lands whole on main with `pnpm lint`, `typecheck`, `test`, `conformance`, `courses` and
`bundles` green and the fixture courses green. Each is one agent session.

1. **Lexical forms and their projections (can start now).** The notation; `spell` in apc's two profiles and
   the `vocalized` layer; `spell` in core and core-cli with `conformance/spell.json`; apc's forms into
   `lexemes.yaml` (a one-off script from `apc.yaml` and `authored.yaml`, then edited directly);
   `form.projection` over every lemma and allomorph; `nabu forms`; the two files frozen. Bundles unchanged.
   It needs only rulings already made (the three signs, the helping vowel, long a said e per word); Arabizi's
   free spellings are `alternatives`, which grading does not read until question 6 is answered.
2. **The engine and apc's verbs, report only.** `realise`, `realise-token`, `paradigm`; the perfect,
   imperfect, command and participle; `conformance/realise.json`; defaults into core; `form.unaccounted` as a
   warning. Nothing removed. **The owner reviews** apc's rules and the mismatch list before stage 3.
3. **apc's nouns and suffixes; pinned forms go.** The nominal rules and allomorphs; mismatches settled as
   ruled (rule changed, form pinned, or the course corrected and its clips regenerated); `nabu forms prune`;
   `form.unaccounted` an error and the other lints; the byte-for-byte bundle and stale-clip checks.
4. **The bundle's paradigms; the grader's lexicon.** Format 5; `spellingsIn` takes the paradigms; the slip
   vectors; test:perf with preparation timed; the simulation rerun. Needs question 3.
5. **A built word for an unseen form.** Needs seen-logging landed (ADR 0146; built beside this) and question 4.
6. **Spanish's verbs** (two sessions). 6a: es's forms (`spell` the identity under the stress statement), its
   classes stated (e-ie, o-ue, e-i, the -go verbs, short futures, strong preterites: REVIEW), the -ar, -er,
   -ir rules, `form.unaccounted` over 2,014 tokens; the owner reviews the classes and what to list. 6b:
   listed forms with statements (*ser*, *ir*, *tuv‑*), pinned forms pruned, the label regularised.

## 8. Not in it, risks, questions

**Not in it, and why.**
- Order rules and clitic joins (و, ب, ع + ال, the article before a sun letter): ADR 0145 starts order rules
  inside words, but joins are where apc's two orthographies tokenize differently (عالشغل is one token, *3al
  shoghl* two), which needs its own design.
- Computed derivatives (the agentive noun, Forms II–X participles, verbal nouns) and wug cards: ADR 0146
  puts wug cards last; the agentive needs `base`/`pattern` links read by a rule, which this cut only stores.
- Broken plurals as listed forms of a singular (`jiren` of `jar`): a change of lexeme ids, learners' state
  and the alias table.
- Stress, phonemes, a q said q (no source in the repo); hbo, grc, uz and fa (each its own design, later).
- Generating `vocalization.yaml`: its 16 reviewed-clip differences await rulings; it is checked, not written.

**Risks.**
- **The check surfaces the course's own inconsistencies** (*ru7t* beside *zert*; the 65 words apc-review.md
  lists): each is a ruling or a speaker's answer. Stage 2 is report-only for this reason.
- **Over-generation:** a wrong exponent accepts or labels wrongly. Every branch has a vector, a rule changes
  no token's text, and stage 4's stricter grader is measured before it lands.
- **Two statements of what is free** (`spell` alternatives, the sound statement's `free`): held together by
  a check from stage 1.
- **Changing the verb lemmas** (question 1) changes word cards and stales 31 word clips.
- **Preparation time on a throttled phone** for es's 8,900 cells (stage 4 measures; lazy maps if needed).
- **Work landing at the same time** (2026-11-22): the retag, which completes the language files' dimension
  lists, and seen-logging touch `language.yaml`, `lexemes.yaml` and the event schema; stage 1 starts from
  the tree that has them.

**Questions for the owner.**
1. **What a verb's word card shows.** 31 of 41 apc verbs show an inflected form (*ba3mel*, *bru7*). (a) The
   citation cell realised by rule, Kline's he-past, with the he-present second (*3emel / ya3mel*); (b) keep
   the course's chosen form as a pinned display spelling. Pick (a), by ADR 0154 (1); 31 word clips are made
   again.
2. **Where the course writes one shape two ways, or Beirut's vowel is a speaker's fact** (the short stems
   رُحِت, زِرِت, كِنِت of three u-verbs). (a) Ask a speaker and keep the cells pinned meanwhile; (b) follow
   Kline and accept the other spelling; (c) store the vowel per verb. Pick (a), with (b) where Kline is
   explicit.
3. **What the bundle carries.** (a) Precomputed paradigms and regularised spellings, the device looking
   them up; (b) rules and lexical forms, realised on the device as ADR 0153 reads spellings there. Pick (a):
   the grading budget, and the device never needs a realisation the compiler has not checked.
4. **A built word with no sentence.** (a) The lemma, its gloss and the form's label, typed; (b) a sentence
   that writes another lexeme in that cell, with this lexeme put in (often absurd); (c) no card until a
   sentence writes the form. Pick (a).
5. **A rule's branches as parts.** (a) The paradigm carries each cell's branches and answers log them from
   stage 5, no memory until the simulation knows rules; (b) memory per branch now; (c) neither until ADR
   0146's open points are decided. Pick (a).
6. **Arabizi's free spellings.** apc-Latn states e/i free and left o/u, u/ou, i/ee, a final e/i, the helping
   vowel and the article's forms out, with reasons; apc.md lists them all as free. (a) State them free
   (REVIEW): answers the accept sets did not list are then accepted, and the rule's spelling can be checked
   by the sound statement alone; (b) keep them as the projection's `alternatives`, read only by the
   compiler. Pick (a), after the owner reads the profile's reasons for leaving them out.

**The owner's answers (2026-11-23).** Asked one at a time, each with its breakdown.
1. **(a), the he-past first** (*3emel / ya3mel*). 31 word cards change and 31 word clips are made again; the
   audio check follows.
2. **(b), follow Kline**: his form wherever he gives one, by pattern where he is silent, not waiting for a
   speaker. Up to 213 tokens (and their clips) of `ra7`, `zar` and `kan` may change; the list of changed
   tokens goes to the owner before any clip is made again.
3. **(a), the compiler lists forms**; the device looks them up (bundle format 5).
4. **(a), a card without a sentence**: the lemma, its gloss and the form's label, typed; limited as built
   words are (one a session, its forms recognized first, never a sentence's typing slot). (b) is ruled out.
5. **(b), a memory per branch now**, against the draft's pick, after a fuller explanation. What follows:
   the starting numbers are guesses (REVIEW, as the word-parts priors); the simulated learners get an
   ability per branch, or the calibration cannot see the memory; a branch is due only where a built-word
   card can ask it (the rule of `learner/due.ts`); branch names enter card keys, so renaming a root class
   needs an alias. It comes with stage 5 and its card, and needs an ADR (Proposed): it settles one of ADR
   0146's open points.
6. **(a), free, one at a time**: i/ee, u/ou and the article's forms first; o/u, a final e/i and the helping
   vowel each after the owner has seen what it would newly accept (a list per variation, made from the
   course). Each is a correspondence with vectors in both harnesses.

## Stage 1 as built (2026-11-23)

Every apc lexeme's lexical form is in `lexicons/apc/lexemes.yaml`; the notation in `language.yaml`; `spell` in
`profiles/apc-Arab.standard.yaml` (2 rules), its `vocalized` layer (14) and `profiles/apc-Latn.arabizi.yaml`
(34); `@nabu/core/lexicon` `compileSpeller`, `spell`, `spelledAs`, `spellingKey`; core-cli `spell`;
`conformance/spell.json` (64 vectors); the lint `form.projection` and `nabu forms`. Bundles are byte for byte
what they were (the compiler strips `spell` from a shipped profile).

- **Counts.** 346 forms: 303 strings, 43 radical forms (40 verbs and the participle-shaped 2a3ed, seken,
  wa2ef). No allomorph has a form yet. 24 lexemes have none: the 18 affixes, b, el, hal, w (one script only),
  miyye, inshalla. Over all 305 non-verb forms of the frozen `apc.yaml` the statements give exactly what the
  prototype's `lexform.py` gave.
- **The review list:** 898 spellings checked, 43 skipped as verbs, 32 that do not spell as the lexicon writes
  the word (20 in Arabizi: the teens, bas/bass, adar; 12 in the marked layer: hayda, henne, hiyye, huwwe, akl;
  none in Arabic). All were on the prototype's list but two, which a stricter comparison of spaces adds. They
  are `EXPECTED_WARNINGS`, each a fact for the owner.
- **Where it differs from the sketch above.** `compileSpeller(profile, notation, layer?)` takes the declared
  notation (stage 1 had no compiled language). `spell` returns alternatives as `{spelling, by}`, `by` the
  variations taken; alternatives sit on each rule with a variation id (`e-i`, `i-ee`, `u-ou`, `o-u`, `e-ei`,
  `final-e-i`, `helping-vowel`, `article`, `q-initial`). The notation has `order`: the marks a letter carries
  in the order the notation names them (shadda first), since NFC sorts them by combining class. A `spell`
  statement may define sets of its own. `yamlio` writes the three signs as escapes.
- **The tie check** (`spell.test.ts`): 131 alternatives compare free under the profile's e/i; the rest are
  pinned by variation (i-ee 39, helping-vowel 36, o-u 27, e-ei 19, u-ou 18, article 12, q-initial 7, and
  combinations) until the owner states each free.
- **Still only in the prototype's `authored.yaml`:** each verb's citation pair, stanna's listed stem, the
  participle heads and listed participles, the templates and their `back` letters.

## Stage 2 as built, first half (2026-11-23): the engine, and apc's verbs as data

Built beside stage 1 in a second checkout and merged by hand (one `notation`: stage 1's sets L, C, N, V, H
kept, the rules' own sets added as K, W, IU, P, NUN, T, AYN, BACK, FEMA).

- **The engine** (`packages/core/src/lexicon/realise.ts`, `realise-pattern.ts`): `compileLanguage`, `realise`,
  `realiseToken`, `paradigm`; core-cli `realise`, `realise-token`, `paradigm`; `conformance/realise.json` (84
  vectors: 37 on an invented language, 47 `realise/apc/*`, one per branch the course writes). Order: blocking
  (a whole form ends realisation, a stem continues, a tie errs unless both are free), the first rule whose
  `when` holds, the stem template (the one with the most conditions that fits), the blocks, allomorphs, the
  rewrites (each once, in order, at every place it matches). A pattern matches a letter with its marks
  exactly, names every boundary (`+`, `+?`), and `#` is the form's edge.
- **Beyond the sketch:** `Stem.branch` (a template learned on its own: the hollow past's short stem), a list
  of stems to try, lists of contexts, the errors `unknown-lexeme`, `form`, `spelled-only`. The 1sg
  subjunctive's alef is a prefix (Kline p. 157) that a rewrite drops before a vowelled consonant, not a
  prothesis. Not done: `LexemeForm.scope`, an allomorph's `before`, defaults into core (`default_for` is on
  the compiler's hot path: not a small move), glosses for the new rule ids (they would ship in bundles).
- **apc's rules** (`lexicons/apc/language.yaml`, every one REVIEW): root classes hamzated, w-initial, hollow,
  doubled, defective, sound; stems for Forms I, II, III, VIII; `rule:apc-perfect`, `-imperfect`, `-command`,
  `-participle`; rewrites `-sukun`, `-bn`, `-madda`, `-silent-alef`, `-prefix-vowel`, `-syncope`,
  `-defective`, `-geminate`, `-feminine`, `-helping-vowel`.
- **The first report** (a throwaway script; the verbs' radicals from `authored.yaml`, the prototype's
  projections standing in for `spell`): of 433 verb tokens the rules give all three spellings of 393. The 40:
  the course against Kline, 24 (`ra7`'s short stem 13; *or2os* 4; *e3zmak* 3; *eshrab* 2; *safart* 2); the
  course's Arabizi against its own marks, 10 (*b7ki*, *b2ra*); no rule yet, 5 (the dative -l-); `b3at`'s
  past, 1. The owner rules on each before any token changes.
- **Answer 2, as Kline has it:** one short vowel, a kasra, for every hollow verb's short past stem (kent p. 60,
  Sert p. 69, shifet p. 99, re7na pp. 25, 64, 144; ro7t the Bekaa's, p. 198). So *kent* and *zert* stand and
  only `ra7`'s 13 tokens differ, not the 213 the question feared.
- **Data faults it found, for the rest of stage 2:** `2ara`'s third radical is stored ء and conjugates as ي;
  hollow verbs store no past vowel (ra7, zar, 2al, sar, 3ash: a; ken, shef, fe2, nem: e); stanna needs its
  listed stem in `forms`; the suffixed pronouns need their allomorph forms.

## Stage 2 as built, second half (2026-11-23): the lexicon's data and the compiler's check

Report only: no token, spelling, vocalization or clip changed, and the bundles are byte for byte.

- **Data.** `2ara`'s third radical is ي; the nine Form I hollow verbs store `vowels.past` (ra7, zar, 2al, sar,
  3ash: a; kan, shef, fi2, nem: e; Kline p. 77); `stanna` has a listed stem for its commands (`Mood=Imp` only:
  the course writes nothing else of it, and its he-present does not come out yet); the object and possessive
  pronouns and la-1sg, la-2ms have allomorph forms (ـَك, and ك after a vowel). The dative after a consonant or
  the past's -t and every noun-only affix have none: stage 3.
- **The check** (`pipeline/src/nabu/forms.py`, `compiler/build.py`): as section 5 has it, for tokens whose base
  a rule covers (VERB, AUX). `realise-token` runs with the new option `spellings: false`: a form that pins
  spellings only (today's pinned copies of the course) neither blocks nor accounts, or nearly every verb token
  would be accounted for by its own copy. The compile-time tie check passes such forms over too. `spell` drops
  `+` first. The check adds about 0.3 s to apc's compile; a language with no `realisation` pays nothing.
- **The helping vowel moved.** At a word's end it is the marked layer's `spell` (stage 1 had it there already)
  and no longer also a rewrite: with both, every Arabizi *ru7t*, *kent*, *akalt* failed, and the owner ruled
  that the Arabizi stays as written. Inside a word it stays a rewrite (it needs the boundary: سْمِعِتْني, not
  بْتَعْمْلي), and Arabizi's `spell` writes it e, i or nothing.
- **The numbers.** 5,470 lexical tokens (both orthographies); 1,180 checked; 1,085 given exactly; 6 by
  stanna's listed stem; **89 unaccounted** (`form.unaccounted`, 50 items); 4,290 "no rule yet" (no rule for the
  part of speech 4,235; clitic و 16; the phrase lexeme 3mol-ma3rouf 20; the dative after a consonant 18).
- **The 89, by cause** (Arabic + Arabizi): `ra7`'s short stem 13 + 13; *or2os* 4 + 4; *e3zmak* 3 + 3;
  *eshrab* 2 + 2; *safart, safer* 0 + 2; the Arabizi leaving out a vowel its marks write (7aka, 2ara) 0 + 10;
  `badd` and `fi`, whose base changes before an ending (an allomorph chosen by what follows: not built)
  14 + 14; `khayef`, a participle string used as a present's stem (it needs radicals: خ و ف) 2 + 2; `lek`
  (ليكو, no plural alef) 1 + 0. The first half's 40: 34 stay, 6 became "no rule yet" (the dative, *b3atli*);
  badd, fi, khayef and lek are new (they were not among the prototype's verbs).
- **`nabu forms ../courses/apc`** ends with this report; `--paradigm <lexeme>` prints a lexeme's cells with
  the steps taken, each orthography's spelling and what the course writes.
- **Vectors:** every `realise/apc/*` reads the lexicon; added blocking with spellings off, the listed stem,
  the allomorphs after a vowel, the boundary cases of `spell`. 1,038 (TS) and 1,039 (Python).
- **For the owner before stage 3:** each cause above (follow the rule: 39 sentence and story clips made again,
  with their accept-set lines and vocalization entries; or keep the course: a branch or a pinned form);
  answer 1's citation forms (33 of 41 word cards would change, 32 word clips; 9 of the new lemmas are already
  written by a sentence; `b3at` and `rte7` are the two beyond the design's 31).

## Answer 6 as built so far (2026-11-23): i/ee stated free; the article could not be

- **i/ee** is a free correspondence of `profiles/apc-Latn.arabizi.yaml` (`ee` before a consonant says e). All
  42 spellings the owner saw now grade as a variant (26 were a slip, 16 wrong); no other verdict of that list
  moved. Its cost, as the profile says: Arabizi writes no length, so a short i written ee is accepted too
  (about 80 places in the course's words: *beeshrab*, *3endeek*), as a short e written ee already was. Over
  the whole course two pairs of different words now compare alike: *sme3teni* (to a man) with an accept set's
  *sme3teene* (to a woman), a slip before and so accepted before; and *min*, an accept-set spelling of *men*,
  with *meen* (who), which the older long-vowels fold already took. Golden plans and the simulation did not
  move; grading's p95 is 1.1 ms for apc-Latn.
- **The article's forms are not stated.** The course writes the article as a word of its own (213 tokens) or
  joined to a preposition, the normalization detaches *el* and *il*, and grading compares word by word: *l*
  joined to its noun (*l7amdella*) and an assimilated article (*essalame*) are one word against two, which a
  statement of sounds cannot reach; word by word it would only take a spaced *l*, which the accept sets list
  by hand 169 times, and would swallow *elf*, *elli*, *ilbos*. It waits on the join design this note leaves
  out (section 8), or a detach that knows the lexicon. 0 of its 12 are newly accepted.
- **Waiting on the owner's yes, each:** o/u (24), the helping vowel (37), e/ei (18), an initial ق left out (7).

## The owner's "just do the rest" (2026-11-23), and what was done by it

Read as: go with the builder's recommendation on every open point and carry on through the stages; everything
stays REVIEW. Three jobs landed together.

- **apc's verbs follow Kline where the course differed**, the old spelling still accepted in every accept set:
  *re7t* (13 items), *er2os* (4), *a3zmak / a3zmik* (3), *shrab / shrabo* (2), *sefart, sefer* (2), the Arabizi
  writing the vowel its marks write (*be7ki*, *be2ra*: 10), *b3atli*, ليكوا. Data: `b3at` has a listed perfect
  stem (Kline p. 75), `rte7`'s Form VIII alef is written and not said, `khayef` has radicals خ و ف (so *nem*
  and it share the present-e branch), `stanna` a listed imperfect stem. `form.unaccounted` fell from 89 to 28:
  `badd` and `fi` before a pronoun, which need an allomorph chosen by what follows (stage 3).
- **Answer 1:** 31 verb lemmas are the he-past the rules give (the inflected form that stood first is gone
  from `spelled`). A lexeme the course teaches as a participle keeps it and says so (`Lexeme.citation`).
  `nabu forms` now checks verb lemmas (1,063 spellings checked; the 33 mismatches are the same, none a verb).
  The he-present beside the lemma waits for the bundle's paradigms (stage 4).
- **Clips:** 55 made again (17 sentences, 6 story lines, 32 words); 25 failed the round trip and are held
  back (17 of them word clips, where the check is weak); the course's held-back total went from 250 to 253.
  The whole course gained word timings (it had none). The simulated learners' success in apc moved from
  84.9 to 83.8% (Arabic) and 84.5 to 83.9% (Arabizi), inside the band, nothing retuned.
- **Answer 6, the rest:** o/u (24 of 24), e/ei (18 of 18), an initial ق left out (7 of 7) and the helping
  vowel (27 of 36: per final cluster, since a statement cannot leave a vowel out; clusters ending in t and 3d
  are out, by *kent / kenet*, *ba3d / ba3id*, *akl / akol*) are free. Over the whole course no two forms the
  course keeps apart newly compare alike (*bus / bos* is refused by the grader). The grader gained one rule
  (`pinnedElsewhere`): a word the course stands only in another form is another form, never a variant, which
  also refuses six Hebrew answers that passed as free spellings (a singular for a plural).
- **The article** is a join the grader can see (`match.joins`), not a correspondence: 11 of its 12 spellings
  are variants (*ma3 salame*, the article left out, stays wrong); the 351 hand-written article alternatives
  all grade as accepted against the canonical answer alone; *elli*, *elbos*, *el3ab* are kept out by `minRest`
  and `notBefore`. Prepositions with the article (*3al*, *bel*) typed apart are still wrong.
- **Found and left:** 309 pairs where an accept-set spelling of another person, gender or number is accepted
  as a slip (*bteshteghel* for *bteshteghli*): the slip step does not ask the course's forms, some of which the
  nearest-word rule gets wrong. *eshtara*, *eshteghel* keep their said e- where Kline has *shtara*.

## Stage 3 as built (2026-11-23): every apc token is accounted for, and the pinned copies are gone

- **The check covers all 5,470 tokens** (both orthographies): 5,391 given by the rules, 79 by a form of the
  lexeme (71 pinned with a `form`, 8 listed), none unaccounted, none "no rule yet". `form.unaccounted` is an
  error; `form.pinned-differs`, `form.redundant`, `form.rule-debt` are added. It costs apc's compile about
  0.45 s. `form.projection` is at zero.
- **The 33 forms that did not spell as written:** the teens end in a ر written and not said (Kline's
  *7da3sh(r)*), said before a noun (an allomorph `before` the next word); *7zeiran*'s marks follow its
  Arabizi; `akl` has its own marks; *hayda / hayde* keep their bare glide; God's name and a final kasra after
  a shadda are marked-layer rules; eleven words (loans, *bas*, *nos*, *hala2*) are spelled whole in Arabizi's
  `spell`. Each is REVIEW.
- **Rules added:** `rule:apc-adjective` (fs, pl), `-nisba`, `-invariable`, `-noun` (fs), `-article` (sun,
  wasl), `-feminine-t` (vowel, consonant), `-short-stem` (dative), and branches of syncope, the defective
  ending, the helping vowel (glide), the feminine (-e after a long i before r and ṣ: the course; Kline has
  -a) and the prefix vowel. Classes `nisba` and `invariable`. Words in one cell of their own (*enti*,
  *hayde*, *wlad*, *jiren*) say it with `citation`: they stay lexemes of their own.
- **Clitics** are lexemes with forms (ا۟ل, بْ and بِ before the article, و, هَا۟ل, the dual, the pronouns),
  realised from the lexemes each token lists, in its order, per orthography; the course's tokenizing is
  untouched. A join is a boundary; its sound changes are rewrites naming it (the lam into a sun letter, a
  wasl alef, the dative's l). Allomorphs are chosen twice (suffixes, the base, prefixes), `after` and
  `before` reading the token's own text, `before` the next word's base where nothing follows in the token.
  A phrase is spelled word by word and a token is one word of it.
- **Engine:** `Condition.startsIn`, an allomorph's `before`, a rewrite's `when`, citation before any rule,
  `RealiseOptions.next`, `.word`, `pinned: false`; `spell` takes a `part`. Vectors: realise.json 133,
  spell.json 93; the harnesses pass 1,218 and 1,219.
- **Course changes (7 tokens):** three teens' marks said alone (`context: alone`), كيفَك in one story line,
  *3meli* for *3emli* (old accepted), one token's base named. 18 clips made again; 6 failed the round trip
  (four teens' lemmas, *miyye*, s.date.4); held-back total 251.
- **Pruned:** `nabu forms prune` took 243 of 268 pinned forms; the bundles are byte for byte the same before
  and after it and no clip went stale. Kept: 15 with a form (the colours' feminines, *7abibi*'s, the phrases:
  rule debt) and 10 spelling-only stems before a suffix that no rule needs (for the owner).
- **Moved:** the simulated apc learner in Arabic script, 83.8 to 82.5% (inside the band, nothing retuned).
- **For the owner:** ج after the article (the course marks it a moon letter 24 times and a sun letter 12;
  both are accepted meanwhile); *rkhise* against Kline's -a; the ten stem copies; the teens' clips.
- **Not done:** glosses for the rule ids (they would ship; stage 4 or 5 writes them with the cards).

## Stage 4 as built (2026-11-23): the bundle carries each lexeme's forms

- **Format 5.** The lexicon carries `cells` (per category a rule covers: the cells its tokens choose, cut to the
  category's dimensions, each value taught: introduced by a node, or the citation or bare cell's, or of a feature the
  course teaches no value of; a cell no rule gives any lexeme is dropped, which drops NOUN) and `principalParts`
  (a new `language.yaml` key; apc VERB: the he-present, answer 1). Each lexeme with one carries `paradigm` (per
  orthography one entry a cell: a spelling, `[spelling, marked]` where there is a vocalized layer, or null) and
  `regularised` (only where blocking off differs). apc: VERB 27 cells (43 lexemes), AUX 9 (`kan`), ADJ 3 (36),
  1,278 spelled cells per orthography; the lexicon file grew 260 to 322 KB (14 to 27 KB gzipped). Every other
  course's bundle changed only by its format number. A lexeme the course writes but never inflects (`badd`,
  `lezem`) gets no paradigm, and the participle-cited lexemes none yet (their cells are template errors).
- **The compiler** (`pipeline/src/nabu/paradigms.py`) runs after the token check, through core-cli `paradigm`
  (new `strict` option: a cell no exponent names is `no-rule`, not the bare stem) and `spell`. A form spelled
  outside its orthography's script (the script audit's test) or beginning with a joining carrier is not shipped
  and is reported (`form.spelling-script`). The guard found four faults, fixed as rules (REVIEW):
  `rule:apc-wasl|prefix` (a prefix before a stem's unsaid alef: *estanna*), `rule:apc-defective|ay` (*stannayt*,
  *ghannayt*), the 1sg's alef before a vowelled glide (*wa22ef*), `rule:apc-defective|adjective` and the class
  `invariable` on *a7la*, *aghla*. It still fires on *wesel*'s command (three cells: the w-initial command stem
  keeps its carrier first), an expected warning until the rule is settled.
- **Grading** takes every paradigm spelling (`paradigmWords`, the same in core-cli `grade`): an unwritten regular
  form of the answer's own lexeme is another form (grammatical, with a slip where it is one), of another lexeme
  lexical. Over every accept-set alternative of apc (both scripts) and es, about 62,000, no verdict changed.
  Of the 320 wrong-form slips counted that day, 33 are now refused; 287 are not, most of them verbs typed in a
  free spelling of a cell whose default spelling alone ships (*tishtighel* for *teshteghel*), and nouns, which
  have no cells. Grading stays within its budget (p95 under 5 ms; preparation about 15% slower in Arabizi).
- **What a learner sees:** a verb's he-present after its lemma (`Headword`, core `principalParts`) in a lesson's
  new words, the session end, the word list and the gloss panel; never in options, tiles or pairs. The parts shown
  are logged as seen with their cell (`LessonEvent.beside`). The Data page shows each entry's paradigm.
- **`regularised`** exists for `b3at` (its listed past) and the invariable and nisba adjectives (*akbra* for
  *akbar*, *lebnenye*): a learner's over-regularisation, kept for stage 6's label. `stanna`'s listed present is
  now what the rules give (the owner may drop it).
- **For the owner:** *wesel*'s command; the regularised adjectives *a7le*, *aghle* (well formed, but what a
  learner would say is a guess); the 287 slips.

## What is left (2026-11-23, end of the session that built stages 1 to 4)

- **Stage 5: a built word for an unseen form, and a memory per branch** (answers 4 and 5). The card (section 6):
  the lemma with its gloss and the form's label, the form typed, no sentence; offered only where the paradigm
  gives the cell (`given`, never pinned or listed), the lexeme is recognized, every value is taught, another
  lexeme of the course writes the cell, and the learner has never seen the pair (the fold's `seen`, or a met
  sentence that writes it). A memory per branch (the owner chose it against the draft's pick): needs an ADR
  (Proposed) settling ADR 0146's open point; the bundle must ship each cell's `{rule, branch}` steps (the
  paradigm has none yet); branch card keys (`rule:apc-perfect|1sg|choose`?), priors as guesses (REVIEW), a
  branch due only where a built-word card can ask it (learner/due.ts), and simulated learners with an ability
  per branch, or the calibration cannot see it. The view needs the visual matrix and e2e by keyboard and touch.
- **Stage 6: Spanish's verbs**, two sessions (section 7). 6a: es's lexical forms (`spell` the identity under the
  stress statement), its classes (e-ie, o-ue, e-i, -go, short futures, strong preterites: REVIEW), the -ar, -er,
  -ir rules, the token check over es; 6b: listed forms with statements (*ser*, *ir*, *tuv-*), pruning, the label
  regularised produced (*tenió* for *tuvo*). Spanish has about 8,900 verb cells: measure preparation.
- **Smaller:** the 287 wrong-form slips (ship or compute free variants of paradigm spellings, or give nouns
  cells); prepositions with the article typed apart (*3a l ba7r*); glosses for the rule ids (with stage 5's
  cards, since they ship); *wesel*'s command.

## Every language (2026-11-25): stages 1 to 4 for the other eleven

The owner asked for rules in every language's lexicon ("minimal for tok and ltc, but otherwise, yeah"). Each language
went through stages 1 to 4 as apc did, in a session of its own, and was merged here; each has its as-built note in
docs/rules/<lang>.md (counts, rules and branches, classes, engine changes, where the course and the rules disagree, the
questions for the owner). Every rule, branch, class, listed form and statement is REVIEW. No token's text, spelling,
reading, accept set or clip changed, but for two annotation fixes the coordinator approved (below).

| | Tokens (both scripts) | By the rules | By a listed or pinned form | Notes |
|---|---|---|---|---|
| tok | 5,330 | all (citation cells) | 0 | no inflection; sitelen pona states no `spell` (a logograph is lexical) |
| lzh | 1,954 | all (citation cells) | 0 | no inflection; the forms are the characters |
| yue | 3,724 | all (citation cells) | 0 | a form pairs each character with its Jyutping (學hok6生saang1) |
| bar | 2,071 | 1,669 | 402 | verbs stored as stems (`stemmed`); 260 of 263 pinned copies pruned |
| uz | 2,504 | 2,504 | 0 (1 pinned) | affix lexemes written by exponents; Cyrillic spelled from the Latin |
| fa | 1,700 | 1,547 | 153 (listed present stems) | the forms carry the short vowels as vocalization.yaml marks them |
| chg | 2,689 | 2,481 | 208 free variants | the forms are the scribes' Arabic spellings; free allomorphs |
| es | 11,152 | 9,863 | 1,289 | 813 of 835 pinned copies pruned; 7,494 paradigm spellings ship |
| sk | 2,873 | 2,140 | 733 | 25 classes by declension and conjugation; all 530 pinned copies pruned |
| grc | 1,282 | 839 | 443 | the accent placed by rule (recessive, persistent, oxytone, ultima) |
| hbo | 2,452 | 1,543 | 909 | 113 verbs as radical forms over 152 stems; noun plurals pinned |

**What the engine gained** (each additive, each with vectors on an invented language; apc's bundle is byte for byte
what it was): a notation may name no vowel signs and a `spell` may have no rules (an alphabet's form is its spelling);
the token check runs for a language with a notation and no rules (each token in its citation cell); a token of equals,
no base marked (yue 四十), realised part by part; `stemmed` (a category's string forms are stems, the citation cell
realised by rule: bar, uz); `strip` on a rule (a cited ending taken off first: grc); an exponent may write an affix
lexeme (`Exponent.lexeme`, the token's allomorph chosen: uz); a lexeme beside the base realised in the values its token
gives it (es buscarlos); a condition reads a stored form whole or up to its first boundary (sk by+ť, es levantar+se);
`Condition.own` (a lexeme's own values: sk's declensions) and `Condition.context` (a token's context: hbo's pause,
nesiga, maqaf); free forms of a cell (`LexemeForm.free`, `Realisation.free`, `RealiseOptions.variant`) and free
allomorphs (`Allomorph.free`, `Realisation.alternatives`, the token's other allomorphs chosen again around one: chg,
hbo), one mechanism each, unified in the hbo merge; an allomorph's condition may read its token's base (hbo's suffix
series); `LexemeForm.before` (a stem that holds only before a suffix) and a form with no `feats`; accent rules (an
`accent` rewrite reading the notation's `prosody`: grc); a `spell` that reads the form decomposed (`decompose`: grc) or
keeps its boundaries for its rules (`boundaries`: chg's half-space); `unmarked` in language.yaml (values the course
uses from the start and never introduces, read as taught where a paradigm's cells are listed: es, sk; bar declares
none, so its present cells do not ship yet).

**Course annotations changed** (the coordinator approved each; nothing a learner reads): es's twelve imperatives with
an enclitic list it as échale does, and llámenme, Díganme are plural; fa's verb tokens choose their tense (Pres 170,
Past 20), which splits a gap-fill's options by tense, and its existential هست chooses `Variant: Long`.

**The rules explorer** (debug mode, `#/<course>/<orth>/rules`, CLAUDE.md "Rules explorer notes") puts any lexeme
through its language's rules by hand, from the lexicon's own files, with the token check's verdict on every way the
course writes it: the place to try a rule before the compiler sees it.

**For the owner** (each language's note has its own list): bar's present cells (declare its `unmarked`?); fa's tense
annotation and the present stem as a principal part; yue's paired notation; uz's eleven lemmas cited inflected; chg's
harmony classes; grc's aorist `Aspect=Perf` (twelve pinned stems hang on it) and its principal parts; hbo's pausal
`context` and the article after a preposition; es's and sk's regularised forms of suppletive or defective words, which
are not words (stage 6 must decide before the label `regularised` is produced).

## apc's units 21 to 30 (2026-11-25)

Units 21–30 (ADR 0080's amendment) were written through the rules, and three gaps were filled where a unit needed a
form the rules did not give (every branch REVIEW, each with a vector in conformance/realise.json):
- `rule:apc-feminine-t` **doubled**: ة is t before a vowel-initial ending after a doubled letter, the doubling kept
  (مَرّة, مَرّْتين marrten; Kline p. 134 writes marten).
- `imperfect` **doubled-a**: a doubled verb whose present is in a keeps it (ضَلّ, yDall, nDall: Kline p. 71); dall is
  the only one so far.
- `rule:apc-passive-participle`: `{Aspect: Part, Voice: Pass}` (Voice a new feature, in `dimensions`), before the
  active participle's rule, on a `passive` stem: Form I مَ1ْ2ُو3 (maftu7, ma7bub: a doubled verb's radicals apart),
  its defective مَ1ْ2ِي, Form II مْ1َ2َّ3 (msakkar) and its defective; none from a hollow Form I verb (Kline p. 140).
  It agrees as the active one does (-e/-a, -in).

