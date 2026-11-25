# Slovak: rules in a lexicon, as built (2026-11-25)

Stages 1 to 4 of docs/rules-design.md for courses/sk, as apc had them. Every rule, branch, class, listed form and the
profile's `spell` is REVIEW: drafted, not signed off. The sources are cited by page in lexicons/sk/language.yaml.

## Counts

- **Lexemes:** 459, each with a lexical form; `form.projection` 0 of 459 mismatched.
- **Tokens:** 2,873 checked (one orthography): 2,140 given by the rules, 733 by a listed form or stem, 0 unaccounted.
  `nabu forms ../courses/sk` takes about 9 s. sk compiles with 0 errors and 0 warnings.
- **Rules:** 38 realisation rules with 340 branches; 71 rewrites in 17 rules; 25 classes.
- **Listed:** 238 forms and stems on 58 lexemes (statement `llm:` draft). **Pinned:** none. `nabu forms prune` took
  all 530 pinned copies the generator had written; it kept none.
- **Paradigms:** 326 lexemes. Cells: NOUN 12, PROPN 10, ADJ 24, DET 9, ADV 1, VERB 23, AUX 10. 4,695 cells spelled and
  406 null. `regularised` on 107 lexemes. `principalParts`: VERB, the 1sg and the 3pl present (robím, robia), as KSSJ
  cites a verb. No `form.spelling-script`.
- **Lexicon file:** 284 to 390 KB (17 to 35 KB gzipped).
- **Vectors:** conformance/realise-sk.json has 377 Slovak vectors, at least one a branch, and 9 for the engine on an
  invented language. conformance/spell-sk.json has 14. Both harnesses pass (1,657 TS, 1,658 Python).
- **apc unchanged:** its bundle manifest is byte for byte the same, and its check is still 5,470 / 5,391 / 79 / 0.

## Lexical forms and spelling

- A form is the lemma's spelling with a boundary before the ending the lemma is cited in: žen+a, pekn+ý, mest+o,
  vysvedčen+ie, centr+um, dobr+e. A verb has a boundary before its theme and before -ť: vol+a+ť, rob+i+ť, vid+ie+ť,
  stretn+ú+ť, nies+ť, pi+ť. Phrases keep their space (vol+a+ť sa). Names keep their capital.
- ď, ť, ň and ľ are written with the caron wherever an alternation shows them soft: choď+i+ť, viď+ie+ť, treť+í,
  korčuľ+e, kaviareň. sk-Latn/standard's `spell` (`from: lexical`) is the identity, except one rule: the caron is
  dropped before e, i and í (Mistrík p. 14). d t n l that stay hard before e or i (teraz, ten) are written without a
  caron in the form.
- The notation is in language.yaml: Slovak's vowels are letters, and its sets (V, SV, LV, LS, C, SOFT, VEL, TH …) are
  named there. This uses fe8f0dd (`notation` with no vowel signs).
- The ending the lemma is cited in gives way to the cell's ending (rule:sk-ending: žen+a+y becomes žen+y). The
  infinitive's theme and -ť give way to the present's and the imperative's endings (rule:sk-infinitive|theme,
  |ending). sk declares no `stemmed`. bar's `stemmed` (cfc8b80, cherry-picked here because a7ea75a needs it) would
  make a string form a stem; here a form is the whole lemma, and its ending yields at the boundary.

## Rules and branches

Branches are named by cell (nom-pl, acc-m-anim, 1sg, imp-2sg …) or by what they do.

- **Nouns** (Mistrík p. 27–45). The rule is chosen by the lexeme's own gender and animacy (`own`, below) and its
  lemma's ending: sk-noun-chlap (a masculine person), -animal (chlap's singular, dub's plural), -dub, -stroj (a thing
  ending in a soft consonant), -zena, -ulica (after a soft consonant or i), -dlan (a feminine ending in a consonant),
  -kost (a class), -mesto (and -um loans), -srdce, -vysvedcenie, -dievca. Proper names: -name-adjectival (Tajovský)
  and -name-adjectival-f (Tóthová), and the ordinary noun rules otherwise. sk-plural-only gives no singular.
- **Noun rewrites.** sk-noun-chlap: nom-pl-ovia (given names, nouns in -o, the class pl-ovia), nom-pl-ia (-an, -teľ,
  the class pl-ia), nom-pl-c (k to c, ch to s), ins-pl-ami. sk-noun-dub: ins-pl-ami (stems in m, fleeting vowels),
  gen-u, loc-u (after k, g, h), loc-i, stroj. sk-fleeting (otca, lístka, dňa), sk-shortening (stola, chleba, rada).
  sk-genitive-plural: zero, ce, i, lengthen (síl, rúk, žien, jabĺk), insert-e (vajec), insert-o (látok), insert-ie
  (matiek, sestier, okien, izieb). sk-soft: ia, j (televíziám, stoja).
- **Adjectives** (p. 49–53): sk-adjective (pekný), sk-adjective-soft (cudzí), sk-adjective-short (rád, the
  nominative only), sk-comparative (cmp, sup, and its declension: naj-, -ší, -ejší), sk-no-degree. Rewrites:
  sk-comparative|k (sladší), |ejsi (after a cluster or a long syllable, and the class ejsi).
- **Adverbs** (p. 96–97): sk-adverb-comparative (-šie, naj-). Irregular ones are listed.
- **Verbs** (p. 77–94). The present and the imperative are chosen by class first, then by the infinitive's ending:
  athematic, e, cesat, zut, niest, triet, vidiet, kricat (classes), then pracovat (-ovať), chudnut (-núť after a
  consonant), rozumiet (-ieť), robit (-iť), chytat (-ať). Each has branches 1sg … 3pl, imp-2sg, imp-2pl and imp-1pl.
  Also sk-past (the -l form: m, f, n, pl), sk-passive (-ný, declined as pekný; class passive-ny), sk-future (byť,
  ísť), and sk-no-imperative. Rewrites: sk-present-pracovat|uj, -cesat|alternation, -niest|root, -chytat|soft
  (vraciam); sk-past|nu (stretol), |iel (išiel), |ol (niesol, mohol), |ie-e (videl); sk-imperative|i (zapni, pošli).
- **Across categories:** sk-rhythmic|long and |diphthong (krásna, čítam, píšu; not the genitive plural's -í or the
  3pl -ia, p. 35–38, 83, 92), and sk-negative (ne- written with the verb, p. 106).
- **Rules that give nothing:** sk-no-degree, sk-plural-only and sk-no-imperative have a single exponent that no
  wanted cell has. So the strict paradigm gives null for prvý's comparative, Vianoce's singular and musieť's command.

## Classes (lexemes.yaml `classes`)

Classes are used only where gender and ending do not settle the paradigm. Each has REVIEW and a page in language.yaml.

- Nouns: animal (kapor, rak), fleeting (14 nouns), shortening (chlieb, rád, stôl), gen-u (28 masculine things: dom,
  čas, čaj …; Mistrík gives no precise rule, p. 31), loc-i (hotel), stroj (the months in -r and -l, peniaze), pl-ia
  (brat), pl-ovia (otec), kost (jar), plural-only (Košice, narodeniny, peniaze, Tatry, Vianoce).
- Adjectives: short (rád), no-degree (13: ordinals and relational adjectives), ejsi (unavený).
- Verbs: athematic (jesť, vedieť, povedať), e-present (11), cesat (písať and two compounds), zut (piť, žiť), niest
  (niesť, viezť, riecť), triet (pozrieť), vidiet (vidieť, sedieť, musieť), kricat (ležať, pršať, spať, stáť), ist
  (ísť and three compounds), no-imperative (musieť, môcť, chutiť, pršať, snežiť), future (byť, ísť), passive-ny
  (napísať, zapísať, vydať).

## Listed and pinned

- **Listed (238):** forms the rules do not make. Personal pronouns ja, ty, on, ona, ono, my, vy have full tables with
  their free variants (mňa/ma, jemu/mu, …). Also čo, nikto, niečo, nič, kto (by citation). Determiners môj, tvoj,
  náš, váš, ten, tento, všetok fill every DET cell the bundle ships; the rest are listed where the course writes them.
  Numerals: jeden, dva, tri, štyri (dvaja, dvoch …). Nouns: človek (ľudia), dieťa (deti), deň (dni, dní), peniaze
  (peňazí), pani, večera (declined as ulica). Verb stems: byť (present whole; bud-, bo-, buď), ísť (id-, jd- after
  ne-, pôjd-, choď, iš-, š- after ne-), prísť, odísť, prejsť, jesť, vedieť, povedať, chcieť, môcť, pomôcť, dostať,
  pristať, pozvať, stáť, riecť; poď (poďte, poďme). Comparative stems: lep-, hor-, väč-, men-, kraj-, vyš-;
  adverbs lepšie, krajšie, bližšie, viac/najviac, menej/najmenej, ďalej/najďalej.
- **Citation cells (18):** pluralia tantum and halušky, korčule in Nom Plur; the pronouns in Nom; by in Mood=Cnd; poď in
  the 2sg imperative.
- **Pinned:** none. No rule is owed.

## Unmarked values (a7ea75a)

`unmarked: {Animacy: [Inan], Case: [Nom], Gender: [Masc], Mood: [Ind], Number: [Sing], Tense: [Pres]}`. No node
introduces any of these values. The cells they add, against a build without them:

- VERB 4 to 23: the whole present (1sg to 3pl, with the negative singulars), the 1sg future, the singular -l forms
  (m, f, n and the negatives), the 2sg command and its negative, and the nominative passive participles. Without
  them the principal parts would not ship either: their cells were dropped.
- AUX 2 to 10: byť's future (budem, budeš, bude, budeme) and its singular -l forms.
- ADJ 19 to 24: the masculine inanimate nominative and accusative singular, the nominative and genitive plural, and
  the nominative comparative.
- DET 7 to 9: the masculine inanimate nominative and accusative singular.

byť's present (som … sú) ships in no cell: it is listed whole, and paradigms.py drops a cell that no rule gives to any
lexeme of its category.

## Engine, schema and compiler changes

- **268819f feat(rules)** (schemas/language.schema.json, generated schema.ts and models.py, packages/core/src/
  lexicon/realise.ts, pipeline/src/nabu/paradigms.py, forms.py):
  - `Condition.own`: a lexeme's own values, stored in its entry or given by its language's defaults. Slovak picks a
    noun's paradigm by its gender and animacy, which no cell carries; `pos` and `class` could not say it.
  - `Realisation.free`: the other free forms of a cell, where blocking took one of several (ADR 0145; the
    pronouns' mňa/ma).
  - A phrase's word is realised alone (`word: k`): volať sa writes volám. paradigms.py counts `own` rules toward a
    category's cells.
- **2f55cc5 feat(pipeline)** (forms.py):
  - The token check accepts a lexeme's other spellings in its own form, where no rule was taken (vo, zo, so, ku
    beside v, z, s, k).
  - The pinned check compares a phrase word by word, counts a cell's free forms, and compares spellings case folded.
- **Cherry-picked:** fe8f0dd (notation with no vowel signs), cfc8b80 (`stemmed`, needed only by a7ea75a), a7ea75a
  (`unmarked`).
- Engine vectors (zz): realise/own/* (5), realise/free/both, realise/word/* (3).

## Where the rules and the course's generator differ

The course agrees with the rules on every token. Over the generator's full tables (in the library, 8,133 cells) the
rules give 7,430 cells the same. The rest:

- **338 cells:** the 13 reflexive verbs. A phrase gets no paradigm.
- **311 cells:** pronoun, determiner and numeral cells that are not listed (only what the course writes, or what the
  bundle ships).
- **54 cells where the rules follow Mistrík or the standard:**
  - Given names and nouns in -o take -ovia and -ami: Dominikovia, Rudovia, Rudami, dedkovia.
  - čašníci, v hoteli, kaviarňam, lotériám, svieť.
  - nešiel (the generator has neišiel).
  - The fleeting-vowel instrumental: otcami, lístkami, piatkami, filmami.
  - pani's panej, and večera as ulica.
  - Írska as a plural.
  - kapry against the generator's kapre: a question for the owner.

## For the owner

1. **kapor's plural:** the rules give kapry (an animal declines as a thing in the plural, as the course's notes say);
   the generator had kapre.
2. **regularised forms for missing cells:** with blocking off a class is ignored, so the defective classes give
   regularised forms for cells the lexeme lacks: 145 cells on 22 lexemes (prvší, Vianocu, musej). Should a defective
   class block like a listed form, or should those cells be kept out of `regularised`?
3. **vo, zo, so, ku:** accepted as spelled variants of v, z, s, k. A rule that reads the next word's first letters
   would say which one; it is rule debt, not pinned.
4. **Reflexive verbs and phrase nouns:** 13 reflexives, plus veľká noc and Štedrý večer, ship no paradigm. A
   phrase's paradigm could be its inflecting word's.
5. **Passive participles:** only for the three verbs whose passive the course writes (passive-ny). No transitivity
   is stored.
6. **Rules with no course lexeme:** none for possessive adjectives (otcov, matkin), hrdina, or the kosť nouns chosen
   by ending (-sť, -c, -s, -p, -v). The dub genitive in -a or -u is a lexical class.
7. **Comparatives:** the rules give bielejší (-ejší after a long syllable), but belší, with the diphthong shortened,
   may be the norm. If so, it needs a listed stem. The course writes no comparative of biely. Only the comparatives
   the course writes were checked against Mistrík.

## Not done

- No glosses for the rule ids, as for apc.
- Determiners are listed only in the cells the bundle ships, not their full declension.
- The genitive plural of a feminine in -ola (kofôl) is left to the general lengthening and was not checked.

## Sources

Mistrík, *A Grammar of Contemporary Slovak* (1988), printed pages:

| Topic | Pages |
| --- | --- |
| Sounds and soft consonants | 12–16 (soft d t n l 14; the soft set 16) |
| Nouns | 27–45: chlap 27–29, hrdina 30, dub 30–32, stroj 32–33, žena 34–36, ulica 37–38, dlaň 38–39, kosť 39, mesto 41–43, srdce 43–44, vysvedčenie 44, dievča 44–45, names 45 |
| Adjectives and comparison | 49–53 |
| Verbs | 77–94: classes 78, paradigms 79–84, irregular 85–86, the -l form 86–87, future 88, imperative 91, passive 94 |
| Adverbs | 94–97 |
| Negation | 106 |

KSSJ is used only for principal parts.
