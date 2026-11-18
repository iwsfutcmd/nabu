# Lexemes: what Nabu teaches (brainstorm)

- Status: brainstorm, 2026-11-18. Not an ADR: questions are still open (§15).
- **Decided** marks the owner's decisions; **Proposed**, suggestions not yet agreed; **Open**, what awaits a
  decision.

## 1. Why: the word is an orthographic unit

The app teaches "words", and a word is where a script puts its spaces: a fact about an orthography, not a
language. yue and lzh have no spaces; sitelen pona runs words together; chg joins suffixes but writes the
copula after a ZWNJ; Hebrew writes וְ joined; Persian را is a clitic written apart, and ‑ها is joined
through a ZWNJ; apc's Arabic and Arabizi need not agree on where a word ends. A script-first app should
teach a unit of the language: the **lexeme** (§2).

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
- The lexeme isn't what is "known": ADR 0100 knows words.
- Lexemes have no class or attachment.
- Nothing records evidence for individual allomorphs.
- Exponents that aren't one contiguous span can't be represented.

## 2. Terms

| Term | Meaning | Examples | Status |
|---|---|---|---|
| **lexeme** | The unit a learner learns: a form–sense pairing that can't be derived from rules (§3), in any class and attachment | *kitob*, ‑dan, 呀, را, *ran*, *tuv-*, 東西, *darse cuenta* | Decided (term and rule) |
| **lemma** | A lexeme's citation form, the one word cards show | *ichmoq*, خوردن, *ran* | As now |
| **allomorph** | A conditioned variant, predictable from context: teach the rule | ‑ga / ‑ka / ‑qa, וְ / וָ | Proposed |
| **variant** | A free variant, systematic (spelling, pronunciation): accept it | HK / TW characters; apc ـه / ـو; seseo | Proposed |
| **morph** | A lexeme's realisation in one token: its exponent, anchored on tiers (§9) | *dan* in *Samarqanddanman*; the ezafe's kasra | Proposed |
| **cell** | A feature bundle the learner chooses, possibly with no exponent | PST, PRET.3SG, ACC.PL, uz COP.3SG | Proposed |
| **rule** | A pattern stated without naming any lexeme, with its own KC | ‑ga → ‑qa after q; the e→ie pattern | Proposed |
| **paradigm** | Lexemes whose senses share a lexical meaning, differing in features: a head plus cells | *run*; *ran* = run.PST | Proposed |
| **family** | Words linked by a shared base or root (derivation, compounding) | *write*, *writer*; ك‑ت‑ب: كاتب, مكتب | Open (§10) |
| **property** | A lexical fact about a lexeme, with its own evidence | *casa*: feminine; *pensar*: e→ie | Proposed |
| **facet** (the skill on an edge) | An edge of the lexeme's graph (§11). The code already calls a skill a facet | recognize, produce, listen, read-script | As now, extended |
| **construction** | A syntactic pattern with slots | apc *used-to*, *was-doing* | As now |
| **token** | An orthographic word, per orthography | | As now |
| **word** | UI copy only | | Proposed |

- **Rejected:**
  - "morpheme" (*ran*, 東西 and zeros don't fit);
  - "listeme" (Di Sciullo & Williams 1987: precise, but lame-sounding);
  - "aspect" for properties (it collides with verbal aspect).
- **Our "lexeme" departs from the textbook one twice.**
  - The departures: suppletive and irregular forms are their own lexemes, and affixes and clitics are
    lexemes.
  - The defence: Pinker's *Words and Rules* (1999), where irregular forms are stored whole and regular ones
    are built by rule. We model the learner's mental lexicon, not the grammar's paradigm.
  - What to write down: UD's `LEMMA` and lemmatisers (hazm, Stanza) mean the textbook lexeme. The
    definition goes in the glossary and the ADR, with "paradigm" for the textbook notion.

## 3. The lexeme rule

**Decided:** if something can be derived purely from rules, it is the same lexeme or a combination of
lexemes. If it can't, it is a separate lexeme. This is Aronoff's blocking (1976) and Kiparsky's Elsewhere
Condition (1973): rules produce the regular cases, and a listed form takes precedence where one exists
(*ran* blocks *\*runned*, *thief* blocks *\*stealer*).

**Decided consequences:**
- *run* and *ran* are separate lexemes. Suppletive and irregular forms split.
- A non-compositional combination is a lexeme: 東西 "thing", *darse cuenta*, *jan pona*.
- *carro* and *coche* are separate lexemes.

**Proposed clarifications:**
1. **Both form and meaning have to follow.**
   - *ran*: the meaning follows (run.PST) but the form doesn't, so it's a lexeme.
   - *writer* as an occupation: the form follows but the meaning doesn't, so it's a lexeme.
   - *the writer of the list*: both follow, so it's *write* + *‑er*.
2. **Rules may take a lexeme's listed properties as input** (gender, class). Otherwise every stem-changing
   verb form would be a lexeme.
3. **A rule is stated without naming a lexeme.** A rule with exceptions is a rule plus lexemes that block
   it. A table counts as a rule when it is about graphemes and applies to every word containing them
   (OpenCC's 裏 / 裡).
4. **Derivability is judged against the language's rules, not the learner's progress.** *kitoblar* is
   *kitob* + *‑lar* even before ‑lar is taught; until then it is taught as a chunk (§12).
5. **Split stems, not words, where the irregularity is in the stem:**
   - es *tuv-* (tuve, tuviste, tuvo…);
   - grc *εἶδ-*, the aorist of ὁράω;
   - fa present stems رو and بین;
   - apc broken plurals (walad / wlad).

   Forms that can't usefully be split are whole-word lexemes (*soy*, *eres*, *fue*).
6. **Decided: lexemehood is symmetric.** What can't be derived in both directions is a lexeme, never a
   lexeme for one direction only:
   - collocations and Persian compound verbs (فکر کردن "think", lit. "thought + do"), which can be decoded
     but not encoded;
   - idioms (زمین خوردن "fall", lit. "earth + eat");
   - derived words that can be decoded but not encoded (學生 "student", *escritor*, *writer* the
     occupation), and opaque ones (*cooker*, *drawer*, 大學 "university", كِتاب).

   Only what is regular both ways is a combination (*rápido* → *rápidamente*; *the writer of X*).
   - A lexeme keeps its links to its parts (base, root: §10), so a derive card still credits the affix when
     a learner works out a transparent word.
   - If cards on an edge the parts already give away (recognizing *writer*) prove wasteful, handle it at
     the edge (§11), never by splitting lexemehood by direction.

7. **Rules are data, and the compiler checks every claimed derivation.**
   - A token analysed as a combination must derive from the rules, or the compiler reports it.
   - A form that can't be derived must be a lexeme (a lint, much as `kc.inflected-form` enforces lemmas now).

## 4. Senses and features

**Decided:**
- One lexeme, one sense.
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
  - Grey zone: yue 嘅 (possessive, nominaliser, assertive particle).
- **Grammatical lexemes are identified by UD features** (`Case=Abl`), language-neutral; learner glosses stay
  per support language.
- **Inherent vs contextual features (Booij 1996)** matter to the grader:
  - Inherent ones add meaning (tense, nominal number). Where the prompt doesn't decide them, they're the
    learner's choice (ADR 0085).
  - Contextual ones are forced by the syntax (agreement, structural case), so they're right or wrong given
    the sentence. *el* / *la* are separate lexemes differing only in a contextual feature.
- **Register is decided by the prompt's situation.** The prompt tags it (extending `persons`), a wrong
  register is WRONG_WORD, and every level is exercised (ADR 0075). This is how CLAUDE.md already expects
  register to arrive.
- **Dialect is a feature the learner chooses** (ADR 0085), as es does now: Cuban forms taught, pan-Hispanic
  ones accepted.
  - It splits senses: *carro* is "car" in the Americas and "cart" in Spain; *guagua* is "bus" in Cuba and
    "baby" in the Andes.
  - Dialect also produces variants within one lexeme where the difference is systematic (seseo, *ehto*).
- **Conversion** (uz *yaxshi* "good", adjective, and "well", adverb): one sense, with `pos` on each token
  rather than only on the KC (Open).

### Javanese, for when we write it

- **Two dimensions of register:**
  - *speech level*, set by the addressee: ngoko or krama;
  - *honorifics*, set by the referent: krama inggil raises a respected person's actions and possessions
    (even within ngoko: *ngoko alus*); krama andhap lowers one's own actions towards them (*matur*).

  Korean and Japanese split the same way.
- **Register lexemes form paradigms:** mangan / nedha / dhahar "eat", omah / griya / dalem "house", kowe /
  sampeyan / panjenengan "you".
  - Most words have no krama form: the ngoko form is the head, and krama lexemes exist only where the
    language has them.
  - Affixes have register pairs too: ‑e / ‑ipun, di‑ / dipun‑, ‑ake / ‑aken.
- **Prompts tag social relations** ("to your grandmother", "about your teacher"). English can't carry
  register, so the tag is the only signal in English → Javanese.
  - Every sentence probably carries a tag: today an untagged sentence accepts every form.
- **Questions that differ in register only:** "which would you say to your grandmother?"
- **Script:** aksara Jawa beside Latin, with *pasangan* stacking below the line.
- **Open:** krama or ngoko first.

## 5. Classifying lexemes

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
- **The distinction should change behaviour**, or it's just a label: which cards a lexeme gets, what
  "learned" means for it, where its distractors come from, and how it's first presented.
- **Grammatical lexemes are known by use, not by gloss recall.**
  - "What does ‑dan mean?" is a bad card.
  - The evidence comes from choosing the form, producing it, and choosing the allomorph.

## 6. Inflection and derivation

**Proposed:**
- **Inflection never makes a lexeme.** Derivation makes one wherever its result can't be derived in
  both directions (§3.6). ADR 0061's "lemmas, never inflected words" already means "remove the inflection, keep
  the derivation".
- **Two levels in a token.** Today `morphs` is a flat list: *oʻqituvchilar* is either *oʻqituvchi* + ‑lar or
  *oʻqi* + ‑t + ‑uvchi + ‑lar, never both. We want a lexeme with an optional derivational analysis, plus
  its inflections: a tap shows both levels.
- **Credit differs.**
  - Each use of an inflection is evidence for it.
  - A derived word got right is weak evidence for its affix (it may have been memorised). The test for a
    derivational affix is generalisation: derive cards and wug tests (§13).
- **Cards and distractors differ.**
  - Inflection: "which form" (ADR 0132), allomorph choice, paradigms; distractors are other cells.
  - Derivation: derive and interpret cards, word families, building from tiles; distractors are other
    derivatives of the same base (*yozuv*, *yozuvchi*, *yozma*).
- **Order of introduction differs.**
  - A derived word is taught whole first; its affix becomes a target once two or three words carrying it
    are known.
  - Inflection can be taught head-on.
- **The grader already sides with inflection.** Contrast sets (ADR 0066, 0081) are inflectional; a
  derivational slip lands on another lexeme, which the lexicon check (WRONG_WORD) catches.
- **The grey zone needs a policy before annotating:** uz causative ‑t / ‑dir, Hebrew binyanim (hbo already
  treats each stem as a lexeme), Spanish ‑ito, participles and infinitives.
  - The test: does it fill a cell of the lexeme's paradigm, or make a word with its own entry?
  - When unsure, call it derivation.
  - Open: uz causative (*oʻqit-* "teach" beside *oʻqi-* "read").
- **Families** (§10) link derived words whether or not they are lexemes.

## 7. Paradigms, cells and irregular forms

**Proposed:**
- **`form:` splits.** Some `form:` KCs are cells (es `form:pret-3s`, grc `form:f-acc`, hbo
  `form:wayyiqtol-3ms`); others are affix lexemes (`form:abl-dan`).
- **Choosing a cell and realising it are credited apart.**
  - A cell is credited when the learner chooses it.
  - An exponent is credited for the form: ‑ed in *walked*, the lexeme *ran*, the stem *tuv-*.
  - An irregular lexeme points at its head and names its cell (`head: run, cell: PST`).
- **Zero morphemes disappear.** A zero is a cell with no exponent (uz COP.3SG).
- **The grader can recognise overregularisation.** *\*tenió*, *\*runned*: the right cell, the rule's
  output, blocked by a lexeme. Credit the cell, count a miss on the lexeme, and say "right tense, irregular
  verb".
- **Never use regularised non-words as distractors.** Showing them risks teaching the error (Roediger &
  Marsh 2005).
- **Lexical classes.** A form is regular if it's predictable from the lemma plus a class recorded on the
  lemma.
  - Mark the class where it has many members; list the forms as lexemes where it has a handful.
  - This is the principal-parts tradition.
  - Open: Spanish stem-changers and Persian present stems are the test cases.

## 8. What a lexeme has

**Decided:** these representations, each with variants (conditioned by context, or free; mostly in
spelling):
- a normal orthographic form;
- a fully marked orthographic form (vocalised, pointed), which may be the same;
- a phonemic form;
- a gloss.

**Proposed:**
- **Tokens stay the authority for surfaces.** A lexeme holds its citation forms; the compiler collects the
  attested allomorphs from annotated tokens, as it collects readings now (ADR 0117, 0135). Hebrew stems
  change their pointing (דָּבָר, דְּבַר, דְּבָרִים), so a fully marked form on the lexeme can only be a
  citation.
- **The phonemic form is the readings per scheme**, lexical (before sandhi). The surface pronunciation
  stays on the token (`ipa`). Readings are transcription schemes, and lzh has three traditions. No
  underlying forms (//‑GA//).
- **grc's `attic` reading** (Greek letters with length marks) arguably belongs in the fully marked slot,
  not the phonemic one. Russian stress marks would too.

## 9. Exponents that don't tile

**Decided:** roots and morphemes without segments must be modelled ("roots don't tile: skill issue"), with
a new design language.

**Proposed:**
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
  | uz third-person copula | — (a cell, not a morph) | — | — |
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
- **Cards:** root extraction ("what's the root of مكتوب?", the skill a learner needs for an Arabic or Hebrew
  dictionary), pattern meaning, building from root and pattern (ك ت ب + مَفْعَل → مَكْتَب), changed tone,
  root families.
- **Open:**
  - What is a root's sense? Its meaning is a semantic field; proposed: a lexeme with a weaker identity,
    known through extraction and family cards, never recall.
  - Which tier do templates check first? Proposed: the fully marked orthography, with readings checked
    against it; Arabizi, which spells its vowels, gets its own template.

## 10. Families

**Proposed:**
- **A family is a relation, not a lexeme or a credit.** It links words that share a base (*write*,
  *writer*, *writing*; *escribir*, *escritor*) or a root (كَتَبَ, كاتِب, كِتاب, مَكْتَب, مَكْتُوب), or a
  character (學生, 學校, 大學). Bauer & Nation's (1993) word families include inflected forms too; ours
  leave those to the paradigm.
- **Only the links are authored:** a lexeme names its base (*writer* ← *write* + *‑er*) or its root
  (مَكْتَب ← ك‑ت‑ب + مَفْعَل). Families are computed from them.
- **Uses:** related words on a tap and grouping by root in the word list; derive cards; introducing a base
  before its derivatives; distractors that share a base.
- ***writer* has two senses** (Rappaport Hovav & Levin 1992):
  - the event reading (*the writer of this shopping list*) is *write* + *‑er*;
  - the occupation (*she's a writer*) is a lexeme, a homograph that tokens tell apart by sense.
- **Open:** keep the term "family", or speak only of the two links, base and root.

## 11. Learned

**Decided:** a lexeme is learned once all its properties are learned and every edge of its graph is
learned.

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
- **Only an unpredictable mapping is an edge to learn**, the lexeme rule applied to edges:
  - uz Latin ↔ Cyrillic is script knowledge (letter KCs), not per word;
  - es reading aloud is predictable, so it's no edge;
  - es spelling is an edge only where seseo, b/v or h leave it open (*vaca*, *casa*; hardly *mesa*);
  - fa and yue reading are per word.

  Edges are derived from the places a script leaves open (ADR 0139–0141) and the `soundAlike` sets (ADR
  0142), never listed by hand.
- **Properties need their own evidence.** *\*el casa*: the learner knows *casa* and agreement, but not its
  gender. *la casa* typed from the meaning is evidence; a word bank that gives the article isn't.
- **Predictable allomorphy is a rule with its own KC**, credited wherever it applies, not a property of each
  lexeme.
- **The machinery stays:** an edge is a card key (`kc|facet`, plus orthography for script facets) with its
  FSRS memory, shown by ADR 0100's later-day rule. New facets: vocalize, spelling where it's an edge,
  properties.
- **Open:** properties as facets (`casa|gender`), or as their own KCs linked to the lexeme. Proposed:
  facets.

## 12. Chunks

**Proposed:**
- **A chunk is how we teach, not something the learner knows.** *Qayerdansiz?* or *¿Qué tú quieres?*,
  taught whole early on, are combinations, not lexemes. They present lexemes before the learner can
  analyse them. Credit goes only to the lexemes inside.
- **A non-compositional lexeme's parts get no credit.** Knowing 東西 says nothing about 東 "east". A tap
  may show the parts as etymology.
- **Open:** does meeting a chunk count as meeting the lexemes inside it, before they're introduced?

## 13. Wug tests

**Decided (the idea):** when teaching inflection or derivation, test it with made-up words (Berko 1958). A
real word may have been memorised; a made-up one can't have been, so a wug card credits only the rule and
the affix lexeme.

**Proposed:**
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

## 14. Data model changes, roughly

All Proposed:
- `sense:` → lexeme; `form:` → cells plus affix lexemes. Open: rename the ids (`lexeme:`, `cell:`) once,
  early, with a fold migration for logged events, or keep the ids and change only the docs.
- Lexeme fields:
  - class, attachment (with position for dependents), inflectional or derivational;
  - head and cell (irregular lexemes);
  - base or root (derived lexemes);
  - properties;
  - per orthography, how it attaches.
- Tokens: a lexeme with an optional derivational analysis, plus inflectional morphs; morphs anchored on
  tiers, with templates as shorthand; `pos` per token (conversion).
- Rules as data, with productivity. The compiler checks derivations, and an underivable form must be a
  lexeme (a new lint, with a fixture).
- Facets derived per lexeme from course, profile and scheme data; new facets for vocalize, spelling where
  open, and properties.
- Grader: overregularisation (the cell right, the lexeme missed); wrong register is WRONG_WORD.
- Prompt tags for register (extending `persons`).

## 15. Open questions

1. Rename the KC ids (`lexeme:`, `cell:`) now, or keep them?
2. Do rules take listed properties as input (§3.2)? Do grapheme tables count as rules (§3.3)?
3. Where is the line for Spanish stem-changers and Persian present stems (§7)?
4. Is the uz causative a cell or a derivation (§6)?
5. Conversion: one sense with `pos` per token, or two senses (§4)?
6. Dialect as a feature the learner chooses (§4)?
7. What is a root's sense, and which tier do templates check first (§9)?
8. Keep "family", or only the links base and root (§10)?
9. Properties: facets or their own KCs (§11)?
10. Does a chunk count as meeting its lexemes (§12)?
11. Javanese: krama or ngoko first (§4)?

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
