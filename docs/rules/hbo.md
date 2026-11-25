# Rules in a lexicon: Biblical Hebrew (hbo), as built

- Status: built on 2026-11-25 through stages 1 to 4 of [rules-design.md](../rules-design.md), as apc's were. Every
  rule, branch, class, form and statement is REVIEW: drafted from Joüon and Muraoka, *A Grammar of Biblical Hebrew*
  (2011; "JM § n, page") and the course's own words (the Westminster Leningrad Codex), awaiting Ben's sign-off.
  Sections and pages were checked against JM's table of contents and, where a form hung on it, the page itself
  (printed page = PDF page - 47).
- Nothing a learner sees changed: no token, pointing, spelling, lemma, reading, accept set or clip. The bundle
  changes only by its new `cells` and each lexeme's `paradigm` (stage 4).

## Counts

- **Lexemes** (320): 311 have a `form`: 198 strings, 113 radical forms (qal 64, hiphil 23, piel 17, niphal 5,
  hithpael 3, polel 1). The other 9 (the suffixed pronouns and the directional ה) are their 31 allomorphs alone.
  `form.projection` is at zero: 647 spellings checked (each stored form and the 37 allomorphs with a form, in the
  orthography and in its pointed layer).
- **Tokens** (2,452, one orthography): 0 unaccounted. The rules alone give **1,729** (71%, measured before the
  merge). With the free variants below pinned, 1,543 are given exactly and 909 by a form of their lexeme, of which
  186 are the rules' own form, first among its cell's free variants; 70 tokens are accounted for by a free
  allomorph's alternative (`nabu forms`: "by a free variant").
- **Forms** in lexemes.yaml: 297 with a lexical form on 148 lexemes: 285 pinned (rule debt), 12 listed (הָלַךְ).
  Of these 144 hold only before a suffix (`before`), 65 are an uninflected word's (no `feats`), 92 are free variants
  in 42 cells. By part of speech: NOUN 126, VERB 101, ADP 29, PRON 11, NUM 8, ADJ 6, PROPN 6, ADV 4, INTJ 4, SCONJ 2.
  The verb forms pinned whole: wayyiqtol 12, imperative 12, yiqtol 11, jussive 9, cohortative 5, infinitive 3,
  participle 3, qatal 2, weqatal 2, 5 on tokens with no values.
- **Prune**: `nabu forms prune ../lexicons/hbo` removed 249 of the 326 spelling-only copies: 248, then after the
  merge one more (הָלַךְ's imperative לְכָה, which sk's check of a cell's free forms finds its listed free form gives).
  The 77 it kept are cells the rules alone do not give (a pinned form with a lexical form gives them): copies, for
  the owner to drop or keep.
- **Paradigms** (bundle format 5): VERB 30 cells, ADJ 3, NOUN 2 (the citation and the construct singular); 229
  lexemes, 3,219 spelled cells, each `[letters, pointed]`. The lexicon file grew from 268 to 390 KB (18 to 42 KB
  gzipped). `regularised` is shipped for one lexeme, הָלַךְ (its I-yod-like forms realised regularly: תַּהֲלֵךְ for
  תֵּלֵךְ, a learner's over-regularisation). No `form.spelling-script` warning.
- **No `principalParts`.** JM (§ 40a n. 3) and Holladay cite a verb by its qatal 3ms, a hollow verb by its
  infinitive construct; neither gives a second part as standard.
- **Vectors**: conformance/realise-hbo.json, 105: 22 `realise/hbo-engine/*` on the invented language zz (the engine
  changes below), 83 `realise/hbo/*`, a branch each: 62 from the course's tokens, 21 constructed (שָׁמַר, דִּבֶּר, טוֹב,
  לְ + יְבֵמֶת) for the branches no token takes, each note citing JM's section or paradigm P2.
  conformance/spell-hbo.json, 27 (each rule of both statements, the course's word as `expected`). Both harnesses pass
  (1,383 TS, 1,384 Python).

## The notation and the spelling

- **The lexical form is the Tiberian pointing** as the course writes it (WLC: no accents, no meteg), letters with
  their dagesh and shin or sin dot; `order` is dot, dagesh, then point. `vowels`: i ee e a aa o u and the hatafs ha
  he ho. **The sign of no vowel is the shewa** (`none`), vocal or silent alike: Tiberian writes one sign for both and
  which a shewa is follows from where it stands (Khan I.2.8; JM § 8); a second sign would make every form say what
  the reading already pins. Where a rule must tell them apart (the dagesh lene) it reads the vowel before: a shewa
  after a short vowel is silent. A word's last consonant is bare. `long` makes a bare yod, he or alef after a vowel
  a vowel letter (no shewa before a suffix: קָרָאתָ).
- **Left to the spelling** (each profile's `spell`): final letter forms; the shewa under a final kaf and under the
  last letter of a final cluster (not a quiescent alef: גַּיְא); the furtive patah (JM § 21c); the dagesh lene of a
  begadkefat that begins a word (a form writes ב first, never בּ). The carrier (U+0640) is never written.
- **hbo-Hebr/tiberian's `spell`** writes the letters (points dropped), which is how grading keys a typed answer; its
  **`vocalized` layer's** writes the pointed text, compared exactly with the course's (E2 below).
- **Free alternatives** (named, read only by the compiler): `spirant` (a first begadkefat without its dagesh after
  a word ending in a vowel, JM § 19c), `dagesh-conjunctive` (a first letter doubled after such a word, JM § 18i),
  `waw-before-stress` (וָ, JM § 104c-d), `plene` and `defective` (holem, shureq or qibbuts, hiriq with or without its
  vowel letter: JM § 7; the tiberian scheme already treats full and defective spellings as free), `plene-ta` (the 2ms
  -tâ, JM § 42f). The first three are the text's, not the word's: the token check cannot see the word before.

## The rules (lexicons/hbo/language.yaml)

- **Root classes**, the first that holds: iii-he, hollow (II-waw/yod), geminate, i-nun, i-yod, iii-alef, sound.
  Gutturals are template conditions (`radical`, `in`), not classes, so a I-guttural III-he verb (עָשָׂה) is one
  class with a condition.
- **Stems**: 152 templates by binyan, class and conjugation: perf, perf-c and perf-v (before a consonant or vowel
  ending), perf-h (before -tem, -ten), perf-3fs; impf, impf-v, wayy (the short form); impv, impv-v; inf, infabs; ptc,
  ptc-fs, ptc-v, ptcp, ptcp-v. Slots: `perf` (a, ee, o: JM § 41), `impf` (the theme vowel: JM § 44c), `pfx` (a I-yod
  verb's ee or i: JM § 75c-d), `inf` (a hollow verb's u, o: JM § 80). Hollow verbs are cited by the infinitive
  (`citation: {VerbForm: Inf}`, JM § 40a n. 3).
- **Realisation rules** (tokens taking each branch, given or by a form; branches no token takes have constructed
  vectors):
  - `rule:hbo-qatal` (JM § 42, p. 120): 3ms 26, 1cs 16, 2ms 12, 3fs 12, 2fs 5, 3cp 5, 1cp, 2mp, 2fp.
  - `rule:hbo-weqatal` (JM § 43, 119): the same branches and `vav` (14).
  - `rule:hbo-yiqtol` (JM § 44, p. 124), indicative only: prefixes 1s 14, 1p, 3fs, 3fp, 2 12, 3 20; endings 2fs 4,
    mp 3, fp.
  - `rule:hbo-wayyiqtol` (JM § 47, pp. 128-130): the same prefixes (3: 117, 3fs 26) and endings, and `vav` (147).
  - `rule:hbo-imperative` (JM § 48): ms 24, mp 14, fs 9, fp.
  - `rule:hbo-infinitive` (JM § 49): construct 49; `rule:hbo-infinitive-absolute`: absolute 4.
  - `rule:hbo-participle` (JM § 50c, g): ms 37, fs 13, mp 8, fp; `rule:hbo-participle-passive` (JM § 50c): ms 5,
    fs 1, mp.
  - `rule:hbo-construct` (JM § 92): `same` 34, a construct singular that is the absolute, for nouns of the class
    construct-same (monosyllables whose vowel does not reduce, segolates).
  - `rule:hbo-adjective` (JM § 89): fs 4, mp 1, fp.
  - Nouns have no plural rule: the stem changes (JM § 96-97) are each noun's, pinned. A bare `-îm` would have
    shipped a wrong plural (its paradigm cell) for most nouns.
- **Rewrites** (38, in order; tokens): `prefix-alef` (qal 3, shewa), `quiescent-alef` (2, prefix 6: אֹמַר; לֵאמֹר,
  וֵאלֹהֵי), `wayyiqtol` (double 143, alef 2), `article` (double 155, alef 95, qamets 32, he 4, stressed 5),
  `interrogative` (1), `relative` (2), `preposition` (article, shewa 45, hataf 18, yod), `qere` (6: לַיהוָה),
  `conjunction` (shureq 41, hataf 6, he 2, yod 2), `min` (20), `dagesh-lene` (39), `guttural` (helping-vowel 1),
  `energic` (4), `assimilation` (2: נָתַתָּ), `maqaf` (tsere 110, holem 15).
- **Clitics** are lexemes with forms: הַ, וְ, בְּ, לְ, כְּ (each `בְ` in notation), מִן (allomorphs מִ, the next letter
  doubled, and מֵ before a guttural or ר), שֶׁ, הֲ. Their sound changes are rewrites naming the boundary.
- **Suffixed pronouns** (JM § 94, P1 pp. 618-619): each a lexeme whose allomorphs are chosen by what they follow:
  after a bare final consonant the singular noun's series with its vowel on the carrier (-î, -əḵā, -ēḵ, -ô, -āh,
  -ēnû, -əḵem, -ām); else the tail the course writes after the vowel its base piece carries (-î after hiriq, -nî
  after a verb's vowel, -w after yod, -hû after tsere, -nnû after segol, -hā after -ê-, -hem after -ê-). A base whose
  stem changes before a suffix has its stem as a form with `before` (144 of them).
- **Classes** (stated, never shipped): construct-same (11 nouns), qamets-after-article (4: אֶרֶץ, הַר, עַם, גַּן;
  JM § 35f), alef-quiescent (אֱלֹהִים) and alef-quiescent-verb (אָמַר: JM § 24, 73f), qere-adonay (יְהוָה), suffix-plene
  (אַיֶּכָּה, JM § 94h n. 4), suffix-hem (עִמָּהֶם).
- **Listed**: הָלַךְ's forms outside its perfect and participle (12: JM § 75g, p. 180, "inflected like a פ״ו verb"),
  statement llm draft. Everything else the rules do not give is pinned: the apocopated wayyiqtols (וַיְהִי, וַיַּרְא,
  וַיֵּבְךְּ: JM § 79i), weak-verb forms no template covers yet, noun plurals and constructs, stems before suffixes.

## Context: pause, nesiga, bound

- A token's `context` (pause 3, nesiga 1) and **bound** (270 tokens: its pinned reading ends with the tiberian
  scheme's bound mark, a maqaf follows) reach the realiser (engine change E4): `rule:hbo-maqaf` shortens a last
  syllable's tsere and holem in a bound word (אֶת־, אֶל־, לֶךְ־, כָּל־: JM § 13).
- The four labelled tokens are spelled as their unlabelled forms, so no pause rule was needed. **Pausal forms written
  otherwise carry no label** (ADR 0135 labels context only where the spelling is the same). They are pinned: as free
  variants beside the contextual form where the course writes both (אָתָּה, אָתְּ, חָרֶב, לָיְלָה, מָיִם, שָׁמָיִם, שָׁקֶר,
  חָי, וַיִּשְׁכָּב, אָכָלְתָּ, and the stems before -ekā: אַרְצֶךָ, לְבָבֶךָ, עַבְדֶּךָ), alone where it writes only the
  pausal one (תִּרְצָח, תִּנְאָף, אֶשְׁאָב, אֶחְסָר, שְׁכָב).

## Engine and compiler changes

Each was a commit of its own, then merged with chg's, sk's, es's, yue's, uz's and bar's (2026-11-25): one key and one
mechanism per concept, as below. Every other course's bundle comes out byte for byte the same; hbo's gains its
cells and paradigms.


- **E1, a cell's free forms realised in a token** (realise.ts, core-cli, forms.py): `RealiseOptions.variant`
  takes the k-th of `Realisation.free` (sk's field, the one field for a cell's other free forms) in the first's
  place, and the token is realised around it: its other lexemes joined, the rewrites run. forms.py asks for each.
  sk's own use, spelling a free form as it is, stands: it is right for a token that writes its base alone, not
  for hbo's וַיהֹוָה or a pausal stem before a suffix. An out-of-range `variant` is the error `variant` (the rules
  explorer has a message for it).
- **E2, a pointed text is its own marked layer** (build.py `_pointed`, forms.py `check(pointed=…)`): where an
  orthography has no vocalization file and a vocalization layer that states `spell`, its surface is the marked text,
  so the points are checked exactly; the orthography itself is still compared as grading keys it.
- **E3, `LexemeForm.before`** (lexicon.schema.json, realise.ts): a form that holds only where the rest of its token
  holds a condition (a stem before a suffix), in any cell, more specific than one without; never a paradigm's.
- **E4, `Condition.context` and `RealiseOptions.context`** (language.schema.json, realise.ts, core-cli, build.py
  `_bound_by_reading`, forms.py `Site.context`): a rewrite whose `when` names a context holds only of a token in it.
- **E5, a form with no `feats`** (lexicon.schema.json `required`, realise.ts): for a token that chooses no value, never
  a cell (an uninflected word's form; free variants of a word with no cell).
- **E6, an allomorph's condition reads its token's base** (realise.ts `allomorphHolds`): `feats` the base's cell,
  and in `after` `pos` and `class` the base lexeme (a suffix's series: -nî after a verb, -ḵâ, -hem by class). No
  other language's allomorphs name these keys, so nothing else changes.
- **E7, `Allomorph.free`**: chg's, one implementation (chg built the same key alongside): never chosen; each one whose
  conditions hold gives the token an alternative, its other allomorphs chosen again around it (`freeOf`, `choose`).
  hbo's uses: the preposition with the unlisted article; לָ before a stressed syllable; the pausal -āya. The merge
  dropped hbo's own pass (one place swapped, nothing chosen again) and its string alternatives for chg's
  `{form, steps}`; the hbo vectors were rewritten to that shape, their forms unchanged.
- Vectors on zz for each (22). `pnpm codegen` regenerated packages/schema and the Pydantic models.

## Where the course and the rules part (the course stands; each is pinned or a free variant)

- **The article after בְּ, לְ, כְּ is unlisted** in about 80 tokens (בַּגָּן, לָאוֹר: the token lists `be` and `gan`
  only). Modelled as the preposition's free allomorph with the article (בְ+הַ), after which the article's rules
  apply. Listing `ha` with an empty surface (ADR 0136) would make it a rule.
- **Cells that name less than the form**: the jussive and cohortative cells name no person (`Aspect=Imp,
  Mood=Jus`), so no prefix can be chosen (pinned, 14; three forms of יָרֵא in one cell); אֶחָד, שְׁנַיִם tokens name no
  gender (אַחַת, שְׁתַּיִם beside them); שְׂחוֹק (an infinitive) and the vocative אָבִי (its suffix unlisted) name nothing;
  בֵּית, רֹעֵה (constructs) are tagged without `Definite=Cons`; one weqatal וְנָתַן (u15) names only נָתַן, its וְ
  unlisted, so its form carries the vav.
- **Pause written otherwise, unlabelled** (above, JM § 32), and the course's own variants: יְהֹוָה beside יְהוָה; הִוא
  (the ketiv); הֵמָּה beside הֵם; אֵין beside the lemma אַיִן; מָה, מַה, מֶה; נׇעֳמִי (lexicon, qamets qatan) beside
  נָעֳמִי (tokens). Each is a free variant of its cell.

## For the owner

- Every rule above, and the notation's two decisions: the shewa is one sign; a word's first begadkefat is written
  without its dagesh, the spelling's to add.
- Whether pausal forms written otherwise should be labelled `context: pause` (a pause rule could then replace
  about 20 pinned forms), and whether the unlisted article should be listed (80 tokens).
- The jussive and cohortative cells: name the person, or accept them as pinned.
- The free spellings: `spirant`, `dagesh-conjunctive` and `waw-before-stress` accept a pointing the context decides.
- The 77 spelling-only copies prune kept; the regularised הָלַךְ forms; paradigm cells no token writes are the rules'
  word (a weak verb's rare cell may be wrongly pointed; its letters, which grading keys, are mostly right).
- Not done: noun plural and construct rules (all pinned), the weak verbs' rarer stems (pinned), stress, the
  energic beyond the four tokens (a stem with its energic nun), Khan's phonetics (the readings, untouched).

## Sources

Joüon and Muraoka (2011), pages as printed: § 7 (p. 43), § 8e (p. 47), § 13 (p. 53), § 18i (p. 69), § 19c (p. 76),
§ 21c (p. 78), § 24 (p. 82), § 32 (p. 96, pause), § 35e-f (p. 102), § 38 (p. 108), § 40a n. 3 (p. 113), § 41
(p. 115), § 42 (p. 120), § 43 (p. 123), § 44 (p. 124), § 47 (p. 128), § 48 (p. 130), § 49 (p. 133), § 50 (p. 136),
§ 51 (p. 138), § 52 (p. 140; § 52c p. 142), § 53 (p. 145), § 54 (p. 148), § 59a (p. 156), § 61 (p. 158), § 68-70
(pp. 167-170), § 72 (p. 172), § 73 (p. 174), § 75 (p. 177; § 75g p. 180), § 78 (p. 185), § 79 (p. 188), § 80
(p. 195; § 80h p. 198), § 89 (p. 244), § 92 (p. 253), § 94 (p. 262; § 94h n. 4), § 96-97 (pp. 269, 285), § 102l-o
(p. 303), § 103 (p. 309), § 104c-d (p. 319); paradigms P1 (pp. 618-619), P2 (pp. 620-621), P16. Khan, *The Tiberian
Pronunciation Tradition of Biblical Hebrew* (2020), vol. I, I.2.8, for the shewa. The library's notes in
`nabu/notes/hbo/`.
