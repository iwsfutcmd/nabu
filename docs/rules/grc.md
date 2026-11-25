# Rules in a lexicon: grc, as built (2026-11-25)

Attic Greek taken through stages 1 to 4 of docs/rules-design.md, as apc was: every lexeme has a lexical form,
`grc-Grek/polytonic` spells it, rules realise every cell the course writes, every token is accounted for, and the
bundle carries each lexeme's paradigm. Everything here is REVIEW (drafted, `llm:` provenance, status draft) until the
owner signs it off. Sources: van Emde Boas, Rijksbaron, Huitink and de Bakker, *The Cambridge Grammar of Classical
Greek* (2019), cited by section (CGCG 24.16 is chapter 24, section 16: sections are what the book is cited by, and
every rule's comment in `lexicons/grc/language.yaml` names its own), and the course where it writes a form the rules
do not give (said so). Nothing a learner sees of the course changed: no token, accent, breathing, spelling, lemma,
reading, accept set or clip. What a learner gets new is stage 4's: a verb shown with its aorist and future beside its
lemma, and the paradigms grading and the Data page read.

## Counts

- **Lexemes:** 170, every one with a form (all strings: Greek has no radical forms). `form.projection` is at zero:
  each form spells as the lexicon writes its lemma.
- **Rules:** 35 realisation rules (20 verbal, 15 nominal) and 88 phonology entries (rewrites and accent rules), 328
  rule-and-branch pairs in all; 18 classes. Every branch is REVIEW.
- **Tokens:** 1,282 (sentences and story lines; one orthography): 839 given exactly by the rules, 443 by a listed or
  pinned form of the lexeme, none unaccounted.
- **Listed forms:** 162 on 59 lexemes (81 stems, 81 whole forms), each with its statement (`llm:claude@grc-rules-v1`,
  draft). **Pinned:** 21 on 15 lexemes (rule debt, `form.rule-debt` reports them).
- **Paradigms:** 112 lexemes (NOUN 34, VERB 31, PROPN 20, ADJ 15, PRON 10, DET 2) over 66 cells (VERB 18, DET 15,
  ADJ 9, NOUN 9, PRON 9, PROPN 6), 1,045 spelled cells; `regularised` on 35 lexemes (217 cells). The lexicon file
  grew from 183,432 to 226,139 bytes (11.4 to 18.4 KB gzipped). No `form.spelling-script`: five letters with a
  breathing or the iota subscript that only paradigm spellings use (ῳ ὠ ᾠ ᾤ ῄ) joined the profile's
  `exemplarsExtra` (CLDR's Greek exemplars lack them; REVIEW, as the others there).
- **Vectors:** `conformance/realise-grc.json` 344 (17 on zz, 327 `realise/grc/*`), `conformance/spell-grc.json` 25
  (3 on zz, 22 `spell/grc/*`). Both harnesses pass (1,626 and 1,627 vectors).
- **Warnings:** none (the course builds with 0 errors and 0 warnings; `EXPECTED_WARNINGS` for grc stays empty);
  one info, `form.rule-debt` (the 21 pinned forms).
- **apc** is byte for byte what it was: its bundle built with these changes matches the committed one.

## Stage 1: the lexical form, and how grc writes it

A lexeme's form is its lemma as its Attic reading writes it (`profiles/schemes/attic.yaml`): every α, ι, υ outside a
diphthong marked long (ᾱ) or short (ᾰ) unless a circumflex or the subscript settles it, the breathings, and the
accent the lemma has. Three signs are the notation's own: `-` where a verb's augment goes (first, or after a
compound's preverb: περῐ-μένω), `(ν)` the movable ν, and a grave for an accent a clitic has only from its neighbours.

**Why the accent is in the form.** Greek's accent is lexical: a noun's or adjective's stays where the lemma has it
as far as the last syllable allows (persistent, CGCG 24.14, 24.21), and where that is cannot be told from the letters
(ἄνθρωπος, ἀδελφός, Ἀθηναῖος; 24.25 calls the placement rules "complex"). So the form carries it, and rules move it
only where Greek moves it by rule: a finite verb's and a comparative's is recessive (24.16-24.19, 24.32), a first- or
second-declension oxytone's genitive and dative take it on the ending (24.22), a one-syllable third-declension stem's
too (24.23), and contraction places its own (24.12). Lengths are in the form for the same reason: they decide the
accent (a long last syllable keeps it off the third from the end) and the reading has them already.

**Graves.** A final acute is written grave before another word (CGCG 24.2): a spelling, not a word's accent. Forms
carry the acute; the spell statement's last rule offers the grave as a free alternative for a final acute only, so
σοφὸς is a spelling of σοφός and σόφος is none (vector `spell/grc/none/accent-moved`). An enclitic's or proclitic's
own accent, which it has only before an enclitic or at a clause's end (24.33-24.39), is a grave in the form (εἰμῐ̀,
ἐστῐ̀(ν), οὒ, εἲ, and the article's ἣ): spelled as nothing, or as an acute. It is written only where the course writes
the clitic accented (ἥ once, before an enclitic in the story not-one-woman); ἐν, εἰς, ὁ, γε, τις carry none.

**The statement** (`profiles/grc-Grek.polytonic.yaml`, `spell`, `decompose: true`, 12 rules; the compiler strips it
from the shipped profile): (1) `-` is not written; (2-5) four words the course writes otherwise before what follows,
as whole-word alternatives: οὐ / οὐκ / οὐχ, ἐκ / ἐξ, ἐστι(ν) / ἔστι(ν), ἐνταῦθα / ἐνταυθοῖ; (6) the clitic's grave:
nothing, or an acute; (7, 8) a final short ε, ο, ᾰ, ῐ elided (’); (9) the movable ν written or not; (10) length marks
not written; (11) the acute a word takes on its last syllable before an enclitic (an acute on the third syllable
from the end, or a circumflex on the second: Ἀθηναῖός, οἴεταί; 24.38); (12) the final acute's grave. Alternatives
are read only by the compiler's token check; grading reads the profile's correspondences, as before. They
over-generate a little (ἐξέρχομαὶ: the enclitic's acute then made grave), which only loosens the token check.

## Stage 2: the rules

`lexicons/grc/language.yaml`, after the declarations: the classes, the notation (with `prosody`, the facts the accent
rules read: which letters are vowels, which diphthongs, which are long, which marks lengthen, that final -αι and -οι
count short, CGCG 24.7-24.10), then `realisation` and `phonology`.

- **Verbs (20 rules), CGCG 11-15.** A verb's form is its lemma (-ω or -ομαι, `-` at the augment); each rule's `strip`
  takes the cited ending off. The present (active, middle, and an active verb's middle-passive where the cell says
  Voice=Mid), the imperfect (active, middle), the imperative and infinitive (active, middle), the future (sigmatic;
  a middle verb's; an active verb's middle future, class `future-middle`; the contracted Attic future and its middle),
  and the aorist (sigmatic active and middle; thematic active and middle, `second-aorist`, `second-aorist-middle`;
  root and passive-form aorists in -ην, `root-aorist`; the liquid aorist, `liquid-aorist`), with the aorist
  subjunctive where the course has it. Stems Greek has no rule for (εἶπον, ἐρῶ, εἶδον, ὄψομαι, ἔσχον, ἕξω, ἦλθον,
  μαθήσομαι, ἐγενόμην) are listed on each verb. The augment is a rewrite at `-` (syllabic, temporal, a preverb's
  elided vowel; CGCG 11.35-11.51), and the recessive accent goes no further back than the syllable before `-`
  (24.19: κατέβην, περιεμείναμεν).
- **Nominals (15 rules), CGCG 4-7.** First declension (-η/-ᾱ, short -ᾰ, masculine -ης/-ᾱς with the -της vocative
  in -ᾰ), second (masculine/feminine, neuter), third (a listed stem, the genitive's; the neuter; σ-stem names,
  `sigma-name`: Σωκράτης, no plural), adjectives (three endings, two endings, σ-stems, contracted -οῦς, comparatives
  in -ότερος/-ώτερος for the class `comparable`), and pronominal declension (αὐτός, ἄλλος, the article on τ-). They
  name no part of speech: a class, the lemma's ending (`ends`, `endsIn`) and the cell choose them. An adjective not
  stated comparable has no comparative: `rule:grc-no-comparative` takes its cells and names none (its one branch
  names Degree=Sup, a value the language does not declare, so it is never taken).
- **Phonology (88 entries).** The augment (21), stops and ν before σ (4: CGCG 1.91, 4.37, 4.42, 4.51), a contract
  stem's long vowel before σ (13.16, 15.16), ᾱ after ε ι ρ (2: 4.5), the -της vocative (4.12), -ώτερος after a short
  syllable (5.38), the accent (17: recessive for verbs and comparatives, a σ-stem name's vocative, the genitive and
  dative on the ending, the oxytone's acute on a new ending where its cited one carried it, persistent for every
  other nominal), contraction (40: CGCG 1.58-1.63, 12.15-12.17, the accent as 24.12 places it; εε and εει in every
  verb, the rest in class `contract`; a contracted 3sg takes no movable ν), and a final stop dropped in a vocative
  (παῖ: 1.73, 4.44).
- **Classes (18):** third, third-neuter, mobile, syncopated (πατήρ, μήτηρ, θυγάτηρ: πατρός, 4.62-4.63), contract,
  second-aorist, second-aorist-middle, root-aorist, liquid-aorist, future-middle, attic-future, attic-future-middle,
  pronominal, two-ending, sigma-stem, sigma-name, contracted, comparable.
- **Listed (162):** third-declension stems (Ἕλληνος, νυκτός, ἀνδρός, γυναικός, πατρός and πατέρα: CGCG 4.33, the
  stem not derivable from the nominative); the irregular vocatives (ἄνερ, πάτερ, μῆτερ, θύγατερ: 4.62-4.64; γύναι:
  4.38; θεός: 4.29; ἄδελφε, not in CGCG); παίδων (24.23 n.1); the syncopated datives plural (πατράσι: 4.63); ἄστυ's
  and Πειραιεύς's forms (4.83, 4.85-4.86); the pronouns' forms (ἐγώ, σύ, ἡμεῖς, ὑμεῖς, οὗτος, ὅδε, πᾶς, οὐδείς, τις:
  CGCG 7); the article's nominatives (3.1); verb stems Greek has no rule for (the second aorists, the liquid aorist's
  μειν-, the passive-form aorists, the futures in -ήσω/-ήσομαι of χαίρω, μανθάνω, γίγνομαι, ὀφείλω, the Attic
  futures' stems, ἀφίξομαι: each as CGCG 22.9 lists it), ὁράω's εἶδον/ἰδ- and ἑώρων and ἔχω's εἶχον; whole forms
  of εἰμί (12.36), πάρειμι, φημί's ἔφη, ἠμί's ἦ, οἶδα's (οἶσθα, εἰδέναι, εἰδώς: 18.23), ἀποδίδωμι's imperatives,
  ἐξέρχομαι's and προσέρχομαι's Attic forms from εἶμι (ἔξειμι, ἔξιμεν, ἐξῇα, ἔξιθι, ἐξιέναι: 12.36, 22.9 no. 66),
  and two perfects (ἀφῖξαι, συντετάραξαι). The vocatives are the paradigm's (the course writes none of these).

**Engine changes**, each in a commit of its own, additive (a language without the keys realises and spells as
before; apc's bundle is unchanged), with vectors on zz, an invented language:

1. `feat(core): accent rules, a rule's strip, a decomposed spell statement` (`packages/core/src/lexicon/accent.ts`,
   `realise.ts`, `spell.ts`; `schemas/language.schema.json`, `schemas/orthography-profile.schema.json`):
   - a phonology entry may be an **accent rule** (`accent` in place of `find`), placing the accent by counting
     syllables as the notation's new optional **`prosody`** says what a syllable's nucleus is and what is long.
     Data cannot say "the third syllable from the end, or the second where the last is long": a rewrite matches
     letters, not syllables, and the count depends on every vowel's length.
   - a realisation rule's **`strip`**: endings taken off a string form before the blocks (the first that ends it);
     such a rule also realises the citation cell. grc's lemmas are words, cited with their ending (ὁράω, σοφός), and
     the ending says something the stem does not: an oxytone's accent (σοφός, σοφή) and, in a contract verb, the
     uncontracted dictionary form that no cell has (ὁράω, but ὁρῶ).
   - a spell statement's **`decompose: true`**: its rules read the form as NFD, so a mark NFC composes into its
     letter (ά) is a mark a rule can find; the result is NFC again.
2. `feat(core): the accent rules oxytone and ultima`: two more modes (24.22-24.23).

**`strip` and `stemmed`** (bar's, commit `b443262`, cherry-picked here as asked): both make a category's string
form be realised in its citation cell. `stemmed` (per category) says the form *is* a stem (bar's red, kemm) and the
citation cell gets the rules' endings. `strip` (per rule) says the form is a word with an ending that the rule takes
off first; the lemma check stays "the form spells as the first spelling" without realising anything, and a rule
whose endings are not the cited one's still finds its stem. grc could not use `stemmed`: a contract verb's lemma is
no cell's form, and the lemma check would realise it as ὁρῶ.

Also cherry-picked as asked: `e36bedd` (the coordinator's: a notation whose vowels are letters, a spell statement
with no rules).

## Stage 3: every token accounted for

`form.unaccounted` is an error and there are none. `nabu forms ../courses/grc`: 839 tokens given exactly, 443 by a
listed or pinned form. `uv run nabu forms prune ../lexicons/grc` removed 195 of the course's 200 spelled-only pinned
forms the first time (the rules give them) and removes none now. It keeps 21:

- **5 spelled-only forms of the course's own** (βοώντων, ἔχον, περιμεῖναι, πρόσελθε, ἔθεον), each beside a pinned
  copy with a lexical form (the next two items) or, for ἔθεον, a pinned stem. The rules alone do not give them, so
  prune keeps them; they could go once the forms below are rules.
- **4 pinned forms** in cells that do not say what they are: two participles in a cell that is VerbForm=Part alone
  (βοώντων is a genitive plural, ἔχον a neuter: no rule can choose an ending without case, gender and number), and
  two aorists in cells that name no aspect (περιμεῖναι, an aorist infinitive in VerbForm=Inf; πρόσελθε, an aorist
  imperative in the present imperative's cell).
- **12 pinned imperfect stems** (ἀφικνέομαι, χαίρω, γίγνομαι, καταβαίνω, λέγω, μανθάνω, οἴομαι, ὀφείλω, περιμένω,
  πορεύομαι, συνταράττω, θέω). The course tags its aorist Tense=Past with no Aspect and its imperfect Aspect=Imp
  Tense=Past, so every value of an aorist cell is also in the imperfect's: a verb's listed aorist stem (keyed
  Tense=Past) would win in the imperfect too (εἶπον for ἔλεγον). A pinned present stem keyed Aspect=Imp, Mood=Ind,
  Tense=Past is more specific and wins there. They go if the aorist is tagged Aspect=Perf (UD's way for the Greek
  aorist), the aorist stems keyed by it.

## Stage 4: paradigms

`principalParts` (VERB): the aorist and the future 1sg indicative, after the lemma, in CGCG's order (22.1: present,
aorist, future). The rules (and listed stems) give both for every verb that has them, read by hand (the irregular
ones against CGCG's list, 22.9): ἤκουσα ἀκούσομαι, εἶπον ἐρῶ, εἶδον ὄψομαι, ἐξῆλθον ἔξειμι, ἐγενόμην γενήσομαι, κατέβην καταβήσομαι,
ἔθευσα θεύσομαι, …; οἶδα, φημί, πάρειμι and ἀποδίδωμι show none (their listed forms have neither), and εἰμί, the
one AUX, has no paradigm at all (no rule covers AUX; its forms are listed). REVIEW: whether a beginner should see
them beside every verb; the perfect and the passives are not taught, so they are not shown.

Paradigms were read over by hand for every lexeme; what was wrong was fixed in the rules, or by a listed form where
Greek has no rule (suppletion): τις took an acute (`oxytone` now runs only after a lemma's accented ending),
Σωκράτης had a plural (now `rule:grc-sigma-name`, singular only as CGCG gives it), διπλοῦς's listed feminine stood
in the comparative's cell (now `rule:grc-contracted`), πατρός lost its accent (class `syncopated`), and
ἐξέρχομαι's future was ἐξέρξομαι (ἔξειμι listed). `regularised` is what blocking off gives (a class or a listed
stem ignored): many are what a learner would over-regularise (βαρβάρα, ὀνόμης), some are not Greek at all
(γιγνσόμεθα, a σ after ν no rule handles); they ship as apc's do, for stage 6's label.

## Where the course's tags and the rules disagree (the course stands)

1. **The aorist has no Aspect** (Tense=Past alone; the imperfect is Aspect=Imp): 12 pinned imperfect stems
   (above). Suggest Aspect=Perf on aorist tokens.
2. **Imperatives and infinitives name no aspect:** πρόσελθε (aorist) shares προσέρχομαι's imperative cell with
   πρόσιτε (present, from εἶμι); περιμεῖναι (aorist) is in the infinitive cell; ἀπόδος, ἀπόδοτε are listed in the
   imperative cells of a verb whose present imperative is ἀπόδιδου. A paradigm row then mixes aspects.
3. **Participles are VerbForm=Part alone** (βοώντων, ἔχον, εἰδώς): no case, gender, number, tense or voice, so no
   participle rule can be written.
4. **οἶσθα is Aspect=Perf with no Tense, οἶδα Tense=Pres:** one paradigm, two ways of tagging the perfect-as-present.
5. **Voice=Mid** is on some tokens only: a deponent's forms carry none (the rules read -ομαι), an active verb's
   middle-passive carries it (`rule:grc-present-mp`).
6. **ἐνταῦθα and ἐνταυθοῖ** (there; thither) are one lexeme: spelled as a whole-word alternative (REVIEW: two
   words).
7. **The article ἡ** is written ἥ once (before an enclitic), so its form carries the clitic's grave; ὁ, οἱ, αἱ do
   not, since the course never writes them accented.

## For the owner

- The rules, classes, listed forms and the 21 pinned forms: every one REVIEW.
- The course's tags (the list above): the aorist's Aspect above all; each change removes rule debt.
- Principal parts: aorist and future beside every verb, or none?
- Whether every proclitic and enclitic should carry its grave in the form (now only where the course writes it
  accented).
- `regularised` forms that are not Greek (γιγνσόμεθα): keep them, or say which over-regularisations grc wants.

## Not done

- Participle, perfect, optative and passive rules (no course cell names them fully).
- A rule for the stops and ν before the dative plural's σ beyond what the course's lexemes need, and for ν before σ
  in a verb (γιγνσόμεθα in `regularised`).
- `pnpm bundles` was not run in this branch: the committed grc bundle is stale (its lexicon and its profile's
  `exemplarsExtra` change; units and audio do not).
