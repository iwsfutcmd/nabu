# 0155. Slovak: standard Slovak from A1 to B1, from the library's three Slovak books

- Status: Proposed
- Date: 2026-11-23
- The owner's answers to the build plan's questions (2026-11-23) are folded in: the learner as
  proposed; a cast of the course's own in everyday scenes, as the other courses have; public-domain
  passages; no apostrophe for the caron; aspect pairs as two lexemes; the voice Claude's pick; sk a
  fixture course. A reviewer is not yet known.

## Context

Ben asked for a Slovak course built from the Slovak books in the reference library (ADR 0079,
`books/ling/ine/sla/slk`). There are three:

- **Mistrík**, *A Grammar of Contemporary Slovak*, 2nd ed. (Bratislava: SPN, 1988). A normative
  handbook in English: sounds and spelling, every declension and conjugation paradigm, word
  formation, syntax. Text layer good but for some marks (ľ read as r, ĺ as f): check Slovak on a
  page image. Printed page = PDF page + 2.
- **Naughton**, *Colloquial Slovak: The Complete Course for Beginners*, 2nd ed. (Routledge, 2012;
  the library file says 2011). Sixteen units for adult English speakers, beginner to about B1.
  Its text layer (an Internet Archive scan) drops most marks (*Co robite?* for *Čo robíte?*), so Slovak
  is read from page images. Printed page = PDF page − 14.
- **Kamenárová et al.**, *Krížom-krážom: Slovenčina A1* (Bratislava: Studia Academica Slovaca,
  Comenius University, 2009). The standard A1 textbook of Slovak as a foreign language, ten
  lessons, written in Slovak. A scan with no text layer: read from page images, or OCR a lesson at a time
  (Tesseract's `slk` data).

All three are under copyright. The course takes facts from them (forms, paradigms, glosses, the
order grammar is taught in), never their sentences, dialogues, exercises or characters.

Slovak is the first Slavic language in Nabu. It brings things no course has had together:

- **Six cases** (nominative, genitive, dative, accusative, locative, instrumental; a vocative only
  in a few set words), **three genders**, and **animacy** in the masculine, which decides the
  accusative singular (*vidím brata* but *vidím dom*) and the nominative plural (*dobrí študenti*,
  *dobré stoly*; *dvaja študenti*, *dva stoly*). Adjectives, pronouns and numerals agree in all of
  these (Mistrík 18–70).
- **Aspect**: nearly every verb is imperfective or perfective, mostly in pairs (*robiť* / *urobiť*,
  *kupovať* / *kúpiť*). A perfective verb's present forms say the future (*urobím* "I will do"), and
  an imperfective's future is *budem* plus the infinitive (Mistrík 75–76).
- **A past that agrees in gender**: the l-participle and the present of *byť* (*robil som*, *robila
  som*; the third person has no auxiliary). Every first-person sentence in the past, and every
  predicate adjective (*som unavený* / *unavená*), says whether a man or a woman speaks.
- **Ty and vy**: *vy* is both the plural and the polite singular. Polite address takes the plural
  verb and participle but a singular predicate adjective in the addressee's gender (*boli ste
  unavená?* to one woman).
- **Free word order with clitics in second position** (*som*, *sa*, *si*, *mi*, *ho*, *by*), and no
  articles: English *a* and *the* both have no Slovak word.
- **A spelling whose four marks all carry sound** (Mistrík 12–16). The acute (*dĺžeň*) marks length,
  never stress: stress is always on the first syllable and never written, so *zle* "badly" and
  *zlé* "bad" (neuter) are two words. The caron (*mäkčeň*; printed as a stroke on ď ť ľ) makes
  another consonant. ä (*dve bodky*) is said as e by most speakers, ô (*vokáň*) as the diphthong
  [u̯o]. And the spelling writes what the sound does not:
  - i and y, í and ý say the same, which is the first thing Slovak children are drilled on (the
    *vybrané slová* after b, m, p, r, s, v, z and l: *byť* "to be", *biť* "to beat"; *my* "we", *mi*
    "to me");
  - after d, t, n, l, the letter i or e makes the consonant soft and y keeps it hard (*deti* is said
    *ďeťi*, *ty* is said *ty*);
  - a voiced consonant is voiceless at a word's end (*hrad* is said *hrat*), and consonants agree in
    voicing in a cluster (*všetko* is said *fšetko*, *kde* is said *gde*);
  - v after a vowel and before a consonant or at the end is [u̯] (*pravda*, *domov*), as the u of
    the instrumental *-ou* is (*ženou*).

## Decision

**A course `sk`, standard Slovak (`sk-Latn`; CLDR's likely subtags make it sk-Latn-SK), for adult
English speakers starting from nothing, A1 to B1 in twenty units.** Its brief, cast, conventions and
syllabus are in `courses/sk/README.md`; the build order, stage by stage, in `docs/gameplan-sk.md`.

- **Order**: units 1–10 follow Krížom-krážom's grammar order (the cases as it brings them in:
  nominative, accusative, instrumental, locative; then the past and reflexive verbs), with the
  genitive singular from Naughton. Units 11–20 follow Naughton's later units (aspect and the future,
  the dative, the genitive plural and quantities, the imperative, the pronouns in every case, verbs
  of motion and their prefixes, comparison, the conditional, the passive). Every form is checked
  against Mistrík's paradigms.
- **Its own people and stories**, as the other courses have them: everyday scenes in Žilina with
  people who come back from unit to unit (two sisters, a boyfriend, the neighbours and their son, a
  grandmother in a village under the Malá Fatra; the README), no stand-in for the learner and no plot.
  Nothing is taken from the books.
- **Real Slovak at the end**: units 16–20 each also read a short passage of Pavol Dobšinský's folk
  tales (*Prostonárodnie slovenské povesti*, 1880–1883; Google's scans of two volumes dated 1881 on
  archive.org), public domain. The text is taken from the scan and checked on the page image, then
  written in by a script; its spelling is modernized and every change listed in the story's notes;
  a tale in dialect is not used.
- Every facet (recognize, produce, listen, speak). **No script track**: Slovak is a Latin
  orthography, which never gates (ADR 0149); its letters and marks are taught inside the course, as
  Spanish spelling is.
- `iPlusOne: 2` (a new noun in a new case is two new parts, as a new verb in a new tense is in es) and
  `wordParts: true` (a Slovak word carries case, number, gender, person and aspect: what the parts
  cards ask, ADR 0152).

**The profile `sk-Latn/standard`** (the *Pravidlá slovenského pravopisu*; Mistrík 12–16). Every policy
is REVIEW.

- Letters: the 46 of the alphabet, digraphs as letters of their own as uz-Latn has them (a á ä b c č
  d ď dz dž e é f g h ch i í j k l ĺ ľ m n ň o ó ô p q r ŕ s š t ť u ú v w x y ý z ž). Exemplars
  `cldr:sk`.
- Normalize: NFC; curly apostrophes to straight; punctuation stripped (with „ and “); whitespace
  collapsed. An apostrophe typed for the caron (*d'akujem*, as ď looks) is not folded into it: it is
  a missing caron (the owner: folding it would be a bad precedent).
- Case folded in `sk`. **All four marks are required** (acute U+0301, caron U+030C, diaeresis
  U+0308, circumflex U+0302): one left out, added or moved is never a typo and never excused, as in
  es since ADR 0148. The sound statement labels the miss: *pas* for *pás* and *cas* for *čas* say
  another sound (phonemic), *zle* for *zlé* is another word of the course too (lexical).
- Typos: the keyboard model on a Slovak QWERTZ layout (a new `profiles/keyboards/sk.yaml`). Contrast
  sets (ADR 0066) for case, number and person endings and for the pronouns and pronoun clitics; with
  the lexicon deciding most of them (a typed form of the word is decided by lexeme and form), the sets
  catch forms the course does not write.
- **The sound statement** (ADR 0148, 0153). `sound: {from: spelling}`, no `stress` (it is always the
  first syllable). Length needs no statement: a long vowel is a letter of its own (á is not a), so *pas*
  and *pás* say different things already. Every correspondence fixed:
  - i and y say i, í and ý say í: both common after b, m, p, r, s, v, z, f; after h, ch, k, g, y is the
    rule and i is `rare` (*kino*, *chémia*). After the soft consonants nothing is stated: y is never
    written there. l is with d, t, n below (the norm says *li* soft, *ly* hard), though schools teach
    its *vybrané slová* with the others.
  - d, t, n, l before i, í, e and the diphthongs ia, ie, iu say ď, ť, ň, ľ, with ď ť ň ľ `rare` there
    (*ďeti* for *deti* is the right sound with the wrong letter). y after them is plain i, so *ti* and
    *ty* say different things, as they do.
  - ä says e after p, b, m, v, with ä `rare`: *mäso* has a spelling leftover (*meso*), *meno* none.
  - v after a vowel, before a consonant or at the end, says u̯, and so does u after o at the end
    (*pánov* and *pánou* say the same). Stated before voicing, so it wins there.
  - Voicing: b d ď g h z ž dz dž v say p t ť k ch s š c č f at a word's end and before a voiceless
    consonant (*hrad*, *všetko*); p t ť k ch s š c č say b d ď g h z ž dz dž before a voiced obstruent
    (*kde*, *prosba*), never before v or a sonorant (*svet*, *tma*).
  - Left out, and why: ie, ia, iu beside je, ja, ju (said alike by many speakers, distinct in the
    norm); ľ beside l (merged in the west, distinct in the norm); the hard de, te, ne, le of a closed set
    of words (*ten*, *teraz*, *jeden*, *vtedy*) and of loanwords (*telefón*, *diplom*), which the
    statement reads soft (the cost: a learner who writes *ťen* gets an orthographic miss, not a
    phonemic one); voicing across a word boundary (*v škole*, *s bratom*), which a word's statement
    cannot see.
- `speech: {tiers: [1]}`: Whisper writes Slovak. Phones (eSpeak NG has `sk`) once a learner's
  recordings can check them.
- `input.keyboard: sk` (ADR 0143).

**The lexicon `lexicons/sk`**, in the lexical model with Universal Dependencies' tags and features as
the Slovak SNK treebank uses them (checked against its development set):

- **Nouns** store Gender (and Animacy, in the masculine) where `defaults` do not give it: a consonant
  masculine inanimate, -a feminine, -o, -e, -ie neuter, -osť feminine. People and animals store
  `Animacy: Anim`; masculines in -a (*hrdina*, *kolega*) and neuters in -a (*dievča*) store theirs.
  A noun's token chooses Case and Number.
- **Adjectives, determiners, pronouns and numerals** choose Case, Gender, Number and, in the
  masculine, Animacy by their agreement in the line, every value written (as grc's article):
  *dobrého* in *mám dobrého brata* is `{Animacy: Anim, Case: Acc, Gender: Masc, Number: Sing}`.
- **Verbs** store `Aspect` (Imp or Perf), one lexeme each (*robiť* and *urobiť*, as UD lemmatizes
  them; the pair is noted on both). Finite forms choose Person, Number, Tense, Mood and VerbForm; a
  perfective's present is `Tense: Pres` as UD has it, and its label says the future. Negation is
  joined to the verb and chosen on its token (`Polarity: Neg`, as UD: *nerobím*); *nie som* writes
  the particle *nie* apart. The past is the l-participle (`{Gender, Number, Tense: Past, VerbForm:
  Part}`) with *byť* as AUX in the first and second persons; the conditional adds *by* (AUX, `Mood:
  Cnd`); the imperfective future is *budem* (AUX, `Tense: Fut`) and the infinitive. A departure from
  UD, stated: the participle carries no Animacy (UD marks it on the masculine singular; the form shows
  none).
- **Reflexive clitics** *sa* and *si* are lexemes (PRON, `Reflex: Yes`) with tokens of their own. A
  reflexive verb is a lexeme cited with its clitic (`lexeme:volať-sa`, spelled *volať sa*): the verb's
  token names it, the clitic's names *sa*, as es's *me levanto*.
- **Prepositions** are ADP lexemes, their vocalized forms spelled variants (*v* / *vo*, *s* / *so*,
  *z* / *zo*, *k* / *ku*).
- **Labels** name the cases by use ("accusative: the object, and after *na* for where to"), the
  persons with their pronouns ("present tense: I (ja)"), and the past by who speaks ("past tense: I,
  a woman (robila som)").
- **Rules come later.** Slovak's declension (Mistrík's twelve noun paradigms and two adjective ones),
  its conjugation (fourteen paradigms, Mistrík 78) and the rhythmic law (two long syllables never
  follow each other: *krásny*, not *krásný*; Mistrík 35) are regular enough to be rules
  (docs/rules-design.md), and Slovak's would be the first declension written as rules. The course starts
  as es did, every form the sentences write pinned in the lexicon; sk's rules are a stage of their own
  after apc's and Spanish verbs.

**Persons, register and what the prompt leaves open** (ADR 0056, 0075, 0085, 0147):

- Sentences whose Slovak marks the speaker's or the addressee's gender, or the addressee's number,
  carry `persons` tags (`speaker: f`, `addressee: m`, `addressee: pl`). Lucka's and Dominik's first-person
  sentences come in pairs (*bola som* / *bol som*), and the course speaks to men, to women and to
  several people.
- Polite *vy* sentences carry `register: formal` with the addressee's gender. Untagged "you" accepts
  every *ty* and *vy* form that fits. When ADR 0147's prompt tags are built, the prompt will show
  "(formal)".
- Accept sets take, writing Slovak: the subject pronoun or none; every word order whose translation
  would be the prompt, with the clitics in second position (never a clitic first); both aspects where
  the English does not decide (*I wrote a letter*: *písal som list* and *napísal som list*).
  Writing English: *a* and *the* wherever Slovak says neither, and every tense the aspect allows.

**The voice** (ADR 0040, 0078, 0091; the owner left the choice to Claude): **Piper's
`sk_SK-lili-medium`**, one voice for the whole course.

- It is a model of Slovak: one woman's CC0 Slovak recordings (OHF-Voice's voice datasets),
  fine-tuned from Piper's `en_US-hifi_tts_92` voice, itself trained on NVIDIA's Hi-Fi TTS (CC BY 4.0,
  LibriVox readings). The clips are CC-BY-4.0, crediting both datasets: the most a chain of CC0 and
  CC BY asks, and free of the non-commercial condition apc's and es's OmniVoice clips carry.
- It runs on a CPU in seconds a clip (the pipeline pins piper-tts 1.8, which it needs at 1.5 or
  later), so regenerating after a change costs minutes, not a GPU session.
- One voice reads every line, men's too (ADR 0078 allows a one-voice cast).
- Rated `good` only after the round trip (Whisper hears Slovak) and a listener's pass in the audio
  check. If it fails either, the fallback is OmniVoice (it lists `sk`) cloning a man's and a woman's
  CC0 recordings, its clips CC-BY-NC-4.0.

**References**: the three books, cited by author, title, year and page; notes in the library's
`nabu/notes/sk/`.

## Consequences

- The first Slavic language. grc has cases as feature values already; Slovak adds the locative and the
  instrumental, agreement in animacy, aspect as a lexical feature and a gendered past, and the lexical
  model's labels, word-parts cards and gap-fill questions are tried on them. Two gaps known now: a label
  cannot yet read a lexical feature (a perfective's present needs "future" where an imperfective's says
  "present"), and ADR 0147's register and aspect tags are not built.
- A large lexicon of pinned forms until sk has rules: about 600 sentences, 450 lexemes and some
  1,500 pinned forms over twenty units.
- New files: `profiles/sk-Latn.standard.yaml`, `profiles/keyboards/sk.yaml`, `lexicons/sk/`,
  `courses/sk/`; conformance vectors for the marks, i and y, the soft consonants, ä and voicing in both
  harnesses; the length and caron notes in every UI catalog (drafts outside English, stamped).
- The towns, mountains, foods and customs the stories mention are real and checked as facts; the
  people are invented.
- sk joins CLAUDE.md's fixture courses once units 1–10 build clean (the owner), so CI keeps it green
  from then on.
- Every sentence is an LLM draft (`llm:` provenance, status draft, CC-BY-SA-4.0) awaiting a native
  speaker. No Slovak reviewer is named yet.
- Not in it: the vocative (the course addresses people in the nominative, as Slovak does: *pán doktor*,
  *Lucka*); dialects but a note (eastern Slovak's stress, unit 17); Czech, which a learner will meet and
  half understand.
