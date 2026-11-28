# Rules in a lexicon: uz (stages 1 to 4 as built, 2026-11-25)

uz taken through the stages apc went through (docs/rules-design.md). Report only where it could be: no token,
spelling, lemma, accept set or clip changed; the bundle changed by its lexicon alone (`cells`, each lexeme's
`paradigm` and `regularised`). Every rule and branch is REVIEW.

## Counts

- **Forms.** 241 lexemes: 213 with a `form` (all strings), 28 affixes (the 25 that `realise` a value, chi, q,
  count) with forms on their allomorphs only. 42 allomorphs have forms: the 39 the course spells, and three no
  token writes (-qa after q; -kacha, -qacha). 33 allomorphs of a base keep their spelling only: a verb's stem
  is its lexical form (ber), doʻst, boshqa, hamma, kuz, oʻng, qish and samolyot likewise, singl and oʻgʻl the
  vowel-drop rule's. `form.projection`: 504 spellings checked (lemmas through their citation cell, below), none
  differs.
- **Tokens.** 2,504 (1,252 a script), every one given by the rules: none by a form, none unaccounted.
- **Pinned:** 1 (hamma's hammasi: no ending for pronouns by rule; `form.rule-debt`). **Listed:** 1 (singil's
  third person takes the stem singli-: singlisi, Hancock-Parmer pp. 63-64).
- **Paradigms.** VERB 21 cells, NOUN 20, ADJ 2; 83 lexemes; 1,651 spelled cells a script. The lexicon file grew
  137 to 198 KB (8 to 20 KB gzipped). No `form.spelling-script` refusal. `regularised` only for the vowel-drop
  nouns (singilim, oʻgʻilim: the class passed over). The 744 tokens that write a lexeme in a paradigm cell (its
  base and the affixes its category's rule writes, nothing else) all spell as the paradigm does (a one-off
  script, not a lint). No paradigm spelling is another lexeme's lemma or form.
- **Vectors.** conformance/realise-uz.json 62 (every branch below), spell-uz.json 34 (every rule of both
  statements), realise-affixes.json 7 (the engine's new key on an invented language). The harnesses pass
  1,360 (TS) and 1,361 (Python).

## The notation and the spellings

- **Notation** (lexicons/uz/language.yaml): the 1995 Latin alphabet as the course writes it; oʻ, gʻ (U+02BB) and
  the tutuq belgisi (U+02BC) letters of their own (two units each, as digraphs are). Sets: V vowel letters, C
  consonant letters with U+02BB and U+02BC. Lemmas keep their capitals (Toshkent).
- **uz-Latn/standard:** `spell: {from: lexical, rules: []}`, the identity.
- **uz-Cyrl/standard:** nine rules in order: ye as е at a word's start and after a vowel; e as э there; oʻ ў,
  gʻ ғ (before yo, so yoʻl is йўл); sh ш, ch ч; ya yo yu я ё ю (tayyor тайёр); ʼ ъ; each letter (h ҳ, x х, q қ,
  j ж). Capitals mapped alongside. Every spelling of the course comes out so; no loan of the course keeps a
  Russian spelling, so none is spelled whole. Not given: ye after a consonant (the norm's объект comes out
  обйект), ц, ь, щ.

## The rules

The course writes an inflected word as its lexemes (bor + past + past-1sg), so the rules are mostly the affix
lexemes' allomorphs and the conditions that choose them (lexemes.yaml): -m, -ng, -si, -miz, -ngiz after a vowel
(else -im, -ing, -i, -imiz, -ingiz), -y after a vowel (else -a), -ng after a vowel (imperative), -ka after k,
-qa after q (else -ga; -kacha, -qacha alike), -ti after -yap (else -di), -ing after men or sen (else -ning).
Two base allomorphs no rule gives: necha's nech before -ta (nechta), edi's e before its ending (the lemma e-).

Realisation rules (language.yaml), each writing those affix lexemes (`lexeme`) in a cell. Verbs, nouns,
adjectives and pronouns are `stemmed` (bar's key, taken as it is): a lexical form is a stem, and a citation
cell, the category's (VerbForm=Inf) or a lexeme's own, is the rules' realisation of it:

- `rule:uz-verb` (Hancock-Parmer pp. 39-41, 47-48; Sjoberg pp. 97, 108-109): neg; inf (-moq, the citation
  cell VerbForm=Inf: ich, ichmoq), past, pres, prog, des; past-1sg, past-1pl, past-2, imp-2, 1sg, 1pl, 2, 3,
  prog-3; 2pl (-lar after -siz, -ngiz).
- `rule:uz-noun` (Sjoberg pp. 83-84; Hancock-Parmer pp. 22, 57-61): pl; poss-1sg, poss-1pl, poss-2, poss-3; gen,
  dat, acc, loc, abl, ter.
- `rule:uz-adjective`: cmp (-roq); poss-3 (boshqasi, the course).
- `rule:uz-pronoun`, with no blocks: no ending for pronouns by rule. Their stems are their own (u, unga; bu,
  bunga; men, meni; ular), and which take -lar or a possessive is the pronoun's (Sjoberg pp. 88-90). Their
  tokens are given as the course lists them; the rule is there so that a stemmed pronoun has one (hammasi is
  pinned).

Rewrites: `rule:uz-vowel-drop` (class `vowel-drop`: singil, oʻgʻil, shahar; the stem's last a, i or u after one
or two consonants, before a vowel: singlim, oʻgʻli; Sjoberg pp. 51-52); `rule:uz-voicing` k, q (a noun of more
than one syllable writes its last k as g, q as gʻ before the possessive's i: mushugi, qishlogʻim; Hancock-Parmer
pp. 10-11; one-syllable nouns keep it, parki: the 1995 spelling rules, not in the library). No token of the
course has a voiced k or q; paradigms of nouns it does not inflect would.

## Engine and compiler changes

- **Taken, not built here:** `stemmed` (language.yaml; the coordinator's cfc8b80, from bar's session), for the
  lemmas. uz first had a key of its own on the rule for it; the two gave the same bundle, byte for byte.
- **Engine** (packages/core/src/lexicon/realise.ts; schemas/language.schema.json, regenerated):
  `Exponent.lexeme`, in place of `add`: an affix lexeme, in the allomorph its conditions choose by what it
  follows or stands before, as `realiseToken` chooses it, so the allomorphs are stated once. The schema asks
  `add` where there is no `lexeme` (`if`/`then`: the generated types change only by the optional key);
  compileLanguage refuses an exponent with both or neither, or naming no lexeme of the lexicon. A valid example,
  schemas/examples/language/valid/affix-lexemes.yaml.
- **Compiler** (pipeline/src/nabu/paradigms.py, forms.py): a paradigm's cells take, beside the base's chosen
  values, the `realises` of each affix lexeme the token lists that the category's rules write (`token_cell`,
  `written_affixes`), and a lexeme written so inflects; `nabu forms --paradigm` counts cells the same way. A
  test in tests/test_paradigms.py.
- apc writes no affix lexeme by rule: its bundle builds byte for byte as committed, its vectors unchanged.

## Where the course and the rules part, and what waits for the owner

1. **Lemmas that are inflected words** (the course's; word cards show them): bilmoq bilmayman, kechirmoq
   kechirasiz, toymoq toʻydim, dost doʻstim, kuz kuzda, qish qishda, samolyot samolyotda, ong oʻngga, singil
   singlim, boshqa boshqasi, hamma hammasi; edi is cited as the stem e-. Each says its cell with `citation`, and
   the rules give all but hammasi. To cite the bare word (kuz, bilmoq) changes word cards and clips: the owner's.
2. **-yap and -yapti** have no source in the library (Sjoberg gives the older -moqta, p. 108): the course's.
3. **nechta** (necha's nech before -ta) is the course's; bitta (bir + -ta, Hancock-Parmer p. 28) has no token and
   no rule.
4. **The voicing rule's syllable count** and its exceptions (Arabic loans: ittifoqi) are not in the library.
5. **Not written,** for want of a word that needs them: gʻ + -ga written -qqa (togʻ, toqqa: Hancock-Parmer p. 11);
   the second person singular (-san, -ding, -ng); -lar after a verb's third person; the conditional -sa; the
   participle -gan. (Pronoun stems, unga, bunga, meni, are written since the merge: below.)
6. **dimensions** in language.yaml now list what the rules inflect for (the Data page shows them).
7. **Grading** now knows the paradigms (`paradigmWords`): a typed word in an unwritten cell of the answer's own
   lexeme is another form (bordik for bordim, once a typo). Not measured here: the acceptance runs are the
   coordinator's.

## uz merges lexemes (ADR 0158; 2026-11-28)

uz is the third course language in the merge model, after apc and chg. Its suffixes were lexemes already (bor + past +
past-1sg); what changed is that each now says what it merges onto, a word says what it requires, and the cells
nothing writes are zero lexemes, so every base has all its cells. Every line is REVIEW (the owner was asleep; these
are the session's choices).

- **What a word requires** (language.yaml `requires`): a noun, a name or a pronoun a case; a verb or an auxiliary a
  form (VerbForm: a finite tense or mood, or the infinitive); a finite tense a person. emas never inflects
  (`requires: []`). A noun, a name or a pronoun is cited in the nominative, a verb in the infinitive (`citation`).
- **The zeros**: `nom`, the nominative (Sjoberg p. 84); `p3`, the past's third person (keldi, edi: HP p. 48);
  `imp.sg`, the bare stem as the imperative to one (ich!, HP p. 47: the course's two bare verb tokens). A bare noun is
  unmarked for number: -lar is the plural, as in chg.
- **inf** (-moq) is a lexeme now: the realisation rule gave ichmoq by `add: moq`; a verb is cited as the merge of its
  stem and inf. The realisation rules are gone (each branch was an affix's `realises`); the two rewrites (vowel drop,
  voicing) stay and run over the merged word.
- **The order** (each lexeme's `on`; Sjoberg pp. 83-84, HP pp. 22, 57-61): the plural before a possessive or a case,
  the possessive before a case and once (onto a pronoun only as hamma: hammasi), a case onto a noun, a name, a pronoun
  or a numeral; the negative, then one tense or mood (-di, -a, -yap, -moqchi, -ing, -moq), then the person: the set-1
  endings (-man, -miz, -siz) after the present, -yap and -moqchi, -di after the present and -yap, the past's -m, -k,
  -ngiz, or the zero; -lar after a second person (borasizlar, bordingizlar, yaxshimisizlar). -mi after the stem or a
  person, -chi onto a whole word.
- **One set of person endings** on verbs and predicates (Sjoberg p. 97's set 1: bor-a-man, talaba-man), unlike chg,
  where the reference splits the present's -dur from the copula. On a predicate they merge onto a whole word (after
  its case: uydaman) or onto emas (emasman), never onto edi (edim takes the past's -m). A predicate's -man brings
  Person and Number to the noun, which no cell keeps: a cell is realised only by lexemes whose values all stand in it
  (core `mergeFor`), and a noun's dimensions hold no Person.
- **Pronoun stems**: with the merge, pronouns have paradigms (the cases the course writes on them), so u and bu take
  un-, bun- before a case beginning with d or g (unga, unda, undan, ungacha; bunga …), and men, sen take -i for the
  accusative (meni) as they take -ing for the genitive (Sjoberg pp. 88-90). shu is not in the lexicon.
- **The tokens** list the zeros with no surface; the compiler folds them into the base's values, given, never a part
  (no node introduces a uz value). A converter wrote them: 1,002 nominal tokens took `nom` (728 written alone), 14
  past verbs and edi `p3`, the two bare stems `imp.sg`. The token check gives all 2,504 tokens as before (2,502 by the
  rules, hamma's hammasi by its pinned form); every token is complete (none `missing`); every token's lexemes, picked
  in any order, merge back as written (packages/core/test/merge-order-uz.test.ts; -mi's tokens left out, as -mu's in
  chg).
- **What ships**: the bundle's cells (VERB 21, NOUN 22, PRON 6, PROPN 5, AUX 4, NUM 3, ADJ 2; 148 lexemes with a
  paradigm), now with `labels` naming every cell ("past (-di): I", "my, dative (-ga: to, for)"), which uz did not
  have: REVIEW, every one. A bare imperative's cell is not listed (its zero writes nothing, so no lexeme's form is
  ruled there); the lemma stays its infinitive.
- **conformance/realise-uz.json**: each cell is now the word's whole cell (a finite verb's VerbForm=Fin and person, a
  nominal's case), each token lists its zeros; every expected form is unchanged, the steps only the rewrites'.

## Sources

Hancock-Parmer, *Uzbek Language Manual: An Introduction to Uzbek Grammar* (by printed page); Andrée F. Sjoberg,
*Uzbek Structural Grammar* (1963; its scan: PDF page = printed page + 14). Facts only, no examples taken.
