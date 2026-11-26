# Rules in a lexicon: Modern Standard Arabic (arb), the verbs (2026-11-26)

The first language written in the merge model of [ADR 0158](../adr/0158-morphology-is-merging-lexemes.md) from the
start, so the owner can judge the rules on the grammar they know best. No course uses it: it opens in the rules
explorer from the home page in debug mode (#/lexicon/arb/rules). Every template, rule and spelling is REVIEW.
[arb-verbs.md](arb-verbs.md) has every cell of every verb (generated: `node scripts/arb-verbs.ts` in packages/core);
conformance/realise-arb.json and spell-arb.json pin 130 cells in both harnesses (`node scripts/arb-vectors.ts`, after a
reviewer has checked a change). The files were first written by a one-off generator; lexicons/arb and
profiles/arb-Arab.standard.yaml are the sources now.

## The model

- **A verb is its root, its Form and, in Form I, its vowels** (`{radicals, form, vowels: {past, present}}`): كتب I
  a/u. It has no person, tense or voice, and alone it is no word: VERB requires `VerbForm`.
- **Everything else is a lexeme merged with it** (lexicons/arb/lexemes.yaml), each bringing its values (`realises`),
  saying what it merges onto (`on`) and what the word then needs (`requires`):
  - `perf` (∅: VerbForm=Fin, Aspect=Perf; needs Person, Number), `impf` (∅: …Aspect=Imp; needs Person, Number,
    Mood), `imp` (∅: Mood=Imp, Person=2; needs Number), `ptcp` (∅: VerbForm=Part; needs Gender, Number), `pass` (∅:
    Voice=Pass);
  - the perfect's thirteen endings, each a person, gender and number at once (`perf-1sg` -tu … `perf-3fpl` -na);
  - the imperfect's prefixes (`impf-1sg` ʾa-, `impf-1pl` na-, `impf-2` ta-, `impf-3` ya-, `impf-3f` ta-: she, they
    two women), its endings (`ms` ∅, `sg` ∅ after she's ta-, `fs` -ī, `du` -ā, `mpl` -ū, `fpl` -na) and its moods
    (`ind` -u, -na after -ū and -ī, -ni after -ā, nothing after -na; `sub` -a, nothing after a long vowel, an
    unsaid alif after -ū; `jus` no vowel, the same after a long vowel).
  So يَكْتُبُونَ is ya- + katab + impf + -ū + ind; كُتِبْتُ is katab + perf + pass + -tu.
- **Stems** (language.yaml `stems`): a template per Form, root class and the word's values (a template's `feats`,
  new with this language: the passive's stem differs in the perfect and the imperfect). An imperfect stem begins with
  the prefix's vowel (ya-, yu-), which the person prefix takes. The perfect's endings that begin with a consonant
  select the `short` stem where a class has one (hollow qul-tu, doubled madad-tu); `-na` too (yaqulna is the
  shortening rule's, yamdudna the doubled short stem's).
- **Root classes**: doubled, hollow (w, y), defective (w, y), assimilated, sound; a hamza is a consonant like any other,
  and its seat is the spelling's.
- **Rules where lexemes meet** (`phonology`, in order): Form VIII's t after an emphatic (iṣṭabara) and z (izdahara);
  two hamzas (ʾaʾkulu → ʾākulu); the defective verbs' contractions (ramaya → ramā, ramayat → ramat, ramayū → ramaw,
  laqiyū → laqū, yarmiyu → yarmī, yarmiyū → yarmūna, the jussive's yarmi, a w after i as y: duʿiya); a long vowel
  shortened in a closed syllable (yaqul, qul, aqim, yakhtar); n or t with no vowel before the same consonant doubled
  (ẓananna); a doubled radical with no vowel after it takes a (yamudda).

## The spelling (profiles/arb-Arab.standard.yaml)

The standard spelling (no marks) and a vocalized layer, both from the lexical form: hamza on its seat (at the start
أ or إ; at the end the seat of the vowel before, none after a sukun or a long vowel; inside, the stronger of its own
vowel and the one before, i over u over a; after a long a with its own a on the line: tasāʾala), ءَا as a madda where
the hamza would sit on an alif, the plural's unsaid alif, and a diphthong's sukun.

## For the owner

1. **Doubled jussive and imperative**: yamudda, mudda (the rule arb-doubled), where yamdud, umdud are also standard.
2. **Hamza before -ū**: قرؤوا, يقرؤون (the Academy's spelling), where قرأوا, يقرأون are common.
3. **The prothetic alif**: written with its vowel in the vocalized layer (اُكْتُبْ, اِسْتَقْبَلَ), not as a wasla.
4. **ta- twice**: you (any number) and she or they two women are two lexemes (`impf-2`, `impf-3f`), as a learner
   meets them; and zero morphemes for the masculine singular (`ms`) and she's number (`sg`), so every requirement is
   met by a lexeme.
5. **Gender is not required** of a finite verb: the first person and the dual say none.
6. **What is listed**: akala's imperative kul (akhadha's khudh and amara's mur when they are added).
7. **Not built yet**: nouns and adjectives (case, the three states, the dual and sound plurals, diptotes, the feminine
   -a), so a participle is still incomplete (it needs Gender and Number, then Case and Definite); the pronoun suffixes
   and the clitics (wa-, fa-, bi-, li-, sa-, the article); Form IX and the quadriliterals; the verbal nouns.
