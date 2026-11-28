# Rules in a lexicon: chg (Chaghatay), stages 1 to 4 as built (2026-11-25; the form Schluessel's reading since 2026-11-28)

chg through the stages of [docs/rules-design.md](../rules-design.md), as apc went through them. Every rule,
allomorph condition and spelling rule is REVIEW. S is Schluessel, *An Introduction to Chaghatay* (2018), by section
and book page (PDF page = book page + 35; the Arabic checked on page images where cited from it).

## The form is Schluessel's reading (2026-11-28)

The owner (2026-11-28): the form "should actually be Schluessel, because it's annotated in a way that reflects the
consonantal spelling distinction, and greater vowel distinctions than the Arabic spelling", "any distinction in the
Arab but not in the Latn" stored "with some additional diacritics", and a mark in the Latin for the half-space. So a
lexeme's form is his reading (ṭ ṣ s̱ ẓ ż ḥ ʿ ẕ keep the Arabic's consonants apart, ṗ is the ف written for p) with
signs for what only the Arabic writes, and both orthographies are spelled from it: chg-Arab/standard's `spell` (73
rules) gives the scribes' letters, chg-Latn/schluessel's (18) the reading every token pins. Until then the form was
the Arabic spelling, and this file argued that a reading could not give the scribes' spelling back (vowels written or
left out word by word, ث س ص for s, the suffixes' spellings that do not follow the sound). The signs answer it: every
place the Arabic departs from a default is marked in the form, and a scribe's other spelling of a suffix is a free
allomorph.

**What the Arabic writes by default** (each REVIEW): consonants by their letters, a double once inside a morpheme and
twice across a boundary (once free), ŋg as نک; in a stem short a, ä, e and i unwritten, o ö u ü written و, long vowels
written; a stem's last a, ä or e as ە (the he of Schluessel's typescript, which joins nothing after it: a half-space
before a suffix), its last i as ی; a word's first vowel on its alif (ا, آ for ā, ای, او); every vowel of a suffix.

**The signs**, each a combining mark no Latin letter composes with (NFC keeps it apart; `notation.order` sorts them):

| Sign | Says | Lemma forms | E.g. |
|---|---|---|---|
| U+0329 ̩ | a vowel written where the default leaves it out (a ا, ä e i ی), a stem's last vowel written ا or ی for the he, a double written twice | 126 | na̩n نان, qara̩ قرا |
| U+0326 ̦ | a vowel (or a consonant) not written where the default writes it | 42 | wä̦ و, u̦l̸d̦-Dīn الدین |
| U+0334 ̴ | an initial a written آ | 8 | a̴ṭ آط |
| U+0324 ̤ | a letter written as its twin (ب for p, پ b, ج č, چ j, گ g k, د t, ت d, ژ z) | 4 | b̤iz پز, the converb's -p̤ ب |
| U+032F ̯ | a or ä written ی | 2 | yä̯tti ییتی, Mūsa̯ موسی |
| U+0338 ̸ | a letter written and not said, its Latin letter naming the Arabic one (i ی, a ا, u و, h ه, l ل, ʾ a hamza above) | 1 | šahaͤri̸ شهری (an allomorph) |
| U+0359 ͙, U+035B ͛ | a shadda; a damma | | jabb͙ār جبّار, sü͛y سُوی |
| · (U+00B7) | the half-space (ZWNJ), in the reading too | | širin·dur (شیرین, the half-space, دور) |

And two the Latin alone reads: ï, a back i (Schluessel writes i: qï̩z), and U+0364 or U+0363 on a vowel whose
harmony is not what it looks (šahaͤr, front: šahargä): 11 stems carry one, each from its tokens' suffixes.

**Suffixes** are written in archiphonemes the statements resolve: A (a/ä), U (u/ü), D (d/t), G (ǧ/g/q/k), K (q/k), by
harmony (the stem's last full vowel; i is neutral) and voicing (after a voiceless consonant) in the Latin, and in the
Arabic one letter (ە at a suffix's end; غ after a back stem, ک after a front one); Ğ is the dative's, غ in the Arabic
whatever the harmony (S 3.3.3), ǧ g q k in the Latin. Where Schluessel's reading follows the scribe's letter instead
(barduq باردوق, a back -duq after a front stem; öydä written اویدا), the suffix's other spellings are free allomorphs
in plain letters (dA, di, du, kAn, gA, Du before -K), so the Arabic and the reading both come out as the course has
them. A rule that gives one of them gives the other: the reading's half-space is where the Arabic's is.

**The readings that changed** (no Arabic did): 129 took a · where the Arabic has a half-space (širin·dur, mewä·si),
and two had a hyphen for it (bē-iḫtiyār, now bē·iḫtiyār); six that had ṗ where the Arabic writes پ have p (qopup ×4,
Čapan, pišürdi: ṗ is ف), for a reviewer to check against the book. One differs from what its form spells:
ḥaqqgä حقغه (s.18.30), where the rules give ḥaqqkä (the dative after a voiceless consonant, S 3.3.3). It stays
Schluessel's, and `form.reading` names it.

**The check.** The compiler realises every token and spells its form in the Arabic (`form.unaccounted`, an error, as
before) and in the reading's Latin against the token's pinned reading (`form.reading`, a warning: a token whose
scheme's `latin` orthography states `spell`; only Schluessel's does). All 2,690 tokens' Arabic, and 2,689 readings.

## What there is

- **No realisation rules.** chg's tokens choose no feature values: every suffix is an affix lexeme of its own in
  the token's `lexemes` (ADR 0128 amendment). `realisation` is absent. Since 2026-11-28 chg merges lexemes (below):
  a cell is realised through the lexemes that bring it, so there are cells and paradigms but still no pinned or
  listed forms.
- **Allomorphs with conditions** (lexemes.yaml): 341, 178 of them free. Affixes: each in archiphonemes, with the
  scribes' other spellings free (written in plain letters where the reading follows the letter, or with a leading ·
  where a half-space stands before it). Stems: each verb's stem before a suffix (its lemma without the hyphen);
  oǧul and köŋül before a vowel letter (S 4.5, p. 24); su's suy before -i (S 3.3.5, p. 16); bu's mun-, ul's a-, män's
  and sän's ma-, sa- before the dative's ŋa (S 10.13, p. 85); a lemma's other spellings, and Latin-only variants
  where the tokens read it otherwise (süy, kel), free.
- **Free allomorphs** (`free: true`, new): a writer's other form where its conditions hold; never the one chosen.
  A token's realisation gives each combination as an alternative, the token's other allomorphs chosen again around
  it. They state Schluessel's "sometimes" and the scribes' variation: the locative ده, free دا and ته after a
  voiceless consonant (S 3.3.1, p. 13); the dative غه, free که غا کا and قه after a voiceless consonant (S 3.3.3);
  -duq, free -dük (S 6.3.1, p. 36: "a scribe's choice … entirely random"); the copula -dur, free -tur after a
  voiceless consonant (S 11.3, p. 92, Babur's); -ǧan/-gän, -ǧay/-gäy, -liq/-lik/-liǧ, -ǧil/-gil, -ǧač/-gäč: one
  spelling chosen, the others free.
- **One rewrite**: `rule:chg-stem`, the citation hyphen not written in a word (a stem before a suffix, the bare
  imperative käl!, s.03.40; S 12.4, p. 109).
- **chg-Arab/standard's `spell`** (`boundaries: true`): 73 rules, in order: a suffix's archiphonemes (the dative's
  غ, G by harmony and voicing, K, D, A, U); harmony's signs dropped; a name's capitals; a double across a boundary
  twice, or once (free); consonants by their letters, a double once inside a morpheme, ŋg as نک; a letter written and
  not said, a twin, a shadda, a damma; hamza seats; a word's first vowel on its alif (after a half-space or a hyphen
  too); long vowels; a stem's last vowel (ە, ی, or as its sign says); the vowels inside a word; the half-space after a
  vowel he before a suffix (S xxx, rule 3: the he never joins), one where the suffix brings its own; the signs
  dropped. Its 73 vectors (conformance/spell-chg.json) each take a course word the rule is needed for, or say that
  the word is constructed (ten rules no course word needs: bäkkä, yollar, Mūsa …).
- **chg-Latn/schluessel's `spell`**: 18 rules: the archiphonemes by harmony (the stem's last full vowel, i neutral)
  and voicing; the half-space after a vowel he before a suffix; a letter written and not said dropped; the signs
  dropped; ï as i.
- **Defaults where Schluessel gives none** follow the course's commonest in that context: the aorist -ar after a
  voiceless consonant (11 of 11), -ur elsewhere (29 of 30; S 10.7, p. 79: "a matter of preference or dialect"); G by
  harmony in the Arabic, غ after a back stem and ک after a front one (every -GAn, -GAy, -GAli and -GAč the course
  writes but one); D as t after a voiceless consonant (the past: 31 of 34; the locative: 6 of 7; S 6.3.1, p. 37:
  "sometimes"); the copula -dur after a half-space but after a letter that joins nothing (47 of 53), and joined after
  it; the copula -dur after a voiceless consonant too (18 of 25). Since the forms became the reading, the paradigms'
  unwritten cells follow these (a back stem's -ǧay غای where the old default was کای everywhere).

## Derived words are lexemes of their own (2026-11-28)

The owner (2026-11-28): a derived word is "a lexeme of its own, since the meaning of the new word isn't 100%
extractable from the root lexemes. That's the general rule." The course wrote 20 derived words as a base and a
derivational suffix in the token (qoy + -či); each is now one lexeme, its token writing it alone or with its
inflections (قویچینینک: qoychi + gen). The lexemes, with their sentences' glosses (all REVIEW):

- ordinals (ADJ, NumType=Ord; `ord`): ikkinchi "second", bashinchi "fifth", tortunchi "fourth";
- -liq/-lik (`liq`): aywanliq "with a portico", atligh "named", yarlik "from (a place)", bukharalik, samarqandlik,
  ghurraliq "spotted" (ADJ); ahangarlik "blacksmithing" (NOUN, S's glossary), yaghachchilik "carpentry" (from
  yaghachchi);
- -či (`ci`): qoychi "shepherd", kemachi "boatman", yaghachchi "carpenter"; -čülük (`cilik`): kunchuluk "a day's";
- -ī (`nisba`): shahari "city person", bazari "market person" (NOUN: bāzārīsida takes a possessive and a case),
  janubi "southern" (ADJ); -daki (`daki`): jangaldaqi "in the wilderness"; -la (`la`): awla- "to hunt".

Each records what it is made of (`base`, `pattern`: the suffix's lexeme, which stays in the lexicon as a pattern no
token writes). Its form is what the rules realise for the old base and suffix, the boundary kept (ke̩mä+či spells
the half-space after its he); any other form the course writes is a free allomorph (yaǧa̩čči, the double written
once). The generator realised every one of the 55 occurrences and found the surface among its
spellings; the token check gives all 2,689 tokens as before. The borderline choices: the ordinals, -daki and the
place-name -lik are counted as derivation here (each makes a word of another part of speech).

## chg merges lexemes (ADR 0158; 2026-11-28)

chg is the second course language in the merge model, after apc. Its suffixes were lexemes already (each with its
letters in the token); what changed is that each now says what it merges onto, a word says what it requires, and the
cells nothing writes are zero lexemes, so every base has all its cells (the owner: "Every base lexeme should have all
cells filled, that's the whole point of inflectional vs. derivational"). Every line is REVIEW.

**What a word requires** (language.yaml `requires`): a noun, a name or a pronoun a case; a verb a form (VerbForm: a
finite tense or mood, a converb, a participle); a finite tense a person. emäs, turur and ikän never inflect
(`requires: []`).

**The zeros**: `nom`, the nominative (S 3.3.6: "unmarked in Chaghatay"); `p3`, a finite verb's third person (bardi,
barur, barmiš: S 5.2.1, 6.3.2); `imp.sg`, the bare stem as the imperative to one (S 12.4: käl! "come!", the one
sentence added, s.03.40, so that the present's first sentence brings in two new lexemes, not three). A bare
noun is the nominative without a number: -lar is the plural, and a noun without it is unmarked for number (Turkic's
general number: üč kün "three days").

**The order** (each lexeme's `on`; S 3.4, p. 20: "stem + plural + possessive + case"): the plural before a
possessive or a case (`lacks: [Case, Person[psor]]`), the possessive before a case and once, onto a pronoun only as
öz (özüm, özimiz), a case onto a nominal or a participle; the passive, then the negative, then one tense, mood or
non-finite form (`lacks` the values the others bring; the aorist never after the negative, whose aorist is -mas),
then the person: the present's, the future's, a reported past's and a participle's set (-män, -miz, -siz,
-sän, -sizlär), the past's and the conditional's (-m, -q, -ŋiz, -ŋ, -ŋlar), the present's -dur, or the zero; -lar
after a third person for "they". -mu anywhere after the stem (before or after the person: mullāmusiz, yigitmänmu); -kä
and the ezafe onto a whole word.

**Two splits the reference makes** (S 5.2.1, p. 28: "the personal suffix -dur here works a little differently from the
-dur that means 'is/are' … It cannot be replaced with emäs"):

- the present-future's -dur is its third person (`p3.dur`: baradur, baradurlar), apart from the copula -dur (`dur`:
  čay issiqdur);
- on a predicate (Türkmän, mullāsiz, ikändurlar) the person is the copula's, a word of its own (`cop.1s`, `cop.1p`,
  `cop.2`, `cop.2s`, `cop.2pl`, `cop.3pl`: UD's AUX, its own features); on a verb it is the verb's (p1s …). A noun
  never takes a person's values. The copula's they is -durlar, one suffix as S's table gives it (-dur(lar)).

And two of the course's segmentations were read again: -iŋizlar after a noun is the possessive your (of several, or
with respect: `poss2pl`; S 6.1 gives the 2nd plural as -Vŋlar), pādišāhiŋizlar "your king", never -iŋiz with the
noun's plural; the aorist with a case after it is its participle (`aor.ptcp`: alurda "while taking").

**The tokens** list the zeros (`{lexeme: nom}`, `{lexeme: p3}`: no surface; the compiler folds them into the base's
values, given, never a part: no node introduces a chg value). A converter wrote them: 1,048 noun, name and pronoun
tokens took `nom`, 283 finite verbs `p3`, 41 present -dur became `p3.dur`, 12 predicates' persons the copula's, 2
aorists the participle, 4 -iŋizlar the possessive. Every token gives the same surface (the token check: all 2,690
given); every token's lexemes, picked in any order, merge back into the order it writes them
(packages/core/test/merge-order.test.ts).

**What ships.** The bundle has chg's cells and paradigms (312 lexemes: a noun's 26 cells, case by possessor by
plural; a verb's 59), a noun, a name or a pronoun cited in the nominative (`citation`). language.yaml's `labels` name
each cell for the gloss dialog and the Data page ("past (-di): I", "plural, his, her, its, their, accusative"), built
from Schluessel's terms: REVIEW, every one. The lexicon bundle grew from 426 to 689 KB.

## Counts

Since the forms became the reading (2026-11-28; the counts of 2026-11-25 are in the file's history):

- 484 lexemes: 417 with a form of their own, 236 of them with no sign (the reading as it is), 126 with a vowel written
  where the default leaves it out, 42 with one left out; 67 written only as allomorphs (`nabu forms` prints them "no
  form"). 572 spellings checked (`form.projection`), 0 mismatched.
- **2,690 tokens** (sentences and story lines, one orthography): 2,488 given by the forms the rules choose, 202 by a
  free variant, 0 by a pinned or listed form, **0 unaccounted**; 2,689 readings as their forms spell them (1
  `form.reading`).
- The bundle changed with the readings (the half-spaces) and with the paradigms' unwritten cells (the defaults above);
  nothing ships of forms, rules or `spell`.
- Vectors, made by a script from the course (regenerated, never edited by hand): conformance/realise-chg.json 294 (7
  on an invented language; 287 chg, one per allomorph a token of the course needs, found by taking the allomorph out
  and seeing the token change (a free one: its alternatives), plus `rule:chg-stem`); conformance/spell-chg.json 95 (4
  on an invented profile; 73 for the Arabic's rules, 18 for the Latin's, each on the first course word the rule is
  needed for, else the first it fires on, else a constructed word).

## Engine changes (each its own commit, additive; apc's realisations, vectors and bundle unchanged)

- **`spell` may keep boundaries** (`Spell.boundaries`, orthography-profile.schema.json; spell.ts): a realised
  form's `+` stays for the statement's rules and is dropped after them. An orthography that writes where a suffix
  joins states it as spelling. Without the key, boundaries are dropped first, as before.
- **Free allomorphs** (`Allomorph.free`, lexicon.schema.json; realise.ts `Realisation.alternatives`): never chosen;
  each that holds gives the token an alternative, every combination (at most 256), each through the rewrites.
  forms.py's token check spells the alternatives too (a token is given where the chosen form or a free variant
  spells as written), `TokenCheck.variant`, and `nabu forms` counts and lists them.
- **A free variant's token chooses its other allomorphs again around it** (realise.ts): the scribe's ay- for eyt-
  takes -di after its y, not the -ti chosen after eyt-'s t; without it an alternative could be a form no writer
  writes (ičdiq).
- **A zero is no neighbour** (realise.ts, 2026-11-28): an allomorph's `before` (and a free variant's) reads the next
  piece that writes something, or the next word's base where none does: šajarahʾ̸ before nom's zero and the ezafe
  (conformance realise/merge/zero-transparent).
- Taken from the coordinator: fe8f0dd (a notation with no vowel signs; `spell` with no rules) and b5f834a (the token
  check for a language with a notation and no rules).

## Where the course and the rules differ

No token, spelling, lemma, reading or accept set changed. Seven allomorphs keep their spellings only: the course
splits a token otherwise than the rules do, the token's text the same (an eighth, yaǧačči's یغا, went with the
derived words: yaghachchi is one lexeme now).
- maŋa, saŋa: the course م + نکا, س + نکا; the rules من + کا (the dative after the pronoun's n, نک writing ŋ: S
  10.13, p. 85, منکا, مانکا).
- saliptur: the course سالیب + تور; the rules سال + یب+تور (the narrative past is -ip + -tur, S 11.5, p. 93).
- šajarah-i: the course شجرهٔ + (ezafe, empty); the rules شجرە + the ezafe's hamza.
- süyi written سُوی: the course سُو + یی; the rules سوي + ی with one ye.

## For the owner

1. **Harmony** (answered by the reading-based form, 2026-11-28): a stem's harmony is read from its last full vowel,
   and a sign marks the 11 stems whose suffixes go the other way (šahaͤr: šahargä). Each sign came from the stem's
   tokens; a stem with no harmonic suffix in the course has none, so its harmony is a guess from its vowels.
2. **The signs** (the table above): each sign and the default it departs from is REVIEW, and so is which Arabic
   departures are the form's (a sign) and which a scribe's other spelling (a free allomorph). ە and ي of the old
   notation are gone: a stem's last vowel is ە by default, and y is y.
3. **ḥaqqgä** (s.18.30): Schluessel reads the dative after ḥaqq voiced; the rules give ḥaqqkä. A misprint, or a
   reading to keep (a free allomorph of the dative for it)?
4. **The six ṗ readings** changed to p where the Arabic writes پ (qopup, Čapan, pišürdi): check against the book.
5. **The seven segmentations** above: keep the course's parts, or align them with the rules (no text changes)?
6. **näččändä** (نچنده, 3 tokens) is written as the lexeme näččä alone; it reads as näččä + -n- + -dä (S 12.7,
   p. 111, the epenthetic n). A free allomorph meanwhile.
7. **Half-space defaults.** h before a consonant after a half-space (S xxx, rule 4) against the course's sentences
   (پادشاهنینک joined): joined, the half-space free. The copula after a half-space (47 of 53), the present's -aydur
   joined. The defaults are what the paradigms show for the cells no token writes.
8. **Defaults by the course's frequency** (above) where Schluessel says the choice is free: confirm, or take one of
   his spellings as the norm everywhere.

## Not done

- The 22 verbs whose stem allomorph no condition reads in the course (vowel-final, voiceless or rounded stems are
  covered) have no vector of their own.
- Rounded stems with two consonants after the و take -up, -üp only where the course has one (-ünči: tört); -duŋ,
  -duŋlar, -l- after a vowel, the ezafe's -ye after a vowel: stated in notes, not written as allomorphs (no token).
- Glosses for `rule:chg-stem`; a branch memory (stage 5) has nothing to key in chg until its rules have branches.
