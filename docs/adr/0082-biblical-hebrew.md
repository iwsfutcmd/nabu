# 0082. Biblical Hebrew: Tiberian-pointed text, pinned Tiberian readings, and a voice that is never Modern Hebrew

- Status: Proposed
- Date: 2026-11-08
- Amended by: [0084](0084-hbo-references.md) (the phonology checked against Khan; typo contrasts by form)

## Context

Ben asked for a whole Biblical Hebrew course with these properties:

- vowels (the points, niqqud) shown by default, with the switch the other courses have to turn
  them off;
- audio resembling the Tiberian pronunciation, if that can be had;
- explicitly not Modern Hebrew: no audio at all rather than Modern Hebrew audio.

Nothing in the app said how a Hebrew-script course is written, graded or voiced:

- **Text.** The Masoretic text is pointed: vowels, dagesh, the shin and sin dots, maqaf and sof
  pasuq, and the cantillation accents on top. ADR 0053's vocalization files suit a source written
  without marks (Persian, Lebanese). For Biblical Hebrew the pointing is not a property of the
  word: the same consonants are pointed by context (ʾēṯ / ʾeṯ- before maqaf, pausal forms,
  construct forms, a dagesh lene that depends on the word before), so a word list would be mostly
  ambiguities.
- **Readings.** Pointing is nearly phonemic but not quite: it does not say where the stress
  falls, whether a shewa is vocal or silent, or whether a qamets is gadol or qatan, and the divine
  name is not read as written. A voice cannot read pointed text and get these right.
- **Voices.** No voice of the existing providers speaks Tiberian Hebrew. eSpeak NG's `he` voice,
  every hosted Hebrew voice and every neural Hebrew model speak Modern Hebrew, which Ben ruled out.
- **CLDR.** `he` exemplars cover the points (auxiliary) but lack sof pasuq ׃.

## Decision

**The orthography `hbo-Hebr/tiberian`** (profiles/hbo-Hebr.tiberian.yaml):

- Content is written pointed, as the Westminster Leningrad Codex (WLC) has it, without the
  cantillation accents and without meteg: letters, vowels, dagesh, shin and sin dots, maqaf, sof
  pasuq.
- The marks set is every point and accent (U+0591–U+05C7 but maqaf, paseq, sof pasuq and nun
  hafukha). Grading ignores it (`policy: ignore`), so answers are typed unpointed or pointed and
  graded by their consonants. Accept sets (`reverse`) are written unpointed, with the plene
  spelling (ō and u written with vav) accepted beside the defective one.
- The `vocalized` layer is shown by default (`default: "on"`): "Show vowel marks" off strips the
  marks set and shows the consonantal text, as a scroll has it.
- Maqaf normalizes to a space, so ʾeṯ-hāʾôr can be typed with a hyphen, a maqaf or a space.
- Typo contrasts (ADR 0066, REVIEW): pronoun suffixes (סוסי / סוסו), perfect endings (‑תי / ‑נו /
  ‑תם) and the pronouns (הוא / היא) are WRONG_WORD a letter apart (אתה / את are one member: apart,
  a plene 2ms perfect would read as the pronoun). The person prefixes (אשמר / ישמר), the
  imperfect's endings and agreement are sets limited by form ([ADR 0084](0084-hbo-references.md)).
- Keyboard: the SI 1452 layout for the typo model (profiles/keyboards/he.yaml).
- Exemplars: CLDR `he`, plus sof pasuq. An `exemplarsExtra` entry that is punctuation now joins
  the punctuation set (the audit treated every extra as a letter).
- Fonts: Noto Serif Hebrew (OFL-1.1, self-hosted), a fifth larger than the text around it, with
  room for the points (`lineHeight: 2.1`). Its GPOS places every point and accent of the block.
- No region in the target (`hbo-Hebr`): the Bible belongs to no one country.

**Every word pins its Tiberian reading** (`readings: {tiberian: …}` on each token):

- The scheme is SBL academic transliteration — ʾ ḇ ḡ ḏ ḵ p̄ ṯ ḥ ṭ ṣ ś š ʿ; ā a ē e i ō o u;
  matres ê î ô û â; vocal shewa ə; ḥaṭefs ă ĕ ŏ; qamets qatan o — with an acute on a stressed
  vowel that is not the last (ʾéreṣ, šāmáyim) and a final hyphen on a word joined by maqaf, which
  has no stress of its own (ʾeṯ-).
- The divine name is pinned with its qere: יְהוָה is ʾăḏōnāy, as the Masoretes read it.
- The readings were drafted from the WLC itself, not guessed: the stress from each word's
  cantillation accent (prepositive and postpositive accents handled), vocal shewa and qamets
  gadol from meteg (ga'ya) and the morphology (the qal perfect qāṭəlâ, qāṭəlû), matres, dagesh
  lene and forte from context. A constructed sentence's word takes the reading of the same
  pointed form in the WLC (a lexicon of all 54,664 pointed forms of the Bible); a form the Bible
  does not have is reported for review. The rules are `nabu.audio.pointing`: `nabu tiberian <word>` reads a word copied with its
  accents from the WLC, as the drafts did (they agree on all 305,517 words of the WLC). The readings are content: pinned and reviewed like
  sentences, never derived at runtime.
- Token analyses come from the same source: the WLC's morphology (openscriptures/morphhb, CC BY
  4.0) gives each word's morph boundaries (prefixes, suffixes), lemma and form, which the drafts
  turned into `morphs` and `form:` KCs.

**The audio says the pinned reading as Tiberian phonemes** (`nabu.audio.tiberian`):

- A voice with `reading: tiberian` reads the pinned readings, and the planner turns each into
  eSpeak NG phoneme mnemonics, one `[[…]]` word at a time (`PHONEME_SCHEMES` in
  `nabu.audio.course`), ending with a question mark or a full stop for the intonation. The text
  is never given to a synthesizer, so nothing can read it as Modern Hebrew.
- The phonology follows Geoffrey Khan, *The Tiberian Pronunciation Tradition of Biblical Hebrew*
  (2020), as it was remembered here; [ADR 0084](0084-hbo-references.md) checks it against the book
  and corrects it (silent shewa after a long vowel, the echo vowel, uvular resh, [ɟɟ], [χ], …):
  - qamets (gadol and qatan) [ɔ], pataḥ [a], segol [ɛ], ṣere [e], ḥireq [i], ḥolem [o], qibbuṣ
    and shureq [u];
  - vowel length from stress and syllable: long when stressed or in an open syllable, short in
    an unstressed closed one; shewa and the ḥaṭefs short;
  - vocal shewa [a], but the following vowel before a guttural and [i] before yod;
  - begadkefat spirants [v ɣ ð x f θ]; vav [v]; ḥet [ħ], ʿayin [ʕ], ʾalef [ʔ] where a vowel
    follows it and silent where it quiesces; ṭet and ṣade pharyngealized, qof [q];
  - gemination for dagesh forte; the furtive pataḥ a short glide before the final guttural.
- eSpeak NG's Arabic phoneme table is the one with the gutturals, the emphatics and the spirants.
  What it lacks is approximated: segol is said [e], qamets as the backed [ɑ] of its emphatic
  context (measured: F1≈750 Hz, F2≈1110 Hz, apart from pataḥ and ḥolem), and resh as the
  table's trill (it has no uvular one; ADR 0084 found its `r` an approximant).
- Two voices (`ar` and its `+f2` variant) share the items (ADR 0078); a line whose grammar says
  who speaks gets that voice. The clips are rule-based synthesis, CC0, labelled synthetic.
- The QA trace of a phoneme clip is the phonemes it was given; there is no round-trip check
  (no recognizer knows Tiberian Hebrew).

**The course** (`courses/hbo`):

- Twenty units, A1 to A2: 696 sentences, 358 KCs (after ADR 0084), 90 lessons, twenty stories and nine roleplay
  scenarios. Each unit's lessons teach the words of a passage of the Hebrew Bible, and its story
  reads the passage (as lzh does, ADR 0071). Lessons mix constructed sentences with quotations
  once their words are known.

  | Unit | Passage | Unit | Passage |
  |---|---|---|---|
  | 1 | Genesis 1:3–5, Let there be light | 11 | Exodus 20:2–3, 12–16, the ten words |
  | 2 | Genesis 1:1–3, In the beginning | 12 | Deuteronomy 6:4–7, Hear, O Israel |
  | 3 | Genesis 3:8–10, Where are you? | 13 | Ruth 1:15–17, Where you go |
  | 4 | Genesis 3:11–13, What have you done? | 14 | 1 Samuel 3:4–10, Speak, LORD |
  | 5 | Genesis 4:8–10, My brother's keeper | 15 | 1 Samuel 17:45–47, In the name of the LORD |
  | 6 | Genesis 12:1–4, Go forth | 16 | 1 Kings 3:22–27, The wise king |
  | 7 | Genesis 22:1–8, Here I am | 17 | Jonah 1:1–3, Jonah runs away |
  | 8 | Genesis 24:17–20, At the well | 18 | Jonah 1:4–9, I am a Hebrew |
  | 9 | Genesis 37:13–16, Seeking my brothers | 19 | Psalm 23:1–4, The LORD is my shepherd |
  | 10 | Exodus 3:2–6, The burning bush | 20 | Ecclesiastes 3:1–4 and Numbers 6:24–26 |
- KCs are lexemes (verbs by stem: `dibber` is the piel of דבר, `hirah` the hiphil of ראה);
  prefixes (וְ, הַ, בְּ, לְ, כְּ, מִן, הֲ) and pronoun suffixes are morphs; verb forms are `form:`
  KCs on the token, by conjugation and person (`form:wayyiqtol-3ms`, `form:qatal-1cs`,
  `form:impv-fs`), as are plural, dual, construct and the directional -â. `iPlusOne: 2`, as for
  Spanish: a new verb in a new form is two KCs.
- Every person Hebrew marks is exercised (ADR 0075): a woman speaking (Eve, Rebekah), spoken to
  ("Who are you?" מִי־אָתְּ), and several people addressed (לְכוּ, שָׁלוֹם לָכֶם).
- The passages are the WLC (public domain), accents removed; everything else is an LLM draft
  (`llm:`, status draft, CC-BY-SA-4.0) awaiting review.

## Consequences

- "Show vowel marks" works for Biblical Hebrew as for Arabic: on by default, off for the
  consonantal text; the `vocalize` card asks a learner to point a word.
- A Hebrew course could now be Modern Hebrew with another profile (`he-Hebr/…`) and a text voice;
  nothing here assumes Biblical Hebrew outside `hbo-Hebr/tiberian` and the `tiberian` scheme.
- The audio is intelligible, rule-based speech with the Tiberian consonants and vowel system; it
  is not natural speech. A better voice is a config change: any synthesizer that takes IPA can
  take `nabu.audio.tiberian.ipa`. A recorded reader of the Tiberian tradition would be better
  still (`nabu audio ingest`).
- Word cards whose lemma form appears in no sentence or story line (אָמַר when the sentences have
  וַיֹּאמֶר) have no clip: KC forms pin no readings.
- Not done:
  - showing the transliteration as a reading layer (ruby) on request, as lzh shows its readings;
    the readings are there;
  - cantillation (te'amim) as a display layer;
  - a lint that re-derives a pinned reading from the WLC and warns where it differs (`nabu tiberian`
    gives the reading for one word; checking every token needs the WLC's accented text in the repo).
- Open questions for a reviewer are in courses/REVIEW.md.
