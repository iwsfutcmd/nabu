# 0084. Biblical Hebrew checked against Khan, Joüon–Muraoka and Holladay; contrast sets limited by form

- Status: Proposed
- Date: 2026-11-08
- Amends: [0081](0081-affixes-on-inflected-words.md) (contrast sets get `forms`),
  [0082](0082-biblical-hebrew.md) (the phonology, the typo contrasts)

## Context

hbo was drafted from the Westminster Leningrad Codex and from memory of Geoffrey Khan's
description of the Tiberian reading ([ADR 0082](0082-biblical-hebrew.md)). Nothing had been
checked against a book. The reference library ([ADR 0079](0079-reference-library.md)) now holds
three:

| Book | What it checks | Reading it |
|---|---|---|
| Geoffrey Khan, *The Tiberian Pronunciation Tradition of Biblical Hebrew*, vols I–II (Open Book Publishers, 2020; open access, CC BY 4.0) | the sounds: `nabu/audio/tiberian.py`, and the stress and shewas of `nabu/audio/pointing.py` | the text layer is clean, IPA included |
| Paul Joüon and Takamitsu Muraoka, *A Grammar of Biblical Hebrew* (2nd ed., 2006; the 2011 reprint with corrections) | the verb-form labels, the stems, the typo contrasts | page scans: English by OCR, every Hebrew form read from the page image |
| William L. Holladay, *A Concise Hebrew and Aramaic Lexicon of the Old Testament* (1971) | the 312 word glosses | the text layer keeps the English and garbles the Hebrew; headwords were found by OCR of the headword lines and the alphabetical order |

Each check's notes, with page references, are in the library (`notes/hbo/`), not here.

## Decision

**The sounds follow Khan's text.** `tiberian.py` now implements what he describes. Pages are
vol. I's printed pages.

| Rule | Was | Now | Khan |
|---|---|---|---|
| Shewa after a long vowel (šāmərû, hāyəṯâ, yāḏəḵā) | vocal | silent, and the vowel stays long: [ʃɔːɔmˈʀ̟uː]. Vocal before the same letter (sāḇəḇû) | §I.2.5.6–7, pp. 347–352 |
| Shewa under the first of two like letters, after a short vowel | vocal | silent: hinənî [hinˈniː] | p. 352 |
| Conjunctive û- (ûḇên, ûḇəmôšaḇ) | [uː], the shewa after it vocal | a short [wu], the shewa silent: [wuvmoːˈʃaːav] | pp. 176–178 |
| ā ē ō and the vowels with a mater in a closed syllable (bêṯ-, yôm) | shortened | long everywhere, with a short echo of the vowel in a closed syllable: [beːeθ], [ˈjoːom] | p. 277; §I.2.4, pp. 288–291 |
| Resh | [r] everywhere | uvular [ʀ̟]; pharyngealized [rˤ] after an alveolar (also across a shewa, or closing a syllable one begins) and before l or n: [jisrˤɔːˈʔeːel] | §I.1.20, pp. 223–231 |
| Doubled yod (wayyōʾmer, hayyôm) | [jj] | the stop [ɟɟ] | §I.1.10, p. 201 |
| ḵ, ḡ | [x], [ɣ] | uvular [χ], [ʁ] | pp. 154–156, 204–207 |
| k p t with dagesh | plain | aspirated [kʰ pʰ tʰ], a geminate [ttʰ] | pp. 204, 213, 237 |
| Furtive pataḥ | [a] after the vowel | a glide first: [w] after u o, [j] after i e: [ˈʀ̟uːwaħ], [ʀ̟ɔːˈqiːjaʕ] | pp. 298–299 |
| A doubled letter at the end of a word (ʾatt) | doubled | single: [ˈʔaːatʰ] | p. 415 |

**The pinned readings stay SBL's.** They are the transliteration a learner knows from textbooks:
šāmərû, ûḇəmôšaḇ, hinənî. `tiberian.py` says them as Khan describes, so the shewa rules re-pinned
nothing, and a reading shown to learners later is still the convention.

**Stress at a verse's end, and yetiv (`pointing.py`).**
- **Silluq.** It is the meteg sign on a verse's last word and it marks the stress (p. 455). The
  word before sof pasuq (׃) now reads its last meteg sign as silluq. `nabu tiberian` takes the ׃.
- **Yetiv.** It stands on a word's first letter, but only on words stressed on their first
  syllable, so it marks the stress (p. 327): lā́mmâ, not lommâ.
- **Measured.** Over the Codex's 305,517 words, 3,462 readings change, every one of them
  verse-final or with yetiv. Seven of the course's story readings change, with the sentences
  that share their words: ʾayyékkâ (Gen 3:9), ʾānṓḵî (Gen 4:9), ʾēlếḵā (Gen 22:2), šəḵémâ
  (Gen 37:14), gəzṓrû (1 Kgs 3:26), ʾā́ttâ (Jonah 1:8), yənaḥămúnî (Ps 23:4).
- **The drafting tool** now takes its readings from `pointing.py` itself.

**eSpeak NG approximates less.**
- **Better.** Resh is the `ar` table's trill `R`; its `r` had been an English-type [ɹ]. Doubled
  yod is `J`, and ḵ is `X`.
- **Still missing.** The table has no [ɛ ɔ ʀ ʁ]: segol is [e], qamets [ɑ], resh a trill, and ḡ [ɣ].
- **Not said.** An echo vowel is one long vowel; Khan says it was barely heard. Aspiration is
  IPA only: eSpeak's aspiration modifier (`#`) cuts the rest of the word off.
- **Clips.** About 620 of hbo's clips were made again.
- **Not modelled.** These are listed in `tiberian.py`: gaʿya and its effects, half-long vowels,
  deḥiq, segol-yod [ɛː], the backed pataḥ [ɑ], and coda ʾalef.

**Grammar: what Joüon–Muraoka shows to be wrong is fixed.**

| Where | Was | Now | Joüon–Muraoka |
|---|---|---|---|
| form:inf-abs (Ex 20:12 כַּבֵּד, 1 Kgs 3:26 וְהָמֵת) | "as a command, 'do!'" | in laws, "you shall …"; before its own verb, emphasis | § 123v n. 6, § 123i |
| form:juss | "let him do" | also, with אַל, "do not …!" (7 of its 14 types) | § 46a, § 114g–i |
| form:coh | taught in unit 10 | taught in unit 6, where וַאֲגַדְּלָה (Gen 12:2) first has it (it had been tagged yiqtol); "let me, let us" | § 45, § 61f |
| The plural construct of nouns always plural (פְּנֵי, אֱלֹהֵי, מֵי: 28 tokens) | form:cstr | form:pl-cstr, now taught in unit 2; form:cstr is taught there with רוּחַ אֱלֹהִים, pinned construct as Gen 1:2 has it | § 90f, § 136c |
| form:pl, form:f, form:ptc-pass | "masculine -îm, feminine -ôṯ"; "-â"; the example אֻכָּל | "-îm or -ôṯ" (endings, not genders); "-â or -eṯ"; בָּרוּךְ first, אֻכָּל an older kind | § 89a, § 90a n. 4; § 56c, § 58b |
| אֲנִי יָרֵא (Jonah 1:9, story and sentence) | qatal-3ms | the verbal adjective: ptc-ms, whose gloss now says so | § 41c |
| וְנָתַן (1 Sam 17:47, the story) | qatal-3ms | weqatal-3ms, as its sentence has it | § 117a |
| nagad | stem unset | hiphil (הִגִּיד) | P16 |
| hava (Gen 3:8, 3:10) | one KC for niphal and hithpael | hava (niphal נֶחְבָּא) and hitchabbe (hithpael הִתְחַבֵּא), each by its stem, as ADR 0082 asks; a new sentence וָאֵחָבֵא | § 40a n. 3, P2 |
| barukh | "the passive participle of בָּרַךְ" (whose qal is "kneel") | a qal passive participle, beside the verb's piel בֵּרַךְ | § 50d |

The 52 other stem labels agree with Joüon–Muraoka.

**Word order: the Hebrew accept sets take the other order where Biblical Hebrew has it and the
English is the same.** Each sentence is shown in one order, but its `reverse` set had only that
order. So "טוב האור" for "the light is good" was wrong, in tiles and typed. The criterion (Ben's)
is that the other order is accepted only if its English translation would be the same. Each set
now lists the text's own order first, then:

| Clause | Other order accepted | Joüon–Muraoka |
|---|---|---|
| nominal (הָאוֹר טוֹב, אָנֹכִי בַּגָּן, יְהוָה רֹעִי) | predicate first (טוֹב הָאוֹר, Gen 1:4) | § 154f, p. 531: S–P in about two of three, P–S in the rest |
| participle (הָאָדָם מִתְהַלֵּךְ, אָנֹכִי שֹׁמֵר) | the participle first; with a pronoun subject that is the unmarked order | § 154f, pp. 533–534 |
| plain qatal, yiqtol, jussive, cohortative (יְבָרֶכְךָ יְהוָה, הַנָּחָשׁ הִשִּׁיאַנִי) | the subject on the other side of the verb; a pronoun's side makes no difference | § 155k, pp. 545–546 |

- **Never moved.**
  - Wayyiqtol and weqatal: their vav cannot leave the verb, and a subject first needs another
    form, X-qatal (§ 155k, § 118d).
  - Imperatives.
  - A clause after a vav, a particle, a question word, a subordinator (לְמַעַן) or a relative:
    after אֲשֶׁר, a pronoun comes before its participle (§ 154f, p. 533).
  - Sentences of more than one clause.
  - A subject inside a construct chain.
- **Not where the English would change.**
  - Identity between two definite terms. קַיִן אָחִי is "Cain is my brother", but אָחִי קַיִן is
    "my brother is Cain" or "my brother Cain". The same goes for יְהוָה רֹעִי and הִיא אִמּוֹ. A
    first or second person pronoun stays the subject in English either way: אֲנִי יְהוָה and
    יְהוָה אֲנִי are both "I am the LORD".
  - The blessing formula. בָּרוּךְ אַתָּה is a wish, "Blessed are you!"; אַתָּה בָּרוּךְ is a
    statement.
  - A wish whose verb is a plain yiqtol. With its subject first, יְהוָה יְבָרֶכְךָ reads "the
    LORD will bless you". A distinct jussive keeps its wish in either order (יְהִי אוֹר, יָאֵר
    יְהוָה).
  - What reads unpointed as a construct chain. Behind ב, כ and ל the article is a vowel, so
    בגן האדם reads "in the man's garden" and בבית אבי "in my father's house". Kept where the
    next word cannot be a genitive (בגן הוא), or the first is visibly absolute (על הארץ, with its
    article written; באדמה, whose construct would end in ת).
- **Which sentences.** 52 of the course's 696. The drafting script finds the subject from the
  Codex's morphology: a noun, a name or a pronoun that agrees with the verb, next to it, at the
  start of the clause. Every result was read against its English. Dictation (listen-type) is now
  gone from hbo (its facets leave out listen).

**Glosses: 305 of 312 agree with Holladay.** The others are fixed:

| KC | Was | Now | Holladay |
|---|---|---|---|
| liqrat | "meeting" (a noun) | "to meet; toward, against": the infinitive of II קָרָא, used as a preposition | p. 323 |
| gadal (piel) | "to make great" | + "magnify; to bring up (a child)" | p. 56 |
| marah | "sight, appearance" | + "vision" (he files Ex 3:3 there) | p. 213 |
| ratsach | "to murder" | "to kill, murder" (he draws no line between the two) | p. 346 |
| yevemet | "a brother's widow" | + "a husband's brother's wife" (Ruth 1:15) | p. 126 |
| kidon | "javelin" | + "or a curved sword" | p. 156 |

Glosses that read like dictionary definitions are short glosses now: levav, rahamim, olah, seh,
shinnen, tsalmawet (pp. 172, 337, 273, 349, 379, 306).

**Contrast sets can be limited by form (amends ADR 0081).**
- **`forms`.** A set applies only to words the course pins as one of these forms: the forms of
  the tokens a word spells. An entry also matches the forms it begins, so `form:yiqtol` matches
  `form:yiqtol-3ms`.
- **Why `inflected` is not enough.** It is set by sense. hbo pins forms on 43 nouns and
  adjectives (plural, construct, dual, suffixes), so a person-prefix set would catch a noun's
  first letter. And a verb's sense has perfects, so a perfect-ending set would catch its
  infinitives (בִּהְיוֹתָם).
- **The grader.**
  - `createGrader` passes each word's forms, keyed by `lexiconKey`, as `GradeOptions.forms`.
  - Accept-set spellings take their nearest word's forms.
  - core-cli's `grade` op takes `forms: {word: [form ids]}`.
  - `inflected` is unchanged.

**hbo's sets (REVIEW).** From Joüon–Muraoka § 42, 44, 61, 89–90, 94 and P1–P2:

| Set | Members | On words pinned as |
|---|---|---|
| person (the perfect's endings) | none, -â, -tā/-t (one unpointed), -tî, -û, -tem, -ten, -nû | qatal, weqatal |
| suffix (unchanged, plus two spellings) | -î, -ḵā (plene -ḵâ), -ô (and -hû), -āh, -ēnû, -ḵem, -hem/-ām | any word |
| verb-prefix (after ו) | א, ת, י, נ, none, ה (hiphil and hithpael perfects and imperatives) | yiqtol, wayyiqtol, jussive, cohortative, qatal, weqatal, imperative, infinitive |
| verb-ending (the prefix conjugation's) | none, -î (-în), -û (-ûn), -nâ (-n) | yiqtol, wayyiqtol, jussive, cohortative, imperative |
| agreement | none, -â/-eṯ (one member), -îm, -ôṯ | feminine, participle, plural |

- **What stays out.**
  - Participles have no person prefix: their מ/נ is the stem's.
  - The cohortative and long imperative -â changes no person.
  - אתה / את stay one member: apart, a plene 2ms perfect (קראתה) would read as the pronoun.
    ADR 0082 said they were WRONG_WORD a letter apart. They are not, though the bare pronouns
    are too short for a typo anyway.
- **Order.** The person set comes before the suffix set, so a perfect's ending gets the person
  note.

## Consequences

- **Measured on every hbo sentence, through the app's grader.** The slips are generated by a
  script, and the counts are slips that passed as typos:

  | Slip | Before | After |
  |---|---|---|
  | a verb's person prefix traded (ותברח for ויברח) | 465 | 0 |
  | the prefix dropped | 87 | 0 |
  | a prefix added to a perfect, imperative or infinitive | 140 | 0 |
  | a prefix-conjugation ending added or dropped | 81 | 0 |
  | a 3fs ending added to a 3ms perfect | 2 | 0 |

  The rest were already WRONG: under five letters, one slip is more than the typo budget.
- **Typos stay typos.**
  - A doubled letter inside a verb: 127 of 127, against 124 before. Two slips the old sets
    called WRONG_WORD are typos again.
  - A noun's first letter: 546 of 546, as before.
- **Conformance.** Nine vectors, in both harnesses:
  - prefixes traded, dropped and after ו;
  - a perfect's ending, a wayyiqtol's, and agreement;
  - a noun's first letter and an infinitive's -ôṯ, which stay typos;
  - the agreement slip without forms, which is a typo.
- **Other courses** grade as before. Only hbo's profile has `forms`.
- **Word order.** A reordered answer is CORRECT_ALT, in tiles, typing and fill-the-blank. A subject
  before a wayyiqtol is still wrong, and so are the orders whose English would change (a
  createGrader test).
- **The course.** 696 sentences and 358 KCs: one KC (hitchabbe) and one sentence (וָאֵחָבֵא).
  Lessons from unit 2 on change where form:pl-cstr, form:coh and hitchabbe are now taught.
- **Left for a reviewer** (courses/REVIEW.md, hbo):
  - Khan's unmodelled rules;
  - SBL against Khan, if readings are ever shown;
  - Holladay's narrower readings of naah (under נָוָה) and tsalmawet (צַלְמוּת, "darkness");
  - the long imperative לְכָה beside לֵךְ.
