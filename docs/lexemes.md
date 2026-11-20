# Morphemes: what Nabu teaches (brainstorm)

- Status: brainstorm, 2026-11-18. Not an ADR: questions are still open (§16).
- Diagrams of the model: [lexeme-model.md](lexeme-model.md).
- Written as the discussion went: where an earlier section disagrees with §2 (Terms) or with lexeme-model.md,
  those win. In particular, "head" was later folded into lexemes; "cell", folded into features at first, came back and was
  renamed "form" (2026-11-19).
- **Decided** marks the owner's decisions; **Proposed**, suggestions not yet agreed; **Open**, what awaits a
  decision.

## 1. Why: the word is an orthographic unit

The app teaches "words", and a word is where a script puts its spaces: a fact about an orthography, not a
language. yue and lzh have no spaces; sitelen pona runs words together; chg joins suffixes but writes the
copula after a ZWNJ; Hebrew writes וְ joined; Persian را is a clitic written apart, and ‑ها is joined
through a ZWNJ; apc's Arabic and Arabizi need not agree on where a word ends. A script-first app should
teach a unit of the language: the **morpheme** (§2).

**The data is about halfway there.**

| What we want | Where it is today |
|---|---|
| One sense per unit | sense KCs (知 / 知.zhi, bar.go) |
| Parts of words credited | morphs carry KCs (ADR 0061) |
| Allomorphs share a unit | hbo וְ and וָ are both `sense:we` |
| Morphemes with no letters | unwritten morphs (ADR 0136) |
| Normal orthographic form | KC `forms` (the lemma) |
| Fully marked form | `vocalization.yaml`; a token's `vocalized` |
| Readings | token `readings`; pinned on the KC form (ADR 0117) |
| Gloss | `gloss` per support language |

**What's missing:**
- The morpheme isn't what is "known": ADR 0100 knows words.
- Morphemes have no class or attachment.
- Nothing records evidence for individual allomorphs.
- Exponents that aren't one contiguous span can't be represented.

## 2. Terms

Renamed 2026-11-19 (Decided); earlier drafts called the listed unit a "lexeme" and the paradigm-owner a
"lemma". Every term now keeps its textbook sense (lexeme-model.md, "Naming").

**The objects**

| Term | Meaning | Examples | Status |
|---|---|---|---|
| **concept** | Links lexemes, or forms, that differ only socially (variety, speech level, honorific), never in what is said | EAT (*mangan*, *nedha*, *dhahar*); CAR (*carro* in Cuba, *coche* in Spain) | Decided |
| **lexeme** | A meaning (glossed) with lexical features (part of speech, gender, class), owning a paradigm; belongs to scopes (variety, register). Its boundary: what a learner must know to know it | SER; RAFTAN (*raft‑*, *rav‑*); *nedha*; *casa* (feminine) | Decided |
| **morpheme** | What a learner learns: one sense with its lexical form(s), whatever can't be derived (§3), in any class and attachment. Bloomfield's minimal sign, stretched to portmanteaus and listed multi-word items | *kitob*, ‑dan, 呀, را, *ran*, *tuv-*, 東西, *darse cuenta* | Decided |
| **allomorph** | One of a morpheme's forms, picked by a context: stored with its context, or given by a rule | ‑ga / ‑ka / ‑qa, וְ / וּ, *el agua* | Decided |
| **lemma** | A lexeme's citation form, the one word cards show (as in UD and ADR 0061) | *ichmoq*, خوردن | As now |

**Meaning**

| Term | Meaning | Examples | Status |
|---|---|---|---|
| **sense** | A morpheme's meaning: its lexeme's meaning plus features. One morpheme, one sense | *ran* = RUN + past | Decided |
| **feature** | A grammatical value. **Lexical** ones are the lexeme's, constant across its paradigm; **inflectional** ones vary across it (register among them). Inflectional ones are *inherent* (add meaning, learned as a contrast) or *contextual* (forced by syntax; a rule plus a lexical feature) | feminine, krama, Cuban; past, 3sg, dative | Decided |
| **gloss** | A lexeme's label in one support language; a morpheme's adds its features ("run (past)", "eat (krama)") | *qoʻl*: "hand; arm" | Decided |
| **variety** | A scope in the one lexicon: the morphemes, lexemes, forms and rules a dialect has (shared by default); a course picks one | Cuban; Peninsular | Decided |

**Form**

| Term | Meaning | Examples | Status |
|---|---|---|---|
| **lexical form** | A morpheme's one stored form: the least underspecified, in the script, conventions invented where it falls short | pointed Hebrew with stress; 楊 以開三陽平 | Decided |
| **context** | The setting that picks an allomorph, adding nothing to the sense: phonological, prosodic, or a property of the morpheme it combines with | before a vowel; pause; a hollow root | Decided |
| **elsewhere form** | The one allomorph with no context | *a* (beside *an*) | Proposed |
| **projection**, **surface form** | What the language's rules derive from a combination's lexical form: each orthography's spelling, each scheme's reading | pointed → unpointed; position → Baxter, Pinyin | Decided |
| **variant** | Systematic free variation a projection rule makes: accepted | HK / TW characters; Arabizi spellings | Proposed |

**Grammar**

| Term | Meaning | Examples | Status |
|---|---|---|---|
| **rule** | A pattern stated without naming any morpheme, with its conditions and its own KC | ‑ga → ‑qa after q; *un‑* on non-negative adjectives | Decided (the derivability test); data Proposed |
| **combination** | What merge builds from morphemes and features; a value, never stored (a word form is a combination of one) | *kitoblarimdan*, *walked*, *the writer of X* | Decided |
| **utterance** | Stored content: a combination plus the order it was said in | a sentence, a story line | Proposed |
| **paradigm** | A lexeme's forms across its inflectional features, by rule or by listed morphemes | SER: *soy*, *eres*, *fue*… | Decided |
| **base**, **root** | What a derived morpheme is built on; a Semitic root | *writer* ← *write*; مَكْتَب ← ك‑ت‑ب | Proposed |
| **family** | Words linked by a base or root | *write*, *writer*; كاتب, مكتب | Open (§10) |
| **morph** | A morpheme's exponent in one token, anchored on the lexical form | *dan* in *Samarqanddanman*; the ezafe's kasra | Proposed |
| **construction** | A syntactic pattern with slots | apc *used-to* | As now |

**Learning and prompts**

| Term | Meaning | Examples | Status |
|---|---|---|---|
| **facet** | A skill: an edge between a morpheme's projections and its sense (§11) | recognize, produce, listen, read-script | As now, extended |
| **learned** | Every part that can't be derived, shown (lexeme-model.md) | | Decided |
| **literal gloss** | A memory hint from a morpheme's real parts, after the gloss, never on a prompt | زمین خوردن, lit. "earth + eat" | Decided |
| **chunk** | An utterance taught whole before its parts | *Qayerdansiz?* | Proposed |
| **underspecification** | What one language leaves open that the other specifies | "you" → *tú* / *usted* | Decided |
| **tag** | What a prompt shows to decide a feature the target needs | "to your grandmother", "Cuban" | Decided |
| **wug** | A made-up word testing a productive rule | *bolaq* → *bolaqqa* | Decided (idea) |

**Text**

| Term | Meaning | Status |
|---|---|---|
| **token** | An orthographic word, per orthography: the surface of a word-sized combination | As now |
| **word** | UI copy only | Proposed |

- **Rejected:**
  - "listeme" (Di Sciullo & Williams 1987: precise, but lame-sounding);
  - "aspect" for lexical features (it collides with verbal aspect);
  - "property" (merged into lexical features), "cell" (an inflectional feature set; back later, renamed "form"), "head";
  - "form" for the representations (`form:` KCs; the glossary lists three senses already);
  - "tier" for what a morpheme stores (it has one; tiers are only what projections produce).
- **Where "morpheme" stretches the textbook** (Bloomfield's minimal sign): portmanteaus (*ran*), morphemes
  whose form combines other morphemes' forms (*darse cuenta*), and semi-transparent listed items (*writer*
  the occupation). The defence for listing irregular forms whole: Pinker's *Words and Rules* (1999). We model
  the learner's mental lexicon, not only the grammar's analysis.

## 3. The morpheme rule

**Decided:** if something can be derived purely from rules, it is the same morpheme or a combination of
morphemes. If it can't, it is a separate morpheme. This is Aronoff's blocking (1976) and Kiparsky's Elsewhere
Condition (1973): rules produce the regular cases, and a listed form takes precedence where one exists
(*ran* blocks *\*runned*, *glory* blocks *\*gloriosity*).

**Decided consequences:**
- *run* and *ran* are separate morphemes. Suppletive and irregular forms split.
- A non-compositional combination is a morpheme: 東西 "thing", *darse cuenta*, *jan pona*.
- *carro* and *coche* are separate morphemes.

**Proposed clarifications:**
1. **Both form and meaning have to follow.**
   - *ran*: the meaning follows (run.PST) but the form doesn't, so it's a morpheme.
   - *writer* as an occupation: the form follows but the meaning doesn't, so it's a morpheme.
   - *the writer of the list*: both follow, so it's *write* + *‑er*.
2. **Rules may take a lexeme's lexical features as input** (gender, class). Otherwise every stem-changing
   verb form would be a morpheme.
3. **A rule is stated without naming a morpheme.** A rule with exceptions is a rule plus morphemes that block
   it. A table counts as a rule when it is about graphemes and applies to every word containing them
   (OpenCC's 裏 / 裡).
4. **Derivability is judged against the language's rules, not the learner's progress.** *kitoblar* is
   *kitob* + *‑lar* even before ‑lar is taught; until then it is taught as a chunk (§13).
5. **Split stems, not words, where the irregularity is in the stem:**
   - es *tuv-* (tuve, tuviste, tuvo…);
   - grc *εἶδ-*, the aorist of ὁράω;
   - fa present stems رو and بین;
   - apc broken plurals (walad / wlad).

   Forms that can't usefully be split are whole-word morphemes (*soy*, *eres*, *fue*).
6. **Decided: morphemehood is symmetric.** What can't be derived in both directions is a morpheme, never a
   morpheme for one direction only:
   - collocations and Persian compound verbs (فکر کردن "think", lit. "thought + do"), which can be decoded
     but not encoded;
   - idioms (زمین خوردن "fall", lit. "earth + eat");
   - derived words whose form or meaning no rule gives, however easy they are to decode: *writer* the
     occupation and مَكْتَب (the meaning drifted), *escritor* (its stem is the irregular participle's), 學生
     "student" (‑生 isn't a productive suffix); and opaque ones (*cooker*, *drawer*, 大學 "university",
     كِتاب). A gap elsewhere in the pattern is never the reason (§3.8).

   Only what is regular both ways is a combination (*rápido* → *rápidamente*; *the writer of X*).
   - A morpheme keeps its links to its parts (base, root: §10), so a derive card still credits the affix when
     a learner works out a transparent word.
   - If cards on an edge the parts already give away (recognizing *writer*) prove wasteful, handle it at
     the edge (§11), never by splitting morphemehood by direction.

7. **Rules are data, and the compiler checks every claimed derivation.**
   - A token analysed as a combination must derive from the rules, or the compiler reports it.
   - A form that can't be derived must be a morpheme (a lint, much as `kc.inflected-form` enforces lemmas now).
8. **Decided: a gap doesn't make a combination a morpheme.** Some combinations don't exist for purely semantic
   or phonological reasons; the ones that do exist are still derived by rule.
   - Decided (round 3): a rule carries its conditions, and a gap the conditions explain is predictable:
     - phonological: English ‑en after an obstruent (*blacken*, *\*greenen*), the comparative ‑er by
       length (*bigger*, *\*intelligenter*);
     - semantic: *un‑* on adjectives that aren't already negative (*unhappy*, *\*unsad*); "place of" only
       for actions that happen somewhere;
     - blocking by a listed morpheme (*went* blocks *\*goed*, *glory* blocks *\*gloriosity*): predictable once
       the morpheme is known. Blocking is per sense: *thief* doesn't block *stealer of hearts* or
       *scene-stealer*, which the rule still makes.
   - Decided (round 3): only an arbitrary gap (the conditions are met and still no word exists) forces listing,
     because then a learner can't know whether the word exists.
   - Conditions are part of the rule's data (stem shape from the profile and scheme, semantic properties
     on morphemes), and wug stems must meet them.

## 4. Senses and features

**Decided:**
- One morpheme, one sense.
- A sense is a lexical meaning plus features. *ran* is run.PST, its Leipzig gloss; *run* and *ran* don't
  share a sense.
- A gloss is a label for the sense in each support language, and may be several words ("hand; arm" for
  *qoʻl*).
- Register is a feature.

**Proposed:**
- **Splitting test:** split when knowing one sense wouldn't let a learner understand or use the other.
  - Split: homonyms, opaque extensions, different grammar or contrasts.
  - Keep together: transparent extensions (*boshliq* "head" → "chief").
  - Never split because a support language needs two words.
  - Decided: yue 嘅 is several morphemes.
    - The linker ge3: possessive and attributive, its head left out by rule (我嘅書, 我嘅, 凍嘅).
    - The sentence-final particles: assertive ge3, and ge2 (surprise).
    - Open: are possessive and attributive one linker or two? Today's yue KC `sense:嘅` is glossed
      possessive ('s, of; `Poss=Yes`), but 5 of its 10 tokens are attributive with no head (凍嘅 "a cold
      one", 白色嘅 "a white one").
- **Grammatical morphemes are identified by UD features** (`Case=Abl`), language-neutral; learner glosses stay
  per support language.
- **Inherent vs contextual features (Booij 1996)** matter to the grader:
  - Inherent ones add meaning (tense, nominal number). Where the prompt doesn't decide them, they're the
    learner's choice (ADR 0085).
  - Contextual ones are forced by the syntax (agreement, structural case), so they're right or wrong given
    the sentence. *el* / *la* are separate morphemes differing only in a contextual feature.
- **Register is decided by the prompt's situation.** The prompt tags it (extending `persons`), a wrong
  register is WRONG_WORD, and every level is exercised (ADR 0075). This is how CLAUDE.md already expects
  register to arrive.
- **Decided: dialect is a feature, and the prompt specifies it** where the meaning has dialect synonyms
  ("Cuban", §12). This replaces es's "pan-Hispanic forms accepted".
  - It splits senses: *carro* is "car" in the Americas and "cart" in Spain; *guagua* is "bus" in Cuba and
    "baby" in the Andes.
  - Dialect also produces variants within one morpheme where the difference is systematic (seseo, *ehto*).
- **Conversion** (uz *yaxshi* "good", adjective, and "well", adverb): one sense, with `pos` on each token
  rather than only on the KC (Open).

### Javanese, for when we write it

- **Two dimensions of register:**
  - *speech level*, set by the addressee: ngoko or krama;
  - *honorifics*, set by the referent: krama inggil raises a respected person's actions and possessions
    (even within ngoko: *ngoko alus*); krama andhap lowers one's own actions towards them (*matur*).

  Korean and Japanese split the same way.
- **Register lexemes share a concept** (Decided later: they are separate lexemes, not one paradigm): mangan / nedha / dhahar "eat", omah / griya / dalem "house", kowe /
  sampeyan / panjenengan "you".
  - Most words have no krama form: the ngoko form is the head, and krama morphemes exist only where the
    language has them.
  - Affixes have register pairs too: ‑e / ‑ipun, di‑ / dipun‑, ‑ake / ‑aken.
- **Prompts tag social relations** ("to your grandmother", "about your teacher"). English can't carry
  register, so the tag is the only signal in English → Javanese.
  - Every sentence probably carries a tag: today an untagged sentence accepts every form.
- **Questions that differ in register only:** "which would you say to your grandmother?"
- **Script:** aksara Jawa beside Latin, with *pasangan* stacking below the line.
- **Open:** krama or ngoko first.

## 5. Classifying morphemes

**Decided:** two axes, class (open / closed) and attachment (independent / dependent / clitic). Plus
inflection vs derivation, which is very important (§6).

| | Independent | Dependent | Clitic |
|---|---|---|---|
| **Open** | *kitob*, 書 | 晨 in 早晨; Semitic roots | (nearly empty in any language) |
| **Closed** | 呀, *siz* | ‑dan, ‑ning | را, וְ, Spanish *me lo* |

**Proposed:**
- **Clitic status belongs to the language; orthographic attachment belongs to each orthography.**
  - The kinds of attachment: joined, joined through a ZWNJ, joined by maqaf or hyphen, spaced.
  - Spanish clitics are joined after some hosts (*dámelo*) and spaced before others (*me lo da*).
- **Dependents get a position:** prefix, suffix, infix, circumfix, non-linear (§9).
- **The distinction should change behaviour**, or it's just a label: which cards a morpheme gets, what
  "learned" means for it, where its distractors come from, and how it's first presented.
- **Grammatical morphemes are known by use, not by gloss recall.**
  - "What does ‑dan mean?" is a bad card.
  - The evidence comes from choosing the form, producing it, and choosing the allomorph.

## 6. Inflection and derivation

**Proposed:**
- **Inflection never makes a morpheme.** Derivation makes one wherever its result can't be derived in
  both directions (§3.6). ADR 0061's "lemmas, never inflected words" already means "remove the inflection, keep
  the derivation".
- **Two levels in a token.** Today `morphs` is a flat list: *oʻqituvchilar* is either *oʻqituvchi* + ‑lar or
  *oʻqi* + ‑t + ‑uvchi + ‑lar, never both. We want a morpheme with an optional derivational analysis, plus
  its inflections: a tap shows both levels.
- **Credit differs.**
  - Each use of an inflection is evidence for it.
  - A derived word got right is weak evidence for its affix (it may have been memorised). The test for a
    derivational affix is generalisation: derive cards and wug tests (§14).
- **Cards and distractors differ.**
  - Inflection: "which form" (ADR 0132), allomorph choice, paradigms; distractors are other forms.
  - Derivation: derive and interpret cards, word families, building from tiles; distractors are other
    derivatives of the same base (*yozuv*, *yozuvchi*, *yozma*).
- **Order of introduction differs.**
  - A derived word is taught whole first; its affix becomes a target once two or three words carrying it
    are known.
  - Inflection can be taught head-on.
- **The grader already sides with inflection.** Contrast sets (ADR 0066, 0081) are inflectional; a
  derivational slip lands on another morpheme, which the lexicon check (WRONG_WORD) catches.
- **The grey zone needs a policy before annotating:** uz causative ‑t / ‑dir, Hebrew binyanim (hbo already
  treats each stem as a morpheme), Spanish ‑ito, participles and infinitives.
  - The test: is it a form in the lexeme's paradigm, or a word with its own entry?
  - When unsure, call it derivation.
  - Open: uz causative (*oʻqit-* "teach" beside *oʻqi-* "read").
- **Families** (§10) link derived words whether or not they are morphemes.

## 7. Paradigms and irregular forms

**Proposed:**
- **`form:` splits.** Some `form:` KCs are forms (es `form:pret-3s`, grc `form:f-acc`, hbo
  `form:wayyiqtol-3ms`); others are affix morphemes (`form:abl-dan`).
- **Choosing a form and realising it are credited apart.**
  - A form is credited when the learner chooses it.
  - An exponent is credited for the form: ‑ed in *walked*, the morpheme *ran*, the stem *tuv-*.
  - An irregular morpheme points at its head and names its form (`head: run, form: PST`).
- **Zero morphemes disappear.** A zero is a form with no exponent (uz COP.3SG).
- **The grader can recognise overregularisation.** *\*tenió*, *\*runned*: the right form, the rule's
  output, blocked by a morpheme. Credit the form, count a miss on the morpheme, and say "right tense, irregular
  verb".
- **Never use regularised non-words as distractors.** Showing them risks teaching the error (Roediger &
  Marsh 2005).
- **Lexical classes.** A form is regular if it's predictable from the lemma (citation form) plus a class
  recorded on the lexeme.
  - Mark the class where it has many members; list the forms as morphemes where it has a handful.
  - This is the principal-parts tradition.
  - Open: Spanish stem-changers and Persian present stems are the test cases.

## 8. What a morpheme has: one fully specified form

**Decided:**
- **A morpheme has one tier: its fully specified form(s).** It's plural only for different realisations in
  different contexts.
- **Each language has rules** that derive the normal orthographic form and the phonemic form from the
  fully specified form.
- **A language with no good fully specified schema gets one invented.**
- **The phonetic form is shelved for now.**
- (Replaces the earlier list of four representations; the gloss stays, as the sense's label.)

```
                      ┌─orthography rules──▶ each orthography (normal form)
fully specified form ─┤
                      └─scheme rules───────▶ each phonemic scheme or tradition
```

**Proposed:**
- **The schema holds the union of what every projection needs.**
  - An orthography that records etymology (Arabic ق read ʔ, ث read t or s; Persian ث / س / ص all s)
    needs the distinction in the lexical form: a fact of spelling now, whatever its history.
  - A phonemic scheme needs the vowels, stress and length the script leaves out.
  - Adding an orthography or scheme later can mean extending the schema.
- **Decided: in the script, never a spelling juxtaposed with a reading.** Where a script can't show
  something (apc-Arab's e and o), invent a convention in that script rather than pair it with a
  transcription. One form in one script captures the generalisations; a pair only restates them word by
  word.
- **Proposed: what that means where a script can't write sounds at all:**
  - **Han (yue, lzh):** a character's readings come from a table (Unihan, the pinned profile tables), so
    書 is syu1 once, for every morpheme containing it. The fully specified form is the characters plus a
    disambiguator only where the table gives more than one reading (行 haang4 / hong4) or a changed tone
    applies. lzh's three traditions are three tables. (Deriving Pinyin and Jyutping from Baxter by sound
    change, with exceptions listed, would capture even more; it's a bigger job.)
  - **tok:** the Latin form is fully specified. sitelen pona is a projection: a table from word to glyph
    (glyphs are graphemes, so it counts as a rule, §3.3) plus the cartouche rule for names.
  - **chg:** Schluessel's Arabic with invented vowel marks for the distinctions his Latin makes; his reading
    then follows by rule.
- **Proposed: use existing Unicode marks where there are some.** Unicode already encodes extra Arabic vowel
  signs added for other languages written in Arabic script (U+065A SMALL V ABOVE, U+065B INVERTED SMALL V
  ABOVE, U+065C DOT BELOW), and Hebrew has QAMATS QATAN (U+05C7). New conventions need font coverage, a
  place in NFC's canonical ordering (their combining classes), conformance vectors, and the visual matrix.
- **Proposed: invented marks are data, not necessarily what learners see.** The learner's "vowel marks"
  view is itself a projection: conventional marks, plus invented ones only where a course decides they're
  worth teaching (apc's e and o might be).
- **Where courses stand, and what to invent:**

  | Course | Fully specified schema | To invent |
  |---|---|---|
  | es | the orthography | almost nothing: a marker for the odd exception (x in *México*) |
  | tok | Latin | nothing (sitelen pona is a projection) |
  | grc | the `attic` reading (length marks) | nothing |
  | yue | characters + table | disambiguators for polyphones and changed tones |
  | lzh | characters + Qieyun positions (below) | overrides where the derivations miss |
  | chg | Arabic, Schluessel's reading beside it | vowel marks carrying his distinctions |
  | hbo | pointed text, with stress etc. in the `tiberian` reading | one form: pointing + QAMATS QATAN (U+05C7) + a stress mark + vocal shewa |
  | fa | vocalised Arabic script | stress, and conventions for و and final ه |
  | uz | none (Latin or Cyrillic) | stress; probably Cyrillic as the base, since ц and ь carry what Latin lost in Russian loans |
  | apc | none | Arabic-script marks for e and o, and for which reading ق, ث, ذ, ظ take where it isn't the regular one (ق as q in learned words, ث as s) |

- **An invented schema is data**, like reading schemes (ADR 0109): its inventory, plus projection rules to
  each orthography and phonemic scheme. Every projection needs conformance vectors passing in both
  harnesses.
- **Authoring needn't change.** Course text stays in the normal orthography, as ADR 0053 has it, annotated
  with morphemes and forms. The compiler projects each token from its morpheme's lexical form, the
  form's features and the context, and reports any token whose authored text disagrees. Most per-token pins (readings,
  `vocalized`) become checks, not data; they stay only for what rules can't derive.

### lzh: Qieyun positions

**Decided:** lzh's fully specified form gives each character its Qieyun phonological position (音韻地位), as
Wiktionary does: 楊 is 以開三陽平 (initial 以, open, division III, rhyme 陽, level tone). Baxter, Pinyin and
Jyutping are derived from it, with nk2028's tools rather than Wiktionary's. A schema for overrides follows
as needed.

**Proposed:**
- **It stays in the script.** The position is the tradition's own notation, as the dummy root is for
  Semitic patterns.
- **Tools:** `tshet-uinh` (MIT; positions and the Guangyun data) and `tshet-uinh-examples` (MIT; the
  derivation schemes: `baxter` in its 1992 and 2014 versions, `putonghua`, `gwongzau` and more), on which
  tshet-uinh-deriver is built. They run at compile time; the compiler already calls Node.
- **A first run** (2026-11-18, `tshet-uinh` 0.15.4) over lzh's 1954 tokens, 248 distinct character
  readings:

  | | Derived as pinned | Not |
  |---|---|---|
  | Baxter (a position whose Baxter is the pinned one) | 241, none ambiguous | 6, plus 1 character missing |
  | Pinyin | 206 | 35: 23 tone only (entering tones the deriver leaves toneless: 刻 ke, 國 guo), 12 irregular (行 xíng, 矛 máo, 百 bǎi) |
  | Jyutping | 213 | 28 (矛 maau4, 也 jaa5, 見 jin6, 百 baak3, 國 gwok3) |

  Every Baxter pin that matched picks out one position, so today's pins convert to positions
  mechanically.
- **The overrides the misses call for:**
  - **read as** (讀為, a loan reading): 女 read as 汝 (nyoX "you"); 鯈 read as a character whose reading is
    *dew*;
  - **variant lookup**: 劍 isn't in the data under that form (the Guangyun has 劒), so look up through the
    pinned variant tables;
  - **a position the Guangyun lacks**, given explicitly with its source: 知 "wisdom" (trjeH), 有 (hjuwH), 強
    (gjangX);
  - **analysis differences**: B&S write 生 *sraeng*, TshetUinh's 2014 Baxter gives *srjaeng*. The course is
    checked against B&S, so they win where they differ;
  - **modern readings that departed from regular change**, per character and position, so stated once for
    every morpheme containing them (行 匣開二庚平 → xíng; 國 → guó, gwok3); Mandarin entering tones as a
    table;
  - **literary or colloquial**, as policy: 百 bǎi, not the literary bó.
- **It finds inconsistencies.** 不 is pinned *pjuw* (B&S's reading), but its Pinyin *bù* and Jyutping *bat1*
  descend from the entering-tone reading *pjut*. The three are meant to be one reading (CLAUDE.md), and
  the compiler's line-up check didn't catch it. A single position would.
- **lzh only.** yue's colloquial Cantonese has too much without a Qieyun source (嘅, 佢, 唔, changed tones);
  it keeps characters, a table and disambiguators.

### Variants

**Decided:**
- **A morpheme may store several forms, provided each names the context that triggers it**, derivable or
  not.
- **Free variation means two morphemes**, almost certainly: two forms with no context to choose between
  them aren't one morpheme.

| Kind | Examples | Where it lives |
|---|---|---|
| Contextual | a / an, ‑ga / ‑qa, וְ / וּ, *la* / *el* (*el agua*), *y* / *e*, hbo pause forms | the morpheme's forms, each with its context (or a rule that gives them) |
| Systematic free variation | HK / TW characters; Arabizi *3arabi* / *3rabi*; apostrophes in *oʻ*; Cantonese n / l | the projection rules (canonical output first, the rest accepted): never a morpheme's stored form |
| Free variation in a morpheme's own form | *período* / *periodo*, *vídeo* / *video*, اتاق / اطاق | two morphemes (Decided) |

**Proposed:**
- **Exactly one form is the elsewhere form, with no context**; every other form names its context.
  Kiparsky's Elsewhere Condition again: *a* is the elsewhere form, *an* the one before a vowel. A lint
  rejects two forms whose contexts overlap ("free variation: make two morphemes"), so the rule enforces
  itself.
- **Contexts are a per-language inventory, data like schemes:** before a vowel, after q, before a labial,
  pause, nesiga, before a stressed á‑. Tokens already carry one (`context`, ADR 0135); the same labels name
  a morpheme's forms. A stored form that a rule also derives is checked against the rule.
- **A context is not a form.** A form is a feature in the sense: the learner chooses it, or the syntax
  forces it (agreement), and an irregular form is a separate morpheme (*el* / *la*). A context is the
  setting that picks a form, and adds nothing to the sense: phonological or prosodic (before a vowel,
  pause), or morphological, a property of the morpheme it combines with (a pattern's forms by root class,
  §9).
  - *el agua* shows the difference: that *el* is the feminine *la*'s form before a stressed á‑, not the
    masculine morpheme. es already pins it `form:fem`.
- **Systematic variation stays in the projection rules.** The two-morphemes rule is about forms a morpheme
  would store; HK / TW characters and Arabizi spellings never are.
- **"Free" variants usually turn out to differ in a feature,** which the rule then makes explicit:
  - dialect: *vídeo* (Spain) / *video* (the Americas);
  - era or spelling standard: اطاق, the older spelling of اتاق;
  - register.

  The prompt specifies the feature as for dialect (§12), so there's still one right answer.
  - Generalising the dialect slip: an answer that is another lexeme of the same concept,
    differing only in a variety feature (dialect, register, era), gets feedback naming the feature: "that's
    the older spelling; today اتاق", "that's krama; to a friend, ngoko".
  - Two morphemes identical in meaning *and* every feature would be a gap in the model: no prompt could choose
    between them.
- Most contextual forms follow from rules plus a class property (the hbo segholate *mélek* / *malk-*), so
  storing them is optional where a rule exists.
- Lexical dialect differences are separate lexemes (*carro* / *coche*); systematic ones (seseo) are variety
  rules in the phonemic projection.
- Token `variants` lists mostly disappear: projection rules generate them.

## 9. Exponents that don't tile

**Decided:** roots and morphemes without segments must be modelled ("roots don't tile: skill issue"), with
a new design language.

**Proposed:**
- **Since §8's one-tier rule: anchors live on the fully specified form only.** The projection rules carry
  them to each orthography and scheme, so every projection must keep its alignment (which output letters
  and syllables come from which input). The tiers below are then what a projection produces, not what is
  stored.
- **Exponents are anchored on tiers, not cut out of a string.**
  - Each orthography's graphemes form a tier: base letters, plus marks addressed by which mark they are
    (never by position: NFC reorders them).
  - Each reading scheme's syllables form a tier: segments, tone, stress, length (schemes already define
    syllable shape and tones, ADR 0109).
  - A morph's exponent is a set of anchors, possibly on several tiers, possibly not contiguous, possibly
    empty on some. Today's span is the special case.
- **The tiling check generalises.** On each tier, every base letter belongs to one morph, and every mark
  belongs to one morph or is declared predictable by the profile (a *dagesh lene* belongs to none; the
  piʿel's *dagesh forte* belongs to its pattern).

  | Case | Normal orthography | Fully marked | Reading |
  |---|---|---|---|
  | fa ezafe | — | kasra on the last letter | ‑e |
  | yue changed tone (糖 "candy") | — | — | tone of syllable 1: 2 |
  | Root ك‑ت‑ب in مَكْتُوب | letters 2, 3, 5 | same | k, t, b |
  | Pattern مَفْعُول in مَكْتُوب | letters 1, 4 | + every mark | ma‑, ‑ū‑ |
  | uz third-person copula | — (a form, not a morph) | — | — |
  | Welsh mutation; hbo pause | an allomorph conditioned by `context` (ADR 0135) | | |

- **Anchors are the data; templates are the authoring shorthand.**
  - The tradition's own notation, the dummy root: Arabic ف‑ع‑ل (فَاعِل, مَفْعَل), Hebrew פ‑ע‑ל, Arabizi
    f‑3‑l. The dummy letters are profile data, never code.
  - An author writes `root: كتب`, `pattern: مَفْعُول`. The compiler fills the pattern, checks the result on
    every tier (removing the marks gives the normal orthography), and emits the anchors.
  - Templates cover infixes (ifta‘ala's t), gemination (shadda, dagesh forte), circumfixes, and long vowels
    written as letters.
  - Weak roots (قال from ق‑و‑ل) give their anchors explicitly.
  - Reduplication tiles already; its form is a predictable allomorph.
- **Display:**
  - a morph written only as a mark appears on a dotted circle (◌ِ), labelled;
  - tone appears as a change in the ruby (tong4 → tong2);
  - root and pattern each get a row in the gloss panel, the pattern shown with the dummy root;
  - Leipzig Glossing Rules notation in linguist views (`.` portmanteau, `=` clitic, `<>` infix, `~`
    reduplication, `\` change without segments: mouse\PL).
  - Highlighting letters inside a joined word must first be proven in the visual matrix, and never by
    colour alone.
- **Root and pattern words follow the morpheme rule like any affix.** The pattern is a morpheme (closed,
  dependent, non-linear); the word is a combination only where root + pattern gives its form and meaning by
  rule:

  | Word | Pattern | Rule-derived? | So it's… |
  |---|---|---|---|
  | كاتِب "writing (one who writes)" | فاعِل, Form I active participle | yes | a combination |
  | كاتِب "clerk, writer" | same | no: the meaning drifted | a morpheme (a homograph, like *writer*) |
  | مَكْتُوب "written" | مَفْعُول, passive participle | yes | a combination |
  | مَكْتَب "office, desk" | مَفْعَل "place of" | no: the meaning drifted ("desk" isn't "place of writing"). Which of مَفْعَل / مَفْعِل the verb takes follows its imperfective vowel, with listed exceptions (مَسْجِد against يَسْجُد) | a morpheme, with a strong hint (§10); its parts are كَتَبَ + مَفْعَل (lexeme-model.md) |
  | كِتاب "book" | فِعال | no: the pattern has no fixed meaning | a morpheme; the root link is etymology |

  - Arabic teaching draws the same line: Form I verbal nouns (كِتابة, قَتْل, دُخول) are memorised; those of
    Forms II–X are nearly predictable (تَكْتِيب, مُكاتَبة, اِسْتِكْتاب; Form III has two patterns).
  - Semi-productive patterns (مَفْعَل) get decoding practice ("what might مَلْعَب be?"), never wug cards.
- **Decided: a pattern has forms by root class** (sound, geminate or two-consonant, four-consonant, hollow,
  defective, assimilated, I‑nun, III‑he…), and **a letter a form fixes is drawn dark**, like the pattern's
  own letters, since it doesn't vary: hollow faʿala ڡَـاڡَ (qāla), defective ڡَـڡَـى (ramā), yafʿulu hollow
  in w يَـڡُـوڡُ (yaqūlu), Hebrew III‑he ◌ָ◌ָה (bānâ). Rendered 2026-11-19: nothing extra is needed, since
  only the slot letter is faint; marks the form adds (shadda, the I‑nun dagesh of yippōl) stay dark too.
  - Proposed: these are the pattern morpheme's forms with contexts (§8), the context being the root's class,
    a property of the root it combines with. Each form records which radical a fixed letter stands for
    (qāla's ا is the second radical, w or y), so root cards still find ق‑و‑ل.
- **Decided: patterns are shown with placeholder consonants, not on top of a root.** The dummy root makes a
  learner subtract its letters to see the shape. Two failures show it (rendered 2026-11-18, Noto Naskh
  Arabic and Noto Serif Hebrew, Chromium):
  - **Hebrew פִּעֵל hides the piʿel's doubling:** ע is a guttural and can't take dagesh, so the pattern's
    defining feature is invisible (קִטֵּל-style paradigm roots exist for this reason). With placeholders the
    dagesh sits on the second slot.
  - **Arabic اِفْتَعَلَ doesn't show which letters are the pattern's:** its ت looks like a fourth radical.
    With placeholders ت is the only letter between the slots.
- **Decided: the placeholder per script is profile data**, never code:
  - **Hebrew: Decided, U+25CC DOTTED CIRCLE**, Unicode's own "a letter goes here", points on it (◌ִ◌ֵּ◌,
    הִ◌ְ◌ִי◌). Hebrew doesn't join, so nothing breaks.
  - **Arabic: Decided against the dotted circle** (it looks wrong in Arabic); a dotless letter instead,
    with tatweel between the elements to space the slots out (the owner's suggestion). Rendered 2026-11-18
    for مَفْعَل, فَاعِل, فَعَّلَ, اِفْتَعَلَ, اِسْتَفْعَلَ:
    - **U+066E DOTLESS BEH** (the rasm's bare tooth): reads like Arabic, and affixal letters keep their dots.
      But a slot is itself a tooth, so it blurs into the pattern's own tooth letters: اِسْتَفْعَلَ becomes a
      row of teeth.
    - **U+06A1 DOTLESS FEH**: its loop reads as an empty slot and stands apart from س, ت, ن and ي. It could
      pass for ف or ق without dots.
    - Tatweel goes only where both sides join (never after ا, د, ذ, ر, ز, و).
    - **Decided: tatweel beside every slot**, never between two of the pattern's own letters (اِسْتَ joins as
      written), and only where both sides join.
    - Screen readers would read the placeholders as letters ("dotless beh"), so the shape carries an
      accessible name: its traditional name and meaning.
  - **Hebrew, the owner's alternative: samekh ס as the stand-in**, a round letter standing for a circle
    (סִסֵּס, הִסְסִיס). No Hebrew pattern has a ס of its own, so it can't be mistaken for one.
  - **Decided: placeholders are faint, below AA if need be.** They are there to be hard to see; the
    shape's accessible name carries the pattern.
  - **The marks must not go faint with them.** CSS colour can't do that: Chromium paints a letter and its
    marks in one colour, so a slot's vowel, or samekh's dagesh, fades with it (rendered 2026-11-18).
  - **Proposed: a colour font does it.** A copy of the script's font (Noto Naskh Arabic, Noto Serif Hebrew;
    OFL, renamed) with a COLR/CPAL table that paints only the placeholder glyphs (every contextual form, and
    the tatweel) in a palette colour. Marks are separate glyphs, so they stay in the text colour; no spans,
    so nothing can break the joining.
    - Prototyped 2026-11-18 with fontTools, the slot glyphs found by shaping with HarfBuzz (ٮ and ڡ in their
      init, medi and fina forms; ס): the dagesh, the points and the harakat stay black at 28%.
    - **The palette colour must be opaque.** Joined glyphs overlap at their joins by design, and each glyph
      is painted on its own, so a translucent colour doubles up there: dark ticks along the baseline at
      every join (rendered 2026-11-19, black at 28%). An opaque grey (#b8b8b8 on white) hides the
      overlaps. CSS text in a translucent colour has the same flaw.
    - So the grey is a theme token with a value for each theme, set with `@font-palette-values` per theme
      (it takes no `var()`, so a test checks its values match the token's). COLRv1's foreground-at-an-alpha
      would follow the theme by itself, but it has the same overlap problem and WebKit lacks it: COLRv0 +
      CPAL.
    - An opaque grey is tuned to one background: patterns on another surface (a card, a selected row) need
      the token to match that surface, or they sit a little lighter or darker.
    - The font is used only for pattern shapes; built by a script from the pinned font, like the other
      subsets.
  - **Rendered 2026-11-19 in both themes** (slot grey: #c0c0bf light, #5a5854 dark; 28% of the way from
    the surface token to the text token), through slot colour fonts built by shaping:
    - Noto Sans Hebrew's samekh is not a plain circle either (corrected 2026-11-19); Serif and Sans both
      read as a letter.
    - **The dotted circle needs no greying**: it is faint by design, and greyed it nearly vanishes on the
      dark theme. If it's used, it keeps the text colour.
    - **Noto Naskh Arabic (the @fontsource subset) has no U+25CC**, so an Arabic dotted circle always falls
      back to another font, outside the slot colour: one more reason against it.
    - **Syriac works the same way** (Serto with West Syriac vowels, Madnhaya and Estrangela with East
      Syriac vowels; peʿal, paʿʿel, aphʿel, ethpeʿel; the fonts have U+0640 and U+25CC), but semkath ܣ is too
      busy a slot. The candidates are the dual-joining letters no pattern uses as its own (not ʾ, t, m, n, y,
      h, š): beth ܒ, gamal ܓ, heth ܚ, teth ܛ, ʿe ܥ, pe ܦ, qoph ܩ. Beth (a bare baseline stroke, like the
      dotless beh) and pe (a loop, like the dotless feh) are the quietest; gamal and teth stand too tall.
    - **Tatweel only in joining scripts:** a slot in Hebrew stands alone.
    - **Fade:** 28% was not faint enough on either theme; a ladder (20, 14, 10, 6%) was rendered.
  - **Decided (2026-11-19): the slots are 6% of the way from the background to the text colour**, in each
    theme, and the slot letters are:
    - **Arabic: dotless feh ڡ** (U+06A1), with tatweel beside each slot;
    - **Hebrew: samekh ס**, no tatweel (Hebrew doesn't join);
    - **Syriac: qoph ܩ** (U+0729), with tatweel beside each slot. No Syriac pattern has a q of its own.
    - These are each profile's data (apc, hbo; Syriac once a course has it), never code.
    - **Slots that carry no mark vanish at 6%** (settled below: neither fix). A slot with a vowel is located by its vowel; a bare
      one (Syriac peʿal's first and last slots, the last slot of most Arabic and Hebrew patterns) leaves only
      a gap, so the shape no longer shows how many radicals it has. That matters for every reader, low-vision
      ones most. Rendered 2026-11-19, both themes:
      - **A stronger tatweel** (a second palette entry; 20%, 35%): shows dashes *between* slots, so it
        counts gaps rather than slots, reads like hyphens, and does nothing for Hebrew.
      - **A bar under each slot** (a glyph the build adds, a second COLR layer beneath every slot glyph,
        its own palette entry; 20%, 35%): every slot, bare or not, gets a short line at the baseline, like
        a blank to fill in, in every script, Hebrew included, clear of the points below.
      - **Decided: neither.** The tatweel is exactly as faint as the slots, and there is no bar (it looked
        wrong). Bare slots stay as faint as the rest.
    - **Rendered without tatweel too** (2026-11-19): Naskh and Syriac slots then join straight to each other,
      more compact and more like a real word. **Decided: with tatweel.**
    - Nastaliq was rendered for fun; it won't be used.
    - **The build should find slot glyphs by GSUB closure** (what fontTools' subsetter keeps for the slot
      letter), not only by shaping sample strings: a font that picks contextual variants by the
      following letter (as Nastaliq does) defeats sample strings. A ligature that takes in a pattern letter must not be coloured.
    - **The build must pass `glyphMap` to `buildCOLR`** so the colour records are sorted by glyph ID; without
      it they are sorted by name, which only happens to match while no glyphs are added.
    - Decided (round 3): under `prefers-contrast: more` the slots come back up to a visible grey. Cheap (one media
      query choosing another palette), and only for readers who asked for contrast. Forced-colours modes
      draw colour-font glyphs in the system text colour anyway, so there the slots are already full
      strength.
    - The build must skip glyphs with no outline: a ZWJ merges into its slot's cluster, and its glyph got a
      colour record.
  - **A fade slider needs no variable font** (prototyped 2026-11-19 as a private artifact, "Pattern Slot
    Fade").
    - The slot colour is a palette entry, so a slider only has to change the palette:
      - script that rewrites the `@font-palette-values` rule on input works wherever `font-palette` does;
      - in pure CSS, `font-palette: palette-mix(in srgb, --ink-palette calc(var(--fade) * 1%), --surface-palette)`
        is supported by the Chromium here (157); other engines need checking.
    - A variable COLRv1 font with an alpha axis would also work, but alpha brings back the doubled overlaps at
      joins, and WebKit has no COLRv1.
    - Decided (round 3): no per-device preference for slot strength; the default and the contrast setting
      are enough.
    - The build must leave out marks by their character's Unicode category as well as by GDEF: DejaVu's GDEF
      doesn't class the tie (U+035C) as a mark, and it faded with its slot.
  - The slider demo doesn't work in Firefox (owner, 2026-11-19); not investigated, not important for now.
  - **Decided: slot letters for more scripts** (the owner's choices):

    | Script | Slot letter |
    |---|---|
    | Samaritan (Samr) | ʿayin ࠏ U+080F SAMARITAN LETTER IN |
    | Ugaritic (Ugar) | ʿayin 𐎓 U+10393 UGARITIC LETTER AIN |
    | Tifinagh (Tfng) | yar ⵔ U+2D54 TIFINAGH LETTER YAR |
    | Imperial Aramaic (Armi) | teth 𐡈 U+10848 IMPERIAL ARAMAIC LETTER TETH (no good choice) |
    | Hatran (Hatr) | ʿe 𐣯 U+108EF HATRAN LETTER AYN |
    | Mandaic (Mand) | al ࡋ U+084B MANDAIC LETTER AL |
    | Old North Arabian (Narb) | ʿayin 𐪒 U+10A92 OLD NORTH ARABIAN LETTER AIN |
    | Nabataean (Nbat) | zayin 𐢉 U+10889 NABATAEAN LETTER ZAYIN |
    | Palmyrene (Palm) | zayin 𐡦 U+10866 PALMYRENE LETTER ZAYIN |
    | Phoenician (Phnx) | ʿayin 𐤏 U+1090F PHOENICIAN LETTER AIN (a plain circle) |
    | Old South Arabian (Sarb) | ʿayin 𐩲 U+10A72 OLD SOUTH ARABIAN LETTER AYN (a circle) |
    | Elymaic (Elym) | mem 𐿬 U+10FEC ELYMAIC LETTER MEM |
    | Cuneiform (Xsux; Akkadian, Eblaite) | none: the signs are syllabic, so patterns are shown in Latin transliteration (◌, as Latin) |
    | Ethiopic (Ethi) | ʿäyn ዐ U+12D0 in principle. Open, for when Ethiopic arrives: the vowel is fused into the glyph (ቀ ቁ ቂ…), so each vowel order of the placeholder needs its consonant body faint and its vowel strokes dark, as two colour layers |
  - **Proposed: once we ship our own font for pattern shapes, more is possible** (the text stays real
    Unicode; if the font fails to load, the dotless letters still show):
    - **A designed slot glyph** in place of borrowed ڡ / ٮ: a hollow or dotted-outline consonant with all
      four joining forms, an Arabic dotted circle that joins.
    - **Spacing in the font, not the text:** slot glyphs with longer joins on each side, so the shape needs no
      tatweel characters (clean to copy, and the rule above lives in one place).
    - **Numbered slots** through contextual alternates (first, second, third, fourth slot), for quadriliterals,
      geminate roots (مَدّ) and weak roots. Not digits drawn into glyphs: digits differ by locale.
    - **The pattern's vowels in an accent palette colour** as reinforcement, never as the only cue.
    - **Not:** marking which letters of a real word are the root through unregistered variation selectors.
      Only registered variation sequences are conformant.
    - **The cost:** a build script from the pinned font, an OFL rename, and a subset small enough to load
      only with pattern shapes.
  - **Decided: the pattern font is a build step, never a committed binary.** Upgrading the source font
    (the `@fontsource` packages packages/ui already imports) must be enough to update it.
    - Proposed: a turbo task (`fonts`) ahead of `dev`, `build` and Storybook, writing to a gitignored
      directory, from the source font pinned in the lockfile, with fontTools pinned in the pipeline's uv
      lock. It shapes the slot strings with HarfBuzz to find the glyphs (so a font upgrade that renames or
      adds glyph forms is followed), then adds COLR/CPAL and renames the family.
    - Without the generated font (no Python on a machine running `pnpm dev`), pattern shapes fall back to the
      plain font: dotless letters, not faint ones.
    - A test checks the generated font: every slot glyph HarfBuzz produces has a colour record, and no
      mark does.
  - **Decided: every font the same way**, including sitelen pona, whose subset is committed today
    (packages/ui/src/fonts/sitelen-seli-kiwen).
    - Its subset earns its keep: the pinned source (commit 1658329, sha256 6646af72…) maps 2,519 code points
      with 3,732 glyphs, of which 183 are the UCSUR block. As WOFF2 the whole font is 634 KB; the subset is
      280 KB. `unicode-range` keeps it off other text but can't shrink the download, since a browser fetches
      the whole file.
    - Proposed: one font manifest. Each entry names its source (an `@fontsource` package from the lockfile,
      or a URL pinned by commit and sha256, as `nabu tables` pins Unihan and OpenCC), its steps (subset to
      code points with every layout feature kept, colour the slots, rename) and its licence for
      license-check. Fetched sources are cached; the README's pyftsubset command becomes sitelen pona's
      entry, and OFL.txt ships beside the output.
  - **Latin** (Arabizi; reading schemes such as SBL; Maltese, if ever): rendered 2026-11-19 (DejaVu Sans as a
    stand-in), C or ◌ as the slot, in text colour or at 6%.
    - **Decided: the dotted circle ◌ as the Latin slot** (ma◌◌a◌, ◌i◌͜◌ē◌), faded to 6% like every other slot.
      Latin doesn't join, so there's no tatweel.
    - **Decided: a doubled slot carries a tie**, U+035C COMBINING DOUBLE BREVE BELOW (◌a◌͜◌a◌), the Latin
      counterpart of shadda and dagesh: a mark, so it stays in the text colour. Without it, a doubled radical
      looks like two radicals.
    - **The build needs a fuller Latin source than the UI's:** none of the `@fontsource/noto-sans` subsets has
      U+035C, and only its Devanagari subset has U+25CC (checked 2026-11-19). The Latin pattern font comes
      from the full Noto Sans, pinned by URL and sha256 in the font manifest.
    - A pattern's reading (SBL) can then sit over its Hebrew shape as ruby: ◌ִ◌ֵּ◌ under CiC͜CēC.
    - Not digits (1a22a3): Arabizi uses digits as letters (2, 3, 5, 7, 9).
- **Decided: the tradition's names stay as labels.** مَفْعَل, piʿel, hifʿil are how grammars and dictionaries
  name the patterns, so a pattern is shown as its shape with its name: "مَ◌ْ◌َ◌ (مَفْعَل): place of …".
- **Decided: a placeholder string is display only.** The pattern's lexical form stores its slots
  abstractly, and the shape is a projection. Learners never type it: building a word from a pattern uses
  buttons, as vocalize-build does.
- **Decided: teaching order.** Two or three words first (مَكْتَب, مَلْعَب, مَطْبَخ), aligned; then the shape
  beneath them with its meaning; then cards that build (root into slots), extract (word to root) and decode
  ("what might مَدْخَل be?").
- **Cards:** root extraction ("what's the root of مكتوب?", the skill a learner needs for an Arabic or Hebrew
  dictionary), pattern meaning, building from base and pattern (كَتَبَ + مَفْعَل → مَكْتَب), changed tone,
  root families.
- **Settled since:** a root is not a morpheme or an object, its radicals a field of the base lexeme
  (lexeme-model.md, "No root object at all"); templates check the lexical form first (round 1).

## 10. Families

**Proposed:**
- **A family is a relation, not a morpheme or a credit.** It links words that share a base (*write*,
  *writer*, *writing*; *escribir*, *escritor*) or a root (كَتَبَ, كاتِب, كِتاب, مَكْتَب, مَكْتُوب), or a
  character (學生, 學校, 大學). Bauer & Nation's (1993) word families include inflected forms too; ours
  leave those to the paradigm.
- **Only the links are authored:** a morpheme names its base (*writer* ← *write* + *‑er*; مَكْتَب ← كَتَبَ +
  مَفْعَل), or a root where the language has no base (fa مدرسه). Families are computed from them.
- **Uses:** related words on a tap and grouping by root in the word list; derive cards; introducing a base
  before its derivatives; distractors that share a base.
- ***writer* has two senses** (Rappaport Hovav & Levin 1992):
  - the event reading (*the writer of this shopping list*) is *write* + *‑er*;
  - the occupation (*she's a writer*) is a morpheme, a homograph that tokens tell apart by sense.
- **Settled since:** families are computed from base links; no family object, no root links
  (lexeme-model.md, "No root object at all").

### Literal glosses: partial compositionality as a memory hint

**Decided:** a morpheme whose parts still show (زمین خوردن "fall", lit. "earth + eat") is a morpheme, and its
parts are a memory hint worth showing, in the glossary and wherever the morpheme is explained.

**Proposed:**
- **One mechanism for every morpheme with an analysis**, generated from it, never typed per morpheme:
  - compounds and idioms: "lit. earth + eat", 大學 "lit. big + learning", 東西 "lit. east + west";
  - derived words: *writer* (the occupation) "write + ‑er";
  - base and pattern: مَكْتَب "كَتَبَ 'write' + مَفْعَل 'place of'";
  - irregular forms: *ran* "past of *run*".

  An author may override the generated wording per support language where plain juxtaposition reads badly
  (`literal`, with provenance like any gloss).
- **Decided: only real parts, never a folk or nonsense etymology.** Never a hint from the characters of a
  phonetic loan: 沙發 "sofa" is not "sand + emit", 咖啡 and 巴士 have no parts. A hint exists only where
  the morpheme has a morphological analysis; no analysis, no hint.
  - Decided (round 3): an analysis that yields a hint cites its source (a dictionary or grammar, as courses cite
    references), or waits for a reviewer's sign-off. LLM drafting is this project's biggest source of
    folk etymologies.
  - Decided (round 3): hints are about a word's morphemes; a character's components only with a scholarly
    source of their own. Glyph stories (安 as "a woman under a roof") are a script-level claim, and mostly
    folklore.
  - Decided (round 3): hints are stored and presented apart from the gloss.
- **Where it shows:** the gloss panel on a tap, the word list, the feedback after a card, and the
  morpheme's first presentation.
  - Decided: never on the prompt side of a card. "earth + eat" would hand over the answer's parts.
  - Decided (round 3): always after the real gloss and labelled "lit.": a memory device, never presented as what
    the word means or as a window on how its speakers think.
- **Credit doesn't change:** knowing زمین خوردن still says nothing about زمین (§13). The hint links
  memories; it isn't evidence.
- **Order:** a hint works best when its parts are already known, so the planner may prefer to introduce a
  morpheme after its parts, as with derived words after their base (§6).

## 11. Learned

**Decided:** a morpheme is learned once all its properties are learned and every edge of its graph is
learned. Generalised (2026-11-19): **to have learned anything is to have learned every part of it that can't
be derived**: a lexeme all its listed morphemes, a rule every branch (lexeme-model.md, "What the learner
learns").

| Edge | Facet |
|---|---|
| Orthographic → gloss | recognize |
| Gloss → orthographic | produce |
| Phonemic → gloss | listen |
| Gloss → phonemic | speak |
| Orthographic → phonemic | read-script (reading aloud) |
| Phonemic → orthographic | write-script (spelling) |
| Orthographic → fully marked | vocalize (vocalize cards today) |

**Proposed refinements:**
- **Every edge that can be asked**, for this course and this learner: course facets, voice quality,
  `facetsOff` (as `skillsAsked` does now). lzh has no sound edges; a learner who turned listening off isn't
  held to it.
- **Only an unpredictable mapping is an edge to learn**, the morpheme rule applied to edges:
  - uz Latin ↔ Cyrillic is script knowledge (letter KCs), not per word;
  - es reading aloud is predictable, so it's no edge;
  - es spelling is an edge only where seseo, b/v or h leave it open (*vaca*, *casa*; hardly *mesa*);
  - fa and yue reading are per word.

  Edges are derived from the places a script leaves open (ADR 0139–0141) and the `soundAlike` sets (ADR
  0142), never listed by hand.
- **Properties need their own evidence.** *\*el casa*: the learner knows *casa* and agreement, but not its
  gender. *la casa* typed from the meaning is evidence; a word bank that gives the article isn't.
- **Predictable allomorphy is a rule with its own KC**, credited wherever it applies, not a property of each
  morpheme.
- **The machinery stays:** an edge is a card key (`kc|facet`, plus orthography for script facets) with its
  FSRS memory, shown by ADR 0100's later-day rule. New facets: vocalize, spelling where it's an edge,
  properties.
- **Open:** properties as facets (`casa|gender`), or as their own KCs linked to the morpheme. Proposed:
  facets.

## 12. Underspecification

**Decided:** one concept covers this: what one language specifies and the other leaves open. Aim for one
right answer per prompt. Some will still have several (word order and the like), but get as close to one as
possible.

| The learner writes | The prompt leaves open what the answer must say | The prompt says what the answer can't |
|---|---|---|
| The target language | **Tag the prompt** (Decided): one answer | Nothing to do: English "he" → lzh 其 |
| Their own language | **Accept every rendering** (Decided): tok *ona*, lzh's tense | Nothing to do: apc *kifik* → "how are you" |

- **Decided: when the answer can't say what the prompt does, nothing is tagged.** The learner is trusted
  to understand that lzh doesn't mark gender: no "(by the way, he's male)". The target morpheme's gloss
  already says what collapses (其: his, her, its, their). An answer that adds the gender with extra words
  (男子 "the man") translates back to another sentence, so ADR 0085 already rejects it.
- **Decided: dialect synonyms are specified.** Where a prompt's meaning has dialect synonyms (*carro* /
  *coche*, *guagua* / *autobús*), the prompt says which variety ("Cuban").

**Proposed:**
- **This amends ADR 0085, 0056 and 0075, and es's policy (ADR 0076–0077)**, so it needs a new ADR.
  - Today an untagged sentence accepts every form (kifak / kifik / kifkon; mish b3id / mish b3ide for an
    unnamed "it"), and es accepts pan-Hispanic words beside Cuban ones.
  - Under this rule, when the learner writes the target language, a feature it demands is tagged, and
    the accept set keeps only the forms that fit.
  - ADR 0085 still governs what a tag can't decide (word order, optional words, spelling variants) and
    everything the learner writes in their own language.
- **The features to tag are the inherent ones** (§4). Contextual ones (agreement, classifiers, structural
  case) are already fixed by the sentence. In our courses and planned ones:
  - the speaker's and addressee's gender and number (apc, hbo, es);
  - register (uz *sen* / *siz*, fa تو / شما, es *tú* / *usted*, Javanese);
  - dialect, where the meaning has dialect synonyms (es);
  - the gender of an unnamed "it" or "this" (apc);
  - aspect where English has one past tense (es *comí* / *comía*);
  - evidentiality (uz ‑ibdi beside ‑di, once the course teaches it);
  - later: clusivity (Indonesian *kita* / *kami*), Korean and Japanese honorifics.
- **Tag with the situation, not the grammar, where possible:** "a woman speaking", "to your grandmother",
  "it (the school)", "(every day)", "in Cuba". It reads naturally, carries meaning rather than
  metalanguage, and never shows the answer's form.
- **Dialect tags are derived, not authored.** A course states its variety once (es: Cuban). The compiler
  knows which lexemes have dialect synonyms (lexemes of one concept that differ in the dialect
  feature) and tags those prompts.
- **A dialect slip gets its own feedback.** *coche* where the prompt says Cuban: wrong, but the feedback
  says "that's the word in Spain; in Cuba, *carro*". It's a miss on the Cuban morpheme, not a typo or an
  unrelated word.
- **The compiler can enforce it.** An accept set for writing the target whose alternatives differ in an
  inherent form needs a tag that picks one, or a lint fires. That needs the alternatives analysed (through
  the lexicon, as `glossTokens` does); today only a sentence's own text is.

## 13. Chunks

**Proposed:**
- **A chunk is how we teach, not something the learner knows.** *Qayerdansiz?* or *¿Qué tú quieres?*,
  taught whole early on, are combinations, not morphemes. They present morphemes before the learner can
  analyse them. Credit goes only to the morphemes inside.
- **A non-compositional morpheme's parts get no credit.** Knowing 東西 says nothing about 東 "east". A tap
  shows the parts as a memory hint (§10).
- **Decided (2026-11-19): a chunk that is a lexeme credits nothing to its parts.** *¿Qué tal?* isn't
  derivable from *qué* + *tal*, so it is a morpheme of its own; meeting it is not meeting *qué* or *tal*. Its
  parts are links, and its literal hint opens once they're taught.
- **Decided (2026-11-19): a compositional chunk is just a combination**, treated exactly as any other
  sentence: *Qayerdansiz?* or *¿Cómo estás?* presents and credits its morphemes as any sentence does (ADR 0100).
  The condition on rules (shown only on items the learner can't have memorised it on, lexeme-model.md) is
  the same for every item met before, not a rule about chunks. "Chunk" is not a category of the model.

## 14. Wug tests

**Decided (the idea):** when teaching inflection or derivation, test it with made-up words (Berko 1958). A
real word may have been memorised; a made-up one can't have been, so a wug card credits only the rule and
the affix morpheme.

**Decided (round 3): as below, but not a primary concern.** A wug card comes last, confirming a rule already
shown on real words, and is treated as a bit of fun, an easter egg, never the main evidence.
- **Productivity is a property of a rule.** A pattern is a rule if speakers extend it to a wug; only
  productive rules get wug cards.
- **Generated at compile time, never at runtime.**
  - Take a real stem of the right class and swap its consonants for others of the same kind (for Semitic,
    a nonce root in a real pattern).
  - Check candidates against the course lexicon and a large word list (no real or obscene words).
  - Ship them as content with `generated` provenance, for review.
- **A rule that needs a listed property gets it on the card**, as a dictionary entry would (*φλόμος, ‑ου,
  ἡ*: the accusative plural?).
- **Both directions:**
  - wug (encoding): "This is a *bolaq*. Give it to the *bolaq*" → *bolaqqa*;
  - jabberwocky (decoding): "*Plabaste*: who did it, and when?"
- **Aimed at missing allomorphs:** a learner who has shown ‑ga but never ‑qa gets a wug ending in q.
- **Guardrails:**
  - always labelled as made up;
  - never in the word list, stories or gloss panels;
  - nonce nouns get pictures of made-up creatures (our own CC0 drawings).
- **Which courses:** uz, fa, es, apc, hbo, grc, chg. Not yue, lzh or tok (almost no inflection).

## 15. Data model changes, roughly

All Proposed:
- `sense:` → morpheme; `form:` → forms plus affix morphemes. Open: rename the ids (`morpheme:`, `form:`) once,
  early, with a fold migration for logged events, or keep the ids and change only the docs.
- Morpheme fields:
  - class, attachment (with position for dependents), inflectional or derivational;
  - head and form (irregular morphemes);
  - base or root (derived morphemes);
  - properties;
  - per orthography, how it attaches.
- Tokens: a morpheme with an optional derivational analysis, plus inflectional morphs; morphs anchored on
  tiers, with templates as shorthand; `pos` per token (conversion).
- Rules as data, with productivity. The compiler checks derivations, and an underivable form must be a
  morpheme (a new lint, with a fixture).
- Facets derived per morpheme from course, profile and scheme data; new facets for vocalize, spelling where
  open, and properties.
- Grader: overregularisation (the form right, the morpheme missed); wrong register is WRONG_WORD.
- Prompt tags for every inherent feature the target demands (extending `persons`), and a lint for
  accept sets that differ in one untagged (§12); a dialect-slip verdict.

## 16. Open questions

Consolidated 2026-11-19, in the current terms (concept > lexeme > morpheme > allomorph).

**The core model**
1. The base-case rule with whole-or-partial scoped replacement (lexeme-model.md): decided? With noun gender as
   derivation (so *padre* / *madre* are two lexemes), and *niño* / *niña* then *niño* + a derivational feminine?
2. The three layers: entities (stored), values (combinations, computed), instances (utterances).
3. How a lexical feature is learned (*casa* is feminine): a facet of the lexeme (`casa|gender`), or a KC of its
   own?
4. "Every part introduced so far" as the scope of "learned", with a lexeme going back to learning when a new
   part arrives.
5. Conversion (uz *yaxshi* "good" / "well"): one lexeme with part of speech per token, or two?
6. A Semitic root: what is its sense, and is it a lexeme, a morpheme, or a relation? Which tier do templates
   check first?
7. "Family", or only the links base and root?
8. Do rules take lexical features as input (verb class)? Do grapheme tables count as rules?
9. Does meeting a chunk count as meeting the morphemes inside it?
10. Merge all the way up: UD dependency trees and ordering rules added one at a time?

**Per language**
11. The uz causative (‑t, ‑tir, ‑dir): a paradigm dimension or derivation?
12. Spanish stem-changing verbs: a class on the lexeme plus a rule, or listed stems?
13. yue 嘅: one linker or two, and the course's attributive tokens glossed as possessive.
14. fa's register: formal written, colloquial Tehrani, or both, colloquial first?
15. Javanese, when it comes: krama or ngoko first?
16. The invented lexical-form schemas: apc's, hbo's extension, stress in fa and uz, uz's base script.

**Answers so far (the owner, 2026-11-19, through the questions page)**
- Decided: the three layers (2).
- Decided: a lexical feature is a skill of its lexeme (`casa|gender`), counted in its "learned" (3).
- Decided: "learned" means every part the course will ever teach (4), and scheduling should favour learning
  whole lexemes: once a lexeme is started, its other parts come soon.
- Decided: pattern templates check against the lexical form first (7), plus cards for bound morphemes that test
  building combinations from them.
- Decided: closed classes are taught early (10), which leaves chunks less to do; the chunk question itself
  stays open.
- Decided: Merge all the way up: the architecture now, coverage one rule at a time (11).
- Decided: Spanish stem-changing verbs are a class on the lexeme plus a rule (13).
- Decided: yue 嘅 is one linker; fix its gloss and drop `Poss=Yes` (14).
- Decided: fa teaches both registers, formal first (15).
- Decided: Javanese teaches ngoko and krama from the start (16).
- Decided: the apc lexical-form schema comes first (17).
- Decided: rename the KC ids once, now, with a migration in the fold (18).
- Decided: several smaller ADRs: the model; learned; underspecification; pattern display; fonts (19).
- Decided: 1, option one, on native evidence (a native apc speaker the owner consulted, 2026-11-19): خال
  *khāl* "maternal uncle" and خالة *khāle* "maternal aunt" are one word, one derived from the other, while ام
  *imm* "mother" and بي *bayy* "father" are clearly two. So feminine marking on nouns is derivation: *khāle* is
  *khāl* + the feminine, a combination with nothing new to learn, and suppletive pairs are separate lexemes.
  Inflection would have made *imm* a form of BAYY under the base-case rule. Gender on adjectives (*kbīr* /
  *kbīre*) is still inflection: agreement. A derived feminine with a sense of its own (if *khāle* is also a
  polite address to any older woman) is listed as its own morpheme.
- Decided: 5, one lexeme. Uzbek uses adjectives as manner adverbs freely (*yaxshi oʻqiydi* "studies well"),
  so *yaxshi* is one lexeme; part of speech goes on the lexeme as the language has it. A principle (the
  owner): never insert a category distinction the language doesn't make; that is Anglicization.
- Decided: 12, derivation. The Uzbek causative suffixes derive verbs: a causative with a drifted meaning
  (*oʻqit‑* "teach") is its own lexeme, a transparent one a combination.
- Decided with 4: a lexeme's progress is shown (*ser*: 5 of 9 forms), since a lexeme is learned only once every
  part the course teaches is shown.
- Decided: 6 and 7 together. A root is neither a morpheme nor an object: its radicals are a field of a base
  lexeme's lexical form, and a derivative's parts are its base lexeme and its pattern (مَكْتَب ← كَتَبَ +
  مَفْعَل). Families are computed from base links, so there is no family object either (lexeme-model.md, "No
  root object at all").
- Decided: 8 (lexeme-model.md, "What rules read"): rules read lexical features (a class covers at least two
  lexemes; nothing the form gives); projections are rules; learners do the script first except in a
  logography; the rules are what the profile states, built and landed in one go (a definition of done there).
- Decided: 9 (§13): a chunk that is a lexeme credits nothing to its parts; a compositional one is a
  combination like any sentence.

**Answers, round 2 (the owner, 2026-11-19, through the second questions page)**
- Decided: which feature values are lexemes, as proposed (a meaningful value merged as a head; not a class
  value; agreement and government merge no head).
- Decided: lexemes have an inherent part of speech; Merge fills the result's features by underspecification,
  never by hierarchy or "strength". Proposed: the selecting constituent wins where both specify.
- Decided: apc's participle (شايف) is a combination of its verb and the participle pattern's lexeme.
- Decided: the miss labels and their outcome as proposed; another word always counts against the target's
  recall; marks that carry sound are strict in es and grc alike.
- Decided: strict script first, by orthography; a learner who won't learn a script takes another orthography.
- Decided: projection code is allowed but lives with the language's data, checked against the profile; all
  transformations as pure, reversible data is a standing goal.
- Decided: uz's lexical form is Latin-based, with conventions on the Latin from which the Cyrillic is derived
  (Russian loans: цирк / *sirk*). uz Cyrillic stays as the proof of concept for a language in two scripts.
- Decided: ADRs next. No fixes to the old architecture (the yue 嘅 fix waits for the new lexicon).
- Still open: inflection and derivation as kinds of head (the owner is unsure; back to it last).

**Answers, round 3 (the owner, 2026-11-19)**
- Decided: where both constituents specify a feature, the selecting one wins (that is all a head is).
- Decided: gaps, as proposed (conditions explain most; only an arbitrary gap is listed, as a form with no word).
- Decided: *caza* for "house" is a phonemic hit with an orthographic and a lexical miss: the learner knows how
  the word sounds. Proposed: the lexical miss counts against telling the pair apart.
- Decided: glosses are built; both the support language's form ("ran") and the analysis ("run (past)") shown.
- Decided: literal hints cite a source or wait for sign-off; a character's components only with a scholarly
  source; after the gloss, labelled "lit.", stored and shown apart from it.
- Decided: wug tests as proposed, but last and light: a confirmation after real words, an easter egg.
- Decided: slots come up to a visible grey under `prefers-contrast: more`; no per-device slot setting.
- Still open: inflection and derivation as kinds of head; the owner asked for a full explainer (examples,
  implications, mockups).

**Answers, round 4 (the owner, 2026-11-19, after the explainer "Inflection or Derivation?")**
- Decided: option A. Two kinds of head, decided by the language's dimensions (declared per language, one
  list per category); apc's participle is a value of an aspect dimension (inflection); a form may be
  several tokens ("we don't give a crap about words for the purposes of learning").
- Decided: a computed derivative is not a learning item; "lexeme" means what is stored.
- Decided: progress counts listed parts (a regular verb: itself, 1 of 1).
- Decided: *caza* for *casa*: the lexical miss counts against telling the pair apart; a spelling-choice card.
- Decided: the infinitive head (INF) is a lexeme, as PAST is; the form *hablar* is HABLAR + INF.
- Decided: what counts as shown for each part (ADR 0100's rule per part; "can't have memorised" is never
  shown in that form; a rule's branch on two lexemes); finding irregular forms by the Elsewhere lookup, a tie
  an authoring error unless marked free variants; order rules once per language, inside words first, only
  accepting and checking, the authored text always the one shown.
- Nothing of the model is open now but a derived view of a concept's lexemes (lexeme-model.md, proposed).

**Answers, round 5 (the owner, 2026-11-20, after [the review](review-adr-0145-0151.md) of ADRs 0145–0151,
through its questions page)**
- Decided: a slip is any edit within today's typo budget, and it is asked first. It is accepted unless it
  gives a spelling the sound also allows (✗*havlar*), a form of another lexeme (*cada*) or a changed mark that
  carries sound. The sound question and the whose-form question are asked only of what a slip doesn't explain.
- Decided: the device reads the profile's rules. A profile's correspondences are executable data the grader
  runs ("can this typed spelling be read as the target's sound?"); the compiler puts each accepted answer's
  phonemic form in the bundle; every profile states its rules so before ADR 0148 lands; the voices keep their
  Python.
- Decided: a form has one of three statuses. Given by a stated rule. Derivable, pinned for now: the language
  has a rule we haven't written, so the form is stored and checked like a listed one, is never a learner's
  part, and is reported as rule debt. Listed: the language has no rule, so it is a part. Only a reviewed
  statement makes a form listed.
- Decided: classes are stated per language and reviewed, as each profile states its projections. This
  replaces "a class must cover at least two lexemes" (round 1, 8).
- Decided: "never seen in that form" stands (round 4), and is logged: each card records the words it
  displayed, as lexeme and form, a story the lines read, and the fold keeps the pairs seen. Nothing logged
  before the change counts towards a rule.
- Decided: a typed building card may ask a regular form the course never writes (*cantamos*); a choice never
  (ADR 0132 stands there).
- Decided: gender by ending is a default where the language has one. *casa* is 1 of 1; a noun the default
  misses or that breaks it has a gender part (*la mano*, *el día*, *la noche*); the default is itself a rule;
  the same in hbo, apc and grc. This narrows round 1's `casa|gender` (3).
- Decided: hbo keeps the narrative form and the plain one, untagged. ADR 0147's lint lets a difference be when
  the answer's own order forces it, or when it is a contrast only a context decides; each language marks
  those contrasts; the contrast is asked on story lines; ADR 0085's answers stay.
- Decided: apc's participle pattern carries two heads: the participle, a value of aspect as ruled in rounds 2
  and 4, and the agentive noun, a function head, whose result is a lexeme where its plural or its vowels are
  listed (*m3allem*). A token names which.
- Decided: letters after the gate are assumed, and watched. No schedule per letter; the fold counts labelled
  misses per correspondence; one that keeps coming back reopens that part of the track.
- Decided: under a variety tag ("in Cuba") a general word is wrong unless that variety's speakers say it too,
  which a Cuban speaker's review marks; its feedback says "the general word", never "Spain's".
- Decided: Greek's missing accents and breathings stay a note until the app has its own way to put the marks
  on (buttons, as vowel marks have); then they are wrong, as es's are at once.
- Decided, about the work: the review goes to main; its fixes that need no ruling are drafted, one commit per
  file; no second independent read of the notes.
- The owner took the reviewer's pick on all fifteen, with no notes. The ADRs were revised from these answers
  on 2026-11-20. Each lists at its end what the owner decided, what was restored from these notes, and what
  the revision proposes beyond that, which is not the owner's until the ADR is accepted.
- The notes above keep their earlier wording where an answer or a correction changed it: the *tener* example,
  `casa|gender`, the count of two for a class, the slip as "keyboard or IME neighbours, a transposition", the
  dotted circle as Hebrew's slot, and 生 in 學生 (it is *saang1* there; *sang1* is 醫生's). The ADRs are current.

**Answers, round 6 (the owner, 2026-11-20, on what the revision had proposed: part on its questions page,
part asked in the session, once forty-five rows proved too many)**
- Decided: any form of the answer's own lexeme stops a slip, so the lexicon does what contrast sets and the
  course's word list do today (as drafted). Run on fifteen such slips in es, uz and apc, today's graders
  already refuse all fifteen.
- Decided: chg's typed readings split their consonant marks by sound. š, ž, ḫ and ǧ are required, as the
  vowels' marks are; the rest stay noted. Amends ADR 0134. Against the draft, which left ADR 0134 standing.
- Decided: a story asks a contrast only a context decides by a third kind of question, which use, beside
  which word and which form. Against the draft, which widened which form.
- Decided: a drafted statement that a form is listed counts until it is signed off, as every REVIEW policy
  does.
- Decided: Latin orthographies don't gate. The gate is for a script a learner can't read, and Spanish
  spelling is taught inside the course, as rules and leftovers. A reading typed in Latin gates nothing
  either (Jyutping, lzh's typed traditions, tok's Latin for sitelen pona). Against the draft, which left a
  Latin track's card open and made the gate wait on it. This takes back part of round 2: "script" means
  letters again.
- Decided: "let's just use UD tags". A lexeme's part of speech is written as its UD tag; no category system
  is declared per language. Against the draft's categories with subclasses and UD as a mapping. Read as
  leaving the principle standing: no distinction is inserted that a language doesn't make.
- Decided: agreement and government are written as a token's UD head and relation, on the tokens where they
  matter, from the migration on. Against the draft's links of our own.
- Decided: `reading:`, `phone:` and `tone:` leave the schema.
- Decided: a made-up word is checked against the course's own words, and that is enough, so every course can
  have wug cards. Against the draft's "no word list, no wug cards" (which had also named hbo wrongly: the
  Codex is a closed corpus).
- Not now: marking a dimension as social, so that its misses get a scope's feedback.
- Accepted with the ADRs, as drafted: the revision's other thirty proposals. The owner asked whether they
  would differ on any; three were put to them (the links, the wug check, the unused kinds) and are above.
  Each ADR lists what was accepted as drafted and what was decided against the draft.
- All seven ADRs are Accepted (2026-11-20).
- Not answered: where the revision lives (it is on the branch `ccr-aebe970e-q9o4q4`), whether the explainer
  and lexeme-model.md are brought up to date (both still show the first version), which task comes next, and
  a grammar of Spanish for the library (ADR 0146's Spanish classes are from memory, REVIEW).

**For later (not started; the owner, 2026-11-19)**
- How do we teach syntax?

**Housekeeping**
17. Rename the KC ids (`sense:`, `form:` → lexemes, morphemes, features), with a migration for logged events.
18. Turn the decided parts into a Proposed ADR, or several. Done 2026-11-19: ADRs 0145–0151 (Proposed).
    Reviewed and revised 2026-11-20 (round 5); accepted 2026-11-20 (round 6).

## References

- Aronoff, M. (1976). *Word Formation in Generative Grammar*. Blocking.
- Bauer, L. & Nation, P. (1993). Word families. *International Journal of Lexicography* 6(4).
- Berko, J. (1958). The child's learning of English morphology. *Word* 14.
- Booij, G. (1996). Inherent versus contextual inflection and the split morphology hypothesis. *Yearbook of
  Morphology 1995*.
- Comrie, B., Haspelmath, M. & Bickel, B. (2008). *The Leipzig Glossing Rules*.
- Cruse, D. A. (1986). *Lexical Semantics*. Lexical units.
- Di Sciullo, A. M. & Williams, E. (1987). *On the Definition of Word*. Listemes.
- Kiparsky, P. (1973). "Elsewhere" in phonology. In *A Festschrift for Morris Halle*.
- Pinker, S. (1999). *Words and Rules*.
- Rappaport Hovav, M. & Levin, B. (1992). ‑er nominals: implications for the theory of argument structure.
  *Syntax and Semantics* 26.
- Roediger, H. L. & Marsh, E. J. (2005). The positive and negative consequences of multiple-choice testing.
  *JEP: Learning, Memory, and Cognition* 31(5).
