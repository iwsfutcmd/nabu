# apc: the lexical form

- Status: a draft (Task B of [the handoff](../handoff-lexical-model.md)), 2026-11-20. The owner ruled on its
  six questions the same day: [the last section](#the-owners-rulings-2026-11-20) says what each ruling was
  read as and what was done. What a ruling settles is no longer marked REVIEW; the rest is a proposal until
  signed off. Nothing in `courses/apc` or the app reads it.
- What it is for: [ADR 0145](../adr/0145-lexical-model.md) stores one lexical form per morpheme, in its own
  script and fully specified, and [ADR 0148](../adr/0148-projections-and-misses.md) projects every spelling and
  the phonemes from it. apc (North Levantine Arabic, Beirut) comes first.
- Beside this note:
  - [apc.yaml](apc.yaml): a worked entry for every KC of `courses/apc` (358 words, 41 of them verbs with their
    radicals, and the course's affixes with every shape its sentences write).
  - [apc-review.md](apc-review.md): everything the course pins that the projections do not give back, with why.
  - [../prototypes/apc-lexical-forms](../prototypes/apc-lexical-forms/): the code that drafted the entries, runs
    the projections and writes both files.
- Sources: Kline, *The Fundamentals of Lebanese Grammar* (2022), cited by page; Al-Masri (2015) for stress;
  the course itself; the Unicode Standard's names list. Notes on Kline are in the reference library (`nabu/notes/apc/kline-forms.md`). Where
  Kline is silent this note says so and does not fill the gap.

## What was checked, in numbers

- The course's sentences and stories hold **1,025** distinct words (an Arabic spelling, its vowel marks and its
  Arabizi, taken together). A lexical form was drafted for each from those three.
- **932** come back exactly when the form is projected: the Arabic letters, the vowel marks, and the Arabizi
  among the spellings the correspondences give. **84** have a form and differ in one of the three. **9** have
  no form. Ten of those 93 are the prototype's own doing, not the course's: its reader paired the wrong
  Arabizi word (the review list's first section).
- Of the **415** forms the KCs list, 367 come back, 41 do not, 2 have no form and 5 are written in one script.
- Of the **82** clips a listener marked right, the projection writes the very marks the voice was given for
  **64**. For 18 it writes other marks for one word: هَيدا or هَيدي in 15 (the course leaves the sukun off
  their glide), a helping vowel in 2, الحمدلله in 1.
- No conjugation rule is written. A verb's entry has its radicals, Form, vowels and citation forms (one verb,
  *stanna*, is a listed stem with no radicals); the 251 forms the sentences write are kept as **pinned**
  forms (ADR 0145: derivable, the rule not yet written).

## The notation

A lexical form is one word in Arabic script. The letters are the ones the course spells the word with. Every
vowel is written, by these rules.

**Each consonant letter is followed by** a shadda if it is doubled, and then exactly one of:

| After the consonant | It says | Code point |
|---|---|---|
| fatha | a | U+064E |
| kasra | i, the one short front vowel (said and written e or i) | U+0650 |
| damma | u, the one short back vowel (said and written o or u) | U+064F |
| vowel sign dot below | e | U+065C |
| reversed damma | o | U+065D |
| sukun | no vowel | U+0652 |
| fathatan, then an alef seat | -an (شكراً) | U+064B |
| nothing | no vowel: the word's last consonant only | |

**A vowel sign followed by its bare length letter is long:**

| Written | Says | Example |
|---|---|---|
| fatha + ا (or ى at the end) | long a, said back | راح *ra7*, نهار *nhar* |
| U+065C + ا | long e, spelled with alef (the a of Standard Arabic, fronted) | كمان *kamen*, ساكن *seken* |
| kasra + ي | long i | كبير *kbir* |
| U+065C + ي | long e, spelled with ya | بيت *bet*, وين *wen* |
| damma + و | long u | شوف *shuf* |
| U+065D + و | long o | يوم *yom*, هون *hon* |

- A long vowel that ends a word is said short (*shu*, *enti*, *mar7aba*): the form still writes it long, since
  that is how the letter is there.
- **ay and aw** are a fatha and then ي or و as a consonant: with a sukun inside a word (عَيْلة *3ayle*), bare
  at its end (مَي *may*, لَو *law*).
- **ة is the feminine ending's letter.** The vowel before it is the ending: U+065C for -e (قهوة *ahwe*), fatha
  for -a (ساعة *sa3a*). ة with a sukun is the ending said t before the word it belongs to (مية *mit*).
- **A word that begins with a vowel** writes it on a bare alef (اِسم *esm*) or on a hamza letter (أَنا, إِنت),
  as the course spells the word. آ is a hamza with its long a; U+065C after it fronts the vowel (آكل *ekol*).
- **A letter written and not said carries U+06DF:**
  - the ه of *his*, *her* and *their* (بدّه *baddo*, بدّها *badda*, بدّهن *baddon*; Kline, p. 7–8);
  - the alef after a plural's و (تفضّلوا);
  - the article's alef, always, and its lam before a sun letter, which is then written doubled
    (السلامة: silent alef, silent lam, س with a shadda);
  - an alef that only begins a cluster (استنّى *stanna*).
- **A suffix's form** begins with its vowel, written on a tatweel (U+0640), which Unicode provides to carry a
  mark with no base letter. None is drafted yet.
- **A clitic group** (وإنت, بالمطبخ) is not one lexical form: it is the clitic's form and the word's. The data
  joins them with `+` only to check the course's words.

### Why these three signs

All three are in Unicode's Arabic block already, so nothing is invented. **The owner accepted the three
(2026-11-20).** What Unicode says of each is quoted from the names list of Unicode 18.0.0, read that day.

- **U+065C, vowel sign dot below, for e.** The names list: "African languages" and "also used in Quranic text
  in African and other orthographies". It is the one sign the script already has for what happens here: an a
  written with alef and said e.
- **U+065D, reversed damma, for o.** The names list: "African languages". It is needed only for long o, and
  any free vowel sign would have done.
- **U+06DF, small high rounded zero, for a letter written and not said.** It stands among the "Quranic
  annotation signs", and the names list says only that it is "smaller than the typical circular shape used
  for 0652". That a rounded zero over a letter marks it as not read was recalled when the sign was chosen
  and is still unsourced: it was looked for that day in the names list, in chapter 9 of the core
  specification (16.0) and in L2/19-306, and none says it. The nearest the Standard comes is its note on
  the sukun, U+0652: "used in some Qurans to mark a long vowel as ignored". The notation does not rest on
  it: the sign means here what this note says it means.
- Kurdish writes long e and o as ێ and ۆ, a small v over the letter. U+065A on ي and و would look the same and
  was the other candidate. It cannot say that an alef is fronted without a second convention, so it lost.

**In source** these three are always written as escapes (`\u065c`, `\u065d`, `\u06df`), since a font may not show
them and an editor may drop what it cannot show. [apc.yaml](apc.yaml) does so. Ordinary marks are literal.

### What the form does not write

- **A helping vowel.** خبز has no vowel between its last two consonants and is said *khebez*. The form has a
  sukun there: the vowel is a rule's, and the rule writes it in the marks ("The helping vowel", below).
- **Stress.** Kline gives no stress rule (the notes, §1.5). Al-Masri, *Colloquial Arabic (Levantine)* (2015,
  p. xxi–xxii), says stress does not tell words apart in Arabic and follows weight: it falls on the heaviest
  syllable (a long vowel outweighs a short one), on the first of them where they are equal, and a word's last
  consonant does not count. So the form stores no stress: it is computed. The phoneme projection does not
  mark it yet. His statement is for Levantine at large and leaves choices open (what a doubled consonant
  weighs; words with suffixes), so the rule as code waits for a fuller source. Watson (2007) is in the
  library and was not read. REVIEW.
- **The article's helping vowel** (*el bet*, *l bet*): the article is ل, and its alef is silent.

## Letters whose sound is not their letter's

| Letter | Said | In the course | Kline |
|---|---|---|---|
| ق | ʔ | 56 words, all written 2 or left out | p. 4: 2, and q in learned words |
| ذ | z or d | إذا *iza* and تلميذ *tilmiz*; آذار *adar* | p. 4–5: z or d; the d words are respelled with د |
| ث | s | none: كتير, تلاتة, تنين are spelled with ت | p. 4–5: s, rarely t |
| ظ | ẓ | none: ضهر is spelled with ض | p. 4: Z, z or D |
| ك for g | g | إنكليزي *englize* | p. 5: g is written ك, غ or ج where گ is not used |

- **The course mostly spells the stop where a stop is said** (ت for ث, د for ذ in هيدا, ض for ظ), so each of
  these letters has one sound in it. The one exception is آذار, written with ذ and said *adar* in the course's
  Arabizi. The projection gives z, so the word is on the review list: either it is respelled, or the form
  needs a sign for "said as the stop". REVIEW.
- **A q that is said q** (a learned word) will need a sign when the course has one. None is proposed.
- **A loan's g, p and v** are written گ, پ and ڤ in the lexical form, and the spelling projection turns them
  into ك, ب and ف, which is how the course writes them. إنكليزي is the one such word.

## The projections

Each is a function of the lexical form alone. The code is `lexform.py` in the prototype.

### To the course's Arabic (apc-Arab/standard)

| In the form | Written |
|---|---|
| every vowel sign, sukun, U+065C, U+065D, U+06DF | left out |
| shadda | left out (the course writes it on some words and not others; the profile ignores it) |
| گ, پ, ڤ | ك, ب, ف |
| everything else | itself |

### To the vowel-marked text the voices read

These are the conventions `courses/apc/vocalization.yaml` follows in most words. Where the course's own marks
break them, the word is on the review list.

| In the form | Written |
|---|---|
| fatha, kasra, damma | themselves |
| U+065C before ة | kasra (قَهْوِة) |
| a consonant before its length letter | no sign at all (كْبير, جوعان, كَمان): long e and o are not told from long i, a and u |
| sukun | itself; but not on the article's lam |
| the word's last consonant | no sign |
| shadda | itself, before the vowel sign |
| fathatan and its seat | the seat, then the fathatan (شُكْراً) |
| a silent letter | the letter, bare |
| a short vowel before the silent ه of *their* | on the ه, with a sukun before it (بيتْهُن) |
| a clitic's last consonant | a sukun (بْهَيدا), but none on و "and" |
| the helping vowel | written by its rule: a kasra, or a damma after a damma inside the stem |

### To Arabizi (apc-Latn/arabizi)

The first spelling is what the projection writes; the others are right too. The order is the course's own
majority ([apc-review.md](apc-review.md), last section).

| In the form | Written |
|---|---|
| ب ت ج د ر ز س ف ك ل م ن ه و ي | b t j d r z s f k l m n h w y |
| ح ع | 7 3 |
| خ غ ش | kh, gh, sh (also 5, 8, ch: Kline, p. 4) |
| ص ض ط ظ | s d t z: the emphatics are not told apart (Kline writes capitals) |
| ق | 2; also nothing where it begins a word (*ahwe*) |
| a hamza | nothing where it begins a word or follows the article; 2 elsewhere |
| a doubled letter | written twice. One doubled by the article's lam is also written once, with the lam |
| fatha | a |
| kasra | e; also i |
| damma | o; also u |
| long a | a |
| long e | e; also ei where it is spelled with ي |
| long i | i; also ee; at the end of a word also e |
| long u | u; also ou; at the end of a word o, also u |
| long o | o |
| -an | an |
| a helping vowel | nothing; also e, or o after an o |
| the article | el; also l, and its lam left to the doubled letter (*essalame*) |
| a name | takes a capital, which the form does not hold |

### To phonemes

| In the form | Phoneme |
|---|---|
| ب ت ج ح خ د ذ ر ز س ش | b t ʒ ħ x d z r z s ʃ |
| ص ض ط ظ | sˤ dˤ tˤ zˤ |
| ع غ ف ق ك ل م ن ه و ي | ʕ ɣ f ʔ k l m n h w j |
| a hamza | ʔ |
| a doubled letter | long |
| fatha, kasra, damma | a i u |
| U+065C, U+065D | e o |
| a long vowel | long, but short at the end of a word |
| a silent letter | nothing |
| the helping vowel | i, or u after a u or o inside the stem |

- The values are Kline's (p. 3–4). Long e spelled with alef and long e spelled with ya come out as one
  phoneme. Kline lists several qualities for each letter and does not set them apart. REVIEW.

## The helping vowel

The owner's ruling (2026-11-21): the vowel is entirely predictable, so no word stores it; and a learner has
to learn when to say it, so the marks write it and the rule is a part to learn (ADR 0146: what a rule gives
is no part of a lexeme). Asked which clusters: "every cluster, that's what Alice does".

- **Where:** a word that ends in two consonants says a short vowel between them, whatever the consonants:
  خِبِز *khebez*, بِنِت *benet*, كِنِت *kenet*, فيلِم *filem*.
- **Where not:** in a doubled letter (بَسّ), after a glide that closes a diphthong (لَو), and where a vowel
  follows the cluster: اِسِم *esem* but اِسْمي *esmi*. A word's marks show the word said alone, so they
  write the vowel wherever the word ends in the cluster, whatever word comes next.
- **Which vowel:** a kasra. After a damma inside the stem it is a damma (شُغُل, صُبُح, عُمُر). Before the
  past's -t it is a kasra whatever the stem's vowel (رُحِت): that is an ending, not the stem.
- **Stress** is where it would be without the vowel: كِنِت and أَكَلِت "I ate" are stressed as *kent* and
  *akalt* are. So "I ate" and أَكَلِت "she ate" are written alike and differ in stress, which the marks do
  not show. This is how Levantine is described; no source in the library says it of Lebanese. REVIEW.
- **What stores it:** nothing. The form has a sukun. The projections to the marks and to phonemes write the
  vowel. Arabizi may write it or leave it out (*khebz*, *khebez*), and the course's mostly leaves it out.
- **What a learner has:** the rule, as a part of its own: a mark card can ask خِبِز against خِبْز, and a
  miss is the rule's, not the word's. Not built: no rule is written yet.
- **Inside a word,** a stem that ends in a cluster takes the vowel before an ending that begins with a
  consonant that is said (بِنِتْكُن, عِنِدْكُن, بَعِدْني). The form does not yet say where an ending begins,
  so the projection does not write these three, and they are on the review list.
- **Sources:** Kline gives no rule and spells such words both ways (the notes, §1.4). The study of it is
  Haddad (1984), "Epenthesis and sonority in Lebanese Arabic", which is not in the library and was not
  read. The rule here is a speaker's usage, as the owner reports it.

## A verb's form

A verb's lexical form is not one string (ADR 0145). Its entry holds:

- **Its radicals,** stored. A hollow verb's middle radical shows only in some forms (راح, يروح), so it cannot
  be read off the citation form. For three verbs a radical shows in no form the course writes (*nem*, *rte7*,
  *2ara*): each is deduced, and the entry says from what (below).
- **Its Form,** numbered as Arabic grammars number them. Kline's own "form IV" is the four-radical one (p. 84).
- **Its vowels,** where its Form leaves them open: a form I verb's past vowel (a or i: *daras*, *shereb*) and
  present vowel (a, i or u: *yeshrab*, *ya3mel*, *yedros*); a hollow verb's present vowel (*yru7*, *ysir*,
  *ynem*). Kline names no classes; these are read off his lists (p. 75–80).
- **Its citation forms,** as Kline cites a verb (p. 74): the past, he, and the present without b-, he.
- **Its root class is not stored:** it follows from the radicals (sound, doubled, hollow, defective,
  hamza-initial, w-initial).

Of the 41 verbs, 34 are in Kline's lists. Seven are not, and three more hide a radical. **The owner's ruling
(2026-11-20) is to deduce what needs to be deduced,** so each is filled in, with its `basis` in the data and
a line on the review list for a speaker to correct:

- **Citation forms** come from the course's other forms of the verb, its class and Kline's paradigms: a
  form II verb's follow from its radicals (*jarrab*, *fakkar*); a vowel that drops before an ending is i or
  u, never a (*e3zmak*, so *ye3zem*); a hollow past the course never writes is cited with the vowel of the
  hollow verbs like it (*fe2*).
- **A radical no form shows** is stored as the letter Arabic dictionaries file the word under (*nem*, *rte7*:
  و), since no form depends on which it is and shared radicals link nothing (ADR 0145: they only sort
  together). *2ara*'s last radical is stored as ي, as the verb is conjugated; Standard Arabic's hamza shows
  in no form of it.
- **A stem no rule builds is listed.** *stanna* (wait) has a defective verb's endings on a stem *stann-*, and
  no form shows a third radical or a Form's prefix. The usual account (form X of ʔ-n-y) is etymology, which
  the model does not formalise, so the entry stores no radicals and no Form: `listed: true`, the one such
  verb.
- **What deduction could not settle** is said on the line: whether ق after a long a keeps it a (*fe2* or
  *fa2*), and which prefix ع takes (*e3zmak* beside *ba3mel*).

## A pattern's template

A pattern is its own letters and vowels around numbered slots for the radicals, with one template per root
class (ADR 0150 draws them). The active participle of form I, from Kline (p. 122–124, 130):

| Root class | Masculine | Feminine | Plural | Kline's example |
|---|---|---|---|---|
| sound | 1ā2i3 | 1ā23e | 1ā23in | *keteb*, *ketbe* |
| hollow | 1āyi3 | 1āy3e | 1āy3in | *raye7*, *ray7in* |
| doubled | 1ā2i3, the doubled letter written twice | | | *7atet* |
| defective | 1ā2i | 1ā2ye | 1ā2yin | *meshe* |

- **The feminine and the plural drop the last short vowel** (Kline, p. 130: *nezel*, *nezle*, *nezlin*).
- **The pattern's ā is said e unless the radical before it is a back consonant.** Kline gives no rule for a
  and e. The set used (ر ق ع ح خ غ ص ض ط ظ و) is read off his words and the course's. REVIEW.
- **The feminine ending is -a after ر ع ق ص ض ط ظ and -e elsewhere** (Kline, p. 16). His own words add ح, غ
  and ء; the template uses the longer list. REVIEW.
- Forms II to X take m- before the past with its last vowel turned to e or i (p. 125). Not built.
- The template gives all 13 participle forms the course writes for *raye7*, *seken*, *2a3ed*, *wa2ef* and
  *nezel*.

## The participle's two heads

The pattern carries two heads (ADR 0145; Kline, p. 130–131).

- **The participle,** a value of the verb's aspect: a form of its verb. `sense:raye7`, `seken`, `2a3ed` and
  `wa2ef` are this, and fold into their verbs at the migration. Three of those verbs the course does not have
  in any other form.
- **The agentive noun,** a function head: `sense:m3allem`.
- **How the lexical form tells them apart:**
  - In form I the masculine is one form for both. The feminine and plural differ: the noun keeps the short
    vowel the participle drops (a woman writing, *ketbe*; a woman who is a writer, *ketibe*; both written
    كاتبة). The form writes that vowel or a sukun.
  - In forms II to X the noun has o after its m- (*modarres*) and keeps its e in the feminine and plural.
- **An agentive noun's plural is listed** where it is broken, and Kline says it usually is (p. 130). He gives
  none for *ketib*.
- **For a speaker to settle:** Kline writes *mo3allem* (p. 18) and also *l m3alme* (p. 45). The course writes
  *m3allem*, the participle's shape, for the noun.
- Six other words of the course have the shape and no verb in it (*lezem*, *khayef*, *sa7eb*, *mhandes*,
  *m3asseb*, *mudir*). They are marked `listed` in the data. `sense:nezel` lists the participle as its first
  form and the verb as its second.

## Free and fixed

Kline says neither script has a codified spelling (p. 3, 9), and shows one word five ways (p. 7).

**Free in Arabizi** (every spelling is right; the projection gives them all):
- e or i for the short front vowel, and o or u for the short back one. Kline says the two front ones are one
  sound (p. 6, 122). The course writes e 263 times and i 109, o 78 and u 22.
- u or ou, i or ee, e or ei for the long vowels.
- A long vowel at the end of a word: i or e (*ghali*, *3arabe*), o or u (*7elo*, *shu*).
- ق beginning a word, written 2 or not at all (*2arib*, *ahwe*).
- The helping vowel, written or not (*khebz*, *rebe3*).
- The article's vowel and its lam before a sun letter (*el bet*, *l bet*, *essalame*).

**Free in Arabic:**
- The shadda, written or not.
- The vowel marks: all of them, since the course's text is unmarked and the marks are added.

**Fixed word by word in Arabic,** so that which letter is a leftover a learner has to know (ADR 0148):
- س or ص, ت or ط, د or ض, ز or ذ: Arabizi and the sound do not tell them apart.
- ق or a hamza for ʔ.
- ه written in *his*, *her* and *their* where no h is said.
- ة or ا for a last -a; ي or ة for a last -e.

**Fixed word by word in Arabizi:**
- a or e for the long vowel written ا (*ktab*, *kamen*). Kline writes both with no rule (the notes, §1.3).
- A loan in its own language's spelling (*merci*, *football*, *taxi*, *bus*). Listed on the word.

**Decided by the owner (2026-11-21):**
- The helping vowel is written in the marks the voices read, in every cluster that ends a word, by rule
  ("The helping vowel", above). The course's marks follow it since that day.

**Not decided here, and on the review list:**
- Whether a doubled letter may be written once in Arabizi (*bas*, *nos*, *hala2*). It is not free here: the
  course itself tells *mara*, a woman, from *marra*, once, by it. Arabic writes both مرة; the course writes
  *marra* with its shadda, and its vowel marks now tell the two apart (ruling 6, below).
- Whether a last -e and a last -i are one vowel. The form writes -e only before ة.

## The course's spelling conventions the form reproduces

- **ـه and ـها** for *his* and *her*, with the ه silent, as Kline writes them (p. 7–8).
- **A damma before ـه:** the form is بَدُّ + silent ه, and the marked text is بَدُّه.
- **ـهن** for *their*, with its vowel written on the ه in the marked text.
- **ج is a sun letter** (Kline, p. 8): the article's lam is silent before it and the ج is doubled. The course's
  own marks do this in 5 words (الجّامعة) and not in 8 (الجَبَل); those are on the review list.
- **The article is written ال** and never marked.

## What is not done

- **Conjugation.** No rule gives a verb's forms from its radicals. Kline's affixes and stem changes are in the
  notes (§3), ready to be written as rules. Until then the forms are pinned.
- **The affixes' lexical forms and their conditions.** [apc.yaml](apc.yaml) lists every shape the sentences
  write for each suffix and clitic, with counts, and no forms.
- **Patterns other than the form I active participle.**
- **Stress** as code (a general rule is cited above).
- **The helping vowel inside a word,** before an ending that begins with a consonant: the form does not say
  where an ending begins. Before the silent ه of *their* the course writes it in two words (إِبِنْهُن,
  بِنِتْهُن) and not in two others (عِنْدْهُن, بَعْدْهُن), and it is not written before the past's -t with
  a pronoun after it (سْمِعْتْني).
- **A sign for a q that is said q.**
- **The course's 7 sentences that pair no word across the two scripts** (*inshalla* written as three words in
  Arabic; the month names of two words) are left out of the count.
- **A word that begins with a vowel on a bare alef, after the article** (الامتحان *el emte7an*): the notation
  cannot write the two in one piece. One word of the course.

## The owner's rulings (2026-11-20)

The six questions this note ended with, the owner's answer to each in their own words, how it was read, and
what was done.

1. **The three signs** (U+065C, U+065D, U+06DF): *"sounds good."*
   - All three stand, and the choice is no longer marked REVIEW.
   - What Unicode says of each is quoted under "Why these three signs". That a rounded zero marks a letter
     as not read is still unsourced; the notation does not rest on it.
2. **The helping vowel, written in the marks the voices read or not:** *"sounds good"*; then, on
   2026-11-21, *"that epenthetic vowel is entirely predictable, but at the same time it's important for
   the learner to learn when to insert it"*, *"Every cluster, that's what Alice does"*, and *"fix
   everything"*.
   - The first answer was read as "not written". That reading was wrong, and the second day's answers
     replace it: nothing stores the vowel, the rule writes it, and the rule is what a learner learns
     ("The helping vowel", above).
   - The course follows the rule since 2026-11-21. In `vocalization.yaml` and in the story lines written
     with their marks, 43 words that end in a cluster gained the vowel; هَالأَكَل, whose vowel was a
     fatha, is هَالأَكِل; and three stems took it before an ending that begins with a consonant
     (بِنِتْكُن, عِنِدْكُن, بَعِدْني). The Arabizi is unchanged.
   - 133 clips were made again from the new marks. A listener had checked 7 of them (`s.fam.12`,
     `s.fam.13`, `s.fam.14`, `s.fam.31`, `s.fam.32`, `s.fam.34`, `s.food.30`): those are drafts again.
3. **Long a said e:** *"stored on each word"*.
   - As drafted: a word's form writes U+065C and its alef.
   - One rule stays, since a template has no word to store the vowel on: the active participle's long a is
     said e unless the radical before it is a back consonant (REVIEW; the course's five participles fit).
     An exception would be pinned on its verb.
4. **The review list:** *"that's fine"*.
   - It stands as a list for a speaker of Lebanese. Nothing in the course was changed to shorten it.
5. **The seven verbs Kline does not list, and the three radicals no form shows:** *"deduce what needs to be
   deduced"*.
   - Done: "A verb's form" above. Eleven entries carry a `basis`: the ten, and the verb of *seken*, which
     the course has only as a participle.
   - One reading goes beyond filling in: *stanna* lost its radicals and its Form and is a listed stem,
     since what stood there was etymology.
   - Two things deduction could not settle are said on their lines of the review list: *fe2* or *fa2*, and
     the prefix before ع.
6. **The fault in the course:** *"i think the shadda in "mara" is a mistake"*.
   - Fixed in `courses/apc/vocalization.yaml`: مرة, a woman, is مَرَة; مرّة, once, which the course always
     writes with its shadda, is مَرَّة. No token changed.
   - The word card for "woman" lost its shadda. No sentence's marks changed: *mara* stands in the course's
     sentences only after the article or *hal*, and those were marked rightly.
   - Its clip was made again from مَرَة, by the same voice. The round-trip check fails it, as it failed
     the old one (a word of two syllables, heard as *mar7aba*), so it stays out of the bundle until a
     listener checks it in the audio check.

**What the rulings leave open.** None of it blocks anything:

- the participle template's rule for a and e (ruling 3);
- the helping vowel inside a word, before the silent ه of *their* and before the past's -t with a pronoun
  after it ("What is not done");
- what this note still marks REVIEW: stress, the stop written ذ in آذار, the phonemes' qualities, and the
  letters the feminine ending is -a after;
- the review list's lines for a speaker, the two under ruling 5 among them;
- everything under "What is not done".
