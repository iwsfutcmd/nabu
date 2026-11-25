# Rules in a lexicon: Persian (fa), as built

- Status: built 2026-11-25 on its own branch, stages 1 to 4 of [docs/rules-design.md](../rules-design.md) for fa.
  Every branch, form and statement is REVIEW. Nothing a learner reads changed: no token's text, spelling, lemma,
  vocalization, accept set or clip. What did change for learners is under "What a learner sees".
- Source: Yousef, *Persian: A Comprehensive Grammar* (Routledge 2018), cited by page: the stems (p. 158-159 and the
  list of simple verbs, 11.13, p. 199-222), the copula (p. 183-188), the present and its endings (p. 224-226), the
  imperative (p. 244-245), the ezafe (p. 48-50), the plurals (p. 26-28), the indefinite (p. 36-37). Facts only.

## Stage 1: the lexical forms and their spellings

- **The notation** (`lexicons/fa/language.yaml`, `notation`): a form is the word as `courses/fa/vocalization.yaml`
  marks it (fatha, kasra, damma; shadda; tanvin; a long vowel its letter alone; a consonant with no vowel bare; no
  sukun), so the forms carry the short vowels. Why: the vocalized layer can then be checked against the course's
  vocalization for every token (1,694 of 1,700 are), and the rules are stated on sounds (a final -e, a long ā or u,
  a short a before a joined ending). U+06DF marks a letter written and not said, as apc's does: the ه of a final -e
  (خانه, khāne: 30 lexemes; the five whose ه is said, ده dah and سیاه siyāh among them, have none) and the و of خوا
  (خواهر, khāhar: four lexemes). The ZWNJ is a
  letter of the form where an affix is written apart. The sukun is the engine's sign of no vowel where an affix joins
  a bare letter; both spellings drop it. Sets: L, DT (an infinitive's last letter), NV (what a joined ending leaves
  on the letter before it), AA (a long a).
- **The statements** (`profiles/fa-Arab.standard.yaml`): `spell` drops the vowel marks, the sukun and U+06DF and
  keeps the ezafe's hamza (خانهٔ); the `vocalized` layer's drops only the sukun and U+06DF. No alternatives.
- **Counts.** 237 lexemes with a form (236 strings; doost-dashtan keeps its listed parts), 29 allomorph forms on 17
  lexemes (the 13 affixes, the ezafe, the two possessives, the copula). `nabu forms`: 491 spellings checked (each
  lemma in both statements, each allomorph in the plain one), 0 that do not spell as the lexicon and the
  vocalization write the word. 16 lexemes have no top-level form: the affixes, which have allomorph forms.
- **The affixes' allomorphs**: the person endings -am -ad -and on a carrier (their fatha goes on the stem's last
  letter), -i -im -id as written; mi- with its ZWNJ; na- said ne- before mi- (p. 225); be-; -hā apart with a ZWNJ;
  -ān, and -yān after ā; -i, -yi after ā or u, and ZWNJ + alef + i after a silent -e; -tar apart; the possessives -am
  and -at, -yam and -yat after ā or u, ZWNJ + alef after a silent -e; the ezafe: a hamza on a silent -e's ه, ی after
  ā or u, else the kasra the course writes; the copula: هست before an ending, -st joined after ā, u or i (p. 184),
  است elsewhere. A long vowel's letter counts only after a bare consonant: rav's و and kheyli's ی do not. To make the
  check spell them, three allomorph spellings now carry the ZWNJ the course writes (mi, -hā, -tar).

## Stages 2 and 3: the rules, and every token accounted for

- **The cell.** A Persian verb's stem is chosen by its tense, and no lexeme a token listed said it: دارم and رفتم
  were both a verb and -am. So every verb token now chooses `Tense` (Pres 170, Past 20), as the copula's بود already
  chose Tense=Past; the infinitive chooses nothing; gozashtan, whose lemma is its 3sg past, cites `{Tense: Past}`.
  The three existential هست tokens choose `Variant=Long` (the copula's independent version, p. 183-185), the only way
  their cell differs from است. language.yaml declares Tense=Pres and Variant=Long. No node teaches either: no
  sentence's parts change.
- **Realisation** (`realisation`): `rule:fa-past` (a verb cited by its infinitive, budan too: the past stem, branch
  `stem`); `rule:fa-present-idan` and `rule:fa-present-andan` (Yousef p. 159's two regular groups: -idan less -idan,
  unless one letter would remain, as didan's; -āndan less -dan). No rule adds an affix: a token's other lexemes are its
  affixes, joined by their allomorphs.
- **Rewrites** (`phonology`, in order): `rule:fa-past|an` (the infinitive's -an goes, before an ending or at a word's
  end), `rule:fa-present-idan|stem`, `rule:fa-present-andan|stem` (the same, for the present), `rule:fa-glide|y` (a
  present stem in -ā or -u takes y before an ending: mi-ā-yam, p. 225), `rule:fa-prefix-y|na` and `|be` (na- and be-
  before ā: nayāmad, biyā; p. 174, 245). The stems' branches are two rewrites each: one before an ending, whose vowel
  the join has already put on the infinitive's ن (the engine joins before it rewrites), one at a word's end.
- **Listed** (`status: listed`, statement `llm:claude@rules-fa`, draft): 11 present stems from Yousef's list (آ, دَه,
  دار, بین, گیر, گُذَر, کُن, خواه, خُور, رَو, تَوان; two the course never conjugates: gereftan, gozashtan) and the copula's
  negative نیست and its independent version's 3sg present هَست. Where Yousef gives two (row / rav, deh / dah) the stem listed is the one
  the course conjugates. **Pinned: none.** `nabu forms prune ../lexicons/fa` removed the copula's two pinned copies.
- **The numbers.** 1,700 tokens: 1,547 given by the rules (61 of them took a rule step: fa-past 27, fa-present-idan
  15, fa-present-andan 8, fa-glide 11; the rest by their forms and their affixes' allomorphs), 153 by a listed form,
  **0 unaccounted**, 0 pinned. The compile adds no warning.
- **No engine, schema or compiler change.** (The branch carries the coordinator's notation commit, fe8f0dd.)
- **Vectors:** `conformance/realise-fa.json` (53, realise-token over lexicons/fa) and `conformance/spell-fa.json` (90,
  both statements over each realisation, against the course where it writes the token): one or more per branch and
  per allomorph, from the course's tokens where it writes them, else its lexemes in a cell it does not (بیا, نیامد,
  آقایان, khāne-i, khāne-am, اوست). Both harnesses pass (1,394 and 1,395).

## Stage 4: the bundle

- `cells`: VERB Tense=Past, Tense=Pres; AUX Tense=Past (the copula's other cells are listed, so no rule gives them).
  16 lexemes carry a `paradigm`: each verb's past stem (the 3sg past, a word: رفت, خورد) and present stem (رو, خور); the
  copula's past. No `regularised`: the present rules hold only of their classes, so blocking off gives nothing for a
  verb whose stem is listed. No `form.spelling-script`. The lexicon file grew 132,124 to 133,452 bytes.
- **`principalParts`: not set.** The present stem is the Tense=Pres cell, and `principalParts: {VERB: [{Tense: Pres}]}`
  would show it beside the infinitive (خوردن · خور), as Persian dictionaries and Yousef's list do. Not set because
  every verb's gloss already says it ("present stem خور-") and it would change what a learner sees; it is one line.

## What a learner sees

- Token feats are shipped, so form signatures change (ADR 0132): a past gap no longer offers دارم among its options
  (the present of داشتن had the past's signature, a verb and -am), and the infinitive کردن no longer stands with the
  3sg pasts آمد and گذشت. Seen-logging keys of verb forms gain their tense.
- The grader knows each paradigm spelling (stage 4): the 3sg pasts no sentence writes (رفت, کرد …) are another form of
  their verb, and so are the bare present stems, some of which spell other words (خواب sleep, خر donkey, پیچ screw,
  توان power, ده ten). The stems are three or four letters, and fa's typo leeway (maxRatio 0.15) gives no word
  within a letter of one a slip, so no slip lands on a stem.

## For the owner

1. Verb tokens choosing Tense (Pres or Past), and the gap-fill pools that split by it.
2. The existential هست: Variant=Long on its three budan tokens, or the tokens name `lexeme:existential-hast` (the
   lexeme the sentences already `use`), which would change their credit.
3. U+06DF on the silent ه of -e and the silent و of khā; the notation cannot tell -o from -ow (both damma + و), so
   the ezafe after either is left to the kasra (Yousef: ی after -o, none after -ow).
4. Shipping the bare present stem as the Tense=Pres cell. The alternative is to pin the -idan and -āndan stems, so no
   rule step is taken in that cell and it is dropped: the cost is Yousef's two regular groups as rules.
5. `principalParts` as above.
6. Inflected spellings in `spelled` (Morphology notes: never an inflected word): خانهٔ, هفتهٔ, خانوادهٔ, صبحانهٔ
   (the ezafe the rules now give), آمد (the 3sg past), است (the copula's 3sg present). Dropping them changes what the
   bundle ships; left.
7. Not written, no token needs them: the singular imperative's row and deh (borow, bedeh); be- before a stem in a- or
   o- (biyoft); -gān after a silent -e; -i after -i (bini-i); the copula's enclitic persons after a predicate
   (khāne-am, I'm home); the ezafe after -ow; the perfect (the course writes none); the hamza spelling of the glide
   (mi-ā'i, with ئ) and the ezafe as ZWNJ + ی after a silent -e (Yousef: both common) as free spellings.
8. khordan's present stem is listed: Yousef calls the verb regular (p. 159) but states no rule that gives khor and
   not kardan's kon.
