# Rules in a lexicon: Modern Standard Arabic (arb) (2026-11-26)

The first language written in the merge model of [ADR 0158](../adr/0158-morphology-is-merging-lexemes.md) from the
start, so the owner can judge the rules on the grammar they know best. No course uses it: it opens in the rules
explorer from the home page in debug mode (#/lexicon/arb/rules). Every template, rule and spelling is REVIEW.
[arb-verbs.md](arb-verbs.md) has every cell of every verb and [arb-nominals.md](arb-nominals.md) every cell of every
noun, adjective and name, with the pronoun suffixes and the proclitics (generated: `node scripts/arb-verbs.ts` and
`node scripts/arb-nominals.ts` in packages/core); conformance/realise-arb.json and spell-arb.json pin 182 tokens in both
harnesses (`node scripts/arb-vectors.ts`, after a reviewer has checked a change). The files were first written by a one-off generator; lexicons/arb and
profiles/arb-Arab.standard.yaml are the sources now.

## The model

- **A verb is its root, its Form and, in Form I, its vowels** (`{radicals, form, vowels: {past, present}}`): كتب I
  a/u. It has no person, tense or voice, and alone it is no word: VERB requires `VerbForm`.
- **Everything else is a lexeme merged with it** (lexicons/arb/lexemes.yaml), each bringing its values (`realises`),
  saying what it merges onto and on which side (`on`, `at`: the person prefixes and the proclitics before, the rest
  after) and what the word then needs (`requires`); merged outward from the base, each onto the word as it stands,
  so what each merges onto is the order (a mood `needs` a Number, a case a Number, a state a Case, a number a Gender;
  a pronoun suffix and a proclitic only onto a `complete` word):
  - the perfect's thirteen endings, each bringing the perfect (VerbForm=Fin, Aspect=Perf) with a person, gender and
    number at once (`perf-1sg` -tu … `perf-3fpl` -na), on the perfect stem;
  - the imperfect's five prefixes, each bringing the imperfect (VerbForm=Fin, Aspect=Imp) with its person (`impf-1sg`
    ʾa-, `impf-1pl` na-, `impf-2` ta-, `impf-3` ya-, `impf-3f` ta-: she, they two women) and requiring a mood, and a
    number where it brings none; on the imperfect stem. Then its endings (`ms` ∅, `sg` ∅ after she's ta-, `fs` -ī,
    `du` -ā, `mpl` -ū, `fpl` -na) and its moods (`ind` -u, -na after -ū and -ī, -ni after -ā, nothing after -na;
    `sub` -a, nothing after a long vowel, an unsaid alif after -ū; `jus` no vowel, the same after a long vowel);
  - `imp` (∅: Mood=Imp, Person=2; needs Number), the verb's one null lexeme for its tense and mood (the owner,
    2026-11-26/27): no prefix where the imperfect has one, on the command stem, the jussive without its prefix;
  - `ptcp` (∅: VerbForm=Part; needs Gender, Number, Case, Definite: a pattern with no sound of its own) and `pass` (∅:
    Voice=Pass).
  So يَكْتُبُونَ is ya- + katab + -ū + ind; كُتِبْتُ is katab + pass + -tu; اُكْتُبْ is katab + imp + ms.
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

## Nouns, adjectives and names

- **A noun is its stem and its own gender** (كِتَاب Masc; سَيَّارَة Fem); one that takes either (muʿallim, ṭālib)
  stores none and `chooses` it. An adjective stores none. A name stores its gender and its number. NOUN requires
  Number, Case and Definite; ADJ Gender too; a name Case and Definite; a participle (a verb's `ptcp`) all four.
- **Lexemes**: `masc` ∅, `fem` -a(t) ة; `sing` ∅, `dual` (its case in it: -āni, -ayni; -ā, -ay in the construct
  state), `mpl-sound` (-ūna, -īna; -ū, -ī), `fpl-sound` -āt, `pl` ∅ (a broken plural: the word's listed plural
  stands for it, kutub); `nom` -u, `acc` -a, `gen` -i; `indef` (tanwīn: the case vowel doubled, -an with its alif
  but after ة and ءا), `al` the article, `cons` the construct state ∅. A word's own values count: no feminine onto
  a feminine noun (`twice`).
- **What the allomorphs say** (a condition's `with`, new with this language: the token writes that lexeme): no case
  vowel after the dual's or the sound plural's ending; the feminine plural's accusative is its genitive (and a listed
  plural in -āt, class `plural-at`: banātin); a diptote (class `diptote`, or `diptote-plural` for a broken plural
  like madāris) has no tanwīn and an indefinite genitive in -a; -ī "my" takes the case vowel's place.
- **Rules**: the article's l doubled into a sun letter (ash-shams), its alif unsaid after a proclitic (bi-l-bayt) and
  unwritten after li- (li-l-bayt; li-l-lugha with one l between them); the feminine's ة gone before -āt and t before
  any other ending (sayyāratuhu); -āʾ's hamza w before the dual and the feminine plural (ṣaḥrāwāni, samāwāt); the
  defective nouns (qāḍin, al-qāḍī, qāḍiyan; maʿnan, al-maʿnā); -ī after the dual's and the plural's endings
  (kitābāya, kitābayya, muʿallimiyya).

## Pronoun suffixes and proclitics

- **Of nouns and prepositions** (`poss-1sg` … `poss-3fpl`: whose) and **of verbs** (`obj-1sg` … `obj-3fpl`: whom),
  each a lexeme bringing `Person[psor]` or `Person[obj]` with its number and gender. -hu, -humā, -hum, -hunna are
  -hi … after i, ī or ay (fīhi, ʿalayhi, kitābihi, yarmīhi); -ī is -nī after min and ʿan (minnī), and on verbs
  (katabanī). A possessed noun is in the construct state (`cons`).
- **Rules**: li- before a suffix is la- (lahu, but lī); ʿalā and ilā end in ay before one (ʿalayhi); the plural's
  unsaid alif goes before an object suffix (katabūhu), and -tum is -tumū (katabtumūhu); a defective verb's long
  vowel before a suffix (yarmīhi).
- **Proclitics** (lexemes of the token, before its base): bi-, li-, ka- (onto a genitive), wa-, fa-, sa- (onto an
  imperfect indicative: sayaktubu).
- **Free words**: the independent and demonstrative pronouns (ʾanā … hāʾulāʾi), the relatives (alladhī, allatī),
  the prepositions fī, min, ʿan, ʿalā, ilā, maʿa, ʿinda, the particles lā, lam, lan, qad: complete alone.

## The spelling (profiles/arb-Arab.standard.yaml)

The standard spelling (no marks) and a vocalized layer, both from the lexical form: hamza on its seat (at the start
أ or إ; at the end the seat of the vowel before, none after a sukun or a long vowel; inside, the stronger of its own
vowel and the one before, i over u over a; after a long a with its own a on the line: tasāʾala), ءَا as a madda where
the hamza would sit on an alif, the plural's unsaid alif, and a diphthong's sukun. A final hamza after a long vowel or
a sukun is on the line whatever its case vowel (ḥamrāʾu, samāʾi); the tanwīn signs are kept in the vocalized layer.

## For the owner

1. **Doubled jussive and imperative**: yamudda, mudda (the rule arb-doubled), where yamdud, umdud are also standard.
2. **Hamza before -ū**: قرؤوا, يقرؤون (the Academy's spelling), where قرأوا, يقرأون are common.
3. **The prothetic alif**: written with its vowel in the vocalized layer (اُكْتُبْ, اِسْتَقْبَلَ), not as a wasla.
4. **ta- twice**: you (any number) and she or they two women are two lexemes (`impf-2`, `impf-3f`), as a learner
   meets them; and zero morphemes for the masculine singular (`ms`) and she's number (`sg`), so every requirement is
   met by a lexeme.
5. **Gender is not required** of a finite verb: the first person and the dual say none.
6. **What is listed**: akala's imperative kul (akhadha's khudh and amara's mur when they are added); each broken
   plural, and a colour adjective's feminine (ḥamrāʾ) and an elative's (kubrā).
7. **The article as a lexeme** (`al`, the definite state) and the construct state as a zero lexeme (`cons`), which a
   possessed noun needs beside its suffix: or should a pronoun suffix bring the construct state itself?
8. **Diptotes by class**: a word's class says it (`diptote`, `diptote-plural` for its broken plural), not its shape
   (mafāʿil): the shape would need no class, at the cost of a pattern that also matches words that are not.
9. **Pronoun suffixes' features**: `Person[psor]` and `Person[obj]` (UD has the first; the second is ours).
10. **wa- and fa- beside sa- or bi-**: all four merge onto a complete word, so nothing says which is outermost;
    the explorer writes them as picked, and the engine takes sa-wa-yaktubu as well as wa-sa-yaktubu. A conjunction
    taking a phrase where the others take a word would say it.
11. **Not built yet**: the five nouns (ʾabū, ʾakhū), the dual and plural of -ā nouns beyond the sound endings
    (maʿānin), the numbers, Form IX and the quadriliterals, the verbal nouns, the article's wasla after a word ending
    in a vowel (fī l-bayt: one word apart, the spelling's).
