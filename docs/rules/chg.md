# Rules in a lexicon: chg (Chaghatay), stages 1 to 4 as built (2026-11-25)

chg through the stages of [docs/rules-design.md](../rules-design.md), as apc went through them. Every rule,
allomorph condition and spelling rule is REVIEW. S is Schluessel, *An Introduction to Chaghatay* (2018), by section
and book page (PDF page = book page + 35; the Arabic checked on page images where cited from it).

## What a lexical form is here

**The Arabic spelling**: the lexeme's first chg-Arab/standard spelling, the scribes' letters as the lexicon writes
the word, with three signs of the notation's own (`lexicons/chg/language.yaml`):

- **ە** (U+06D5) for a final he that writes a vowel (-a, -ä, -e): the letter of Schluessel's typescript, which
  joins nothing after it (S xxx, rule 3). 36 forms (میوە, التە). A final he that writes h stays ه (پادشاه, شاه,
  درکاه).
- **ي** (U+064A) for a final ye that writes the consonant y: 7 forms (اوي öy, چاي čay, قوي- qoy-). No orthography
  writes it: chg-Arab/standard spells it ی.
- **the hyphen** of a stem cited bare: 59 verbs (ال- al-), their lemma as the lexicon spells it.

Why not a phonemic form close to Schluessel's reading, with the Arabic spelled from it: the reading cannot give the
scribes' spelling back (vowels written or left out word by word, کشی and ایکی; ث س ص for s; پ or ف for p, a
lemma's other spellings), so every lemma would be pinned; and the scribes' suffix spellings do not follow the sound
(S 3.3.3, p. 14-15: the dative غه "regardless of vowel harmony", "the scribe's choice of written suffix may have no
relationship to how it would sound"; xxxi: "it is not necessarily the case that certain consonants mark a vowel as
front or back"). Harmony, voicing and rounding are in the reading every token pins; the rules here are the script's.

## What there is

- **No realisation rules.** chg's tokens choose no feature values: every suffix is an affix lexeme of its own in
  the token's `lexemes` (ADR 0128 amendment). `realisation` is absent. Since 2026-11-28 chg merges lexemes (below):
  a cell is realised through the lexemes that bring it, so there are cells and paradigms but still no pinned or
  listed forms.
- **Allomorphs with conditions** (lexemes.yaml): 247 with a form. Affixes (the 51, and dur, ezafe, ke, q): 84 the
  rules choose (29 by a condition), 38 free. Stems: 65 chosen by a condition (each verb's stem before a suffix, its
  lemma without the hyphen; oǧul and köŋül before a vowel letter, S 4.5, p. 24; su's سوي before -i, S 3.3.5, p. 16;
  bu's mun-, ul's a- before a case, S 10.13, p. 85), 60 free (25 scribal spellings the course writes, 21 a lemma's
  other spellings from its `spelled`, 14 other forms: bilän, ermäs, te-, ay-, näččändä, šahargä's شهری …).
- **Free allomorphs** (`free: true`, new): a writer's other form where its conditions hold; never the one chosen.
  A token's realisation gives each combination as an alternative, the token's other allomorphs chosen again around
  it. They state Schluessel's "sometimes" and the scribes' variation: the locative ده, free دا and ته after a
  voiceless consonant (S 3.3.1, p. 13); the dative غه, free که غا کا and قه after a voiceless consonant (S 3.3.3);
  -duq, free -dük (S 6.3.1, p. 36: "a scribe's choice … entirely random"); the copula -dur, free -tur after a
  voiceless consonant (S 11.3, p. 92, Babur's); -ǧan/-gän, -ǧay/-gäy, -liq/-lik/-liǧ, -ǧil/-gil, -ǧač/-gäč: one
  spelling chosen, the others free.
- **One rewrite**: `rule:chg-stem`, the citation hyphen not written where no suffix follows (a bare imperative,
  S 12.4, p. 109). No token of the course is a bare verb; its vector is constructed.
- **chg-Arab/standard's `spell`** (`boundaries: true`, new): the letters as they are, and where a suffix joins.
  11 rules, in order: the ezafe's hamza on a final vowel he (شجرهٔ, S 10.4, p. 77); a suffix after a vowel he after a
  half-space (S xxx, rule 3); ە as ه; y and the -i after it, or one ye (سویی, سُوی); ي as ی; h before a consonant
  after a half-space, or joined (S xxx, rule 4; the course's sentences join it); two l's apart (S xxx, rule 2;
  constructed: no word of the course); čč and tt across a boundary, or once (یغاچی, ایتیکه: the scheme's double
  written once); the copula after a joining letter after a half-space, or joined; any other suffix after a joining
  letter joined, or after a half-space (S xxx, rule 5: "difficult to predict"). After a letter that joins nothing
  the boundary is dropped: the course never writes a half-space there.
- **Defaults where Schluessel gives none** follow the course's commonest in that context: the aorist -ar after a
  voiceless consonant (11 of 11), -ur elsewhere (29 of 30; S 10.7, p. 79: "a matter of preference or dialect");
  -ǧan/-gän کان, -ǧay کای, -liq لیک, -ǧač غاج; the past -ti after a voiceless consonant (the course always, S 6.3.1,
  p. 37: "sometimes"); the copula -dur after a voiceless consonant too (18 of 25).

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
token writes). Its form is what the rules realise for the old base and suffix, the boundary kept (کیمە+چی spells
the half-space after its he, یغاچ+چی the double written once); any other form the course writes is a free allomorph
(بیش+ینجی, ات+لیغ, او+لا). The generator realised every one of the 55 occurrences and found the surface among its
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

- 452 lexemes: 397 with a form of their own; 55 written only as allomorphs (`nabu forms` prints them "no form").
  642 spellings checked (`form.projection`), 0 mismatched.
- **2,689 tokens** (sentences and story lines, one orthography): 2,481 given by the forms the rules choose, 208 by a
  free variant, 0 by a pinned or listed form, **0 unaccounted**.
- The bundle is byte for byte what it was (manifest 321b6b84…): nothing ships of forms, rules or `spell`, and no
  paradigm (no cells), so `form.spelling-script` has nothing to check and the lexicon file is unchanged. The compile
  takes about 0.3 s more (7.1 s).
- Vectors: conformance/realise-chg.json 233 (7 on an invented language; 226 chg, one per allomorph a token of the
  course exercises, found by taking the allomorph out and seeing the token change, plus `rule:chg-stem`);
  conformance/spell-chg.json 25 (4 on an invented profile; 21 chg, each rule of the statement from course words).

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

1. **Harmony.** A stem's harmony is lexical (S xxxi: "from a dictionary"). Where the course's spelling follows it
   (-ǧan/-gän, -ǧay/-gäy, -liq/-lik, -q/-k, -ǧil/-gil: about 80 tokens) the rules choose one spelling and the other
   is free. A class per stem (back, front; from its reading), and an allomorph condition that reads the token's
   base class (a small engine key), would make the harmonic spelling the rule's. Wanted?
2. **The notation's ە and ي.** ە is Schluessel's own letter; ي writes nothing in any orthography (it tells a
   consonant y at a stem's end from a vowel). Keep, or mark y another way?
3. **The seven segmentations** above: keep the course's parts, or align them with the rules (no text changes)?
4. **näččändä** (نچنده, 3 tokens) is written as the lexeme näččä alone; it reads as näččä + -n- + -dä (S 12.7,
   p. 111, the epenthetic n). A free allomorph meanwhile.
5. **Half-space defaults.** h before a consonant after a half-space (S xxx, rule 4) against the course's sentences
   (پادشاهنینک joined), and the copula after a half-space against the present's -aydur joined (12 tokens): both
   free. The defaults matter only when something is shown or shipped from the rules.
6. **Defaults by the course's frequency** (above) where Schluessel says the choice is free: confirm, or take one of
   his spellings as the norm everywhere.

## Not done

- The 22 verbs whose stem allomorph no condition reads in the course (vowel-final, voiceless or rounded stems are
  covered) have no vector of their own.
- Rounded stems with two consonants after the و take -up, -üp only where the course has one (-ünči: tört); -duŋ,
  -duŋlar, -l- after a vowel, the ezafe's -ye after a vowel: stated in notes, not written as allomorphs (no token).
- Glosses for `rule:chg-stem`; a branch memory (stage 5) has nothing to key in chg until its rules have branches.
