# 0156. South Tyrolean: the dialect, spelled as Moser spells it, voiced by cloning VinKo's speakers

- Status: Proposed
- Date: 2026-11-23
- The owner asked for a course on South Tyrol German and put two books in the library. On the questions
  this record first asked, the owner answered: "for å, do whatever the TTS handles better; otherwise,
  whatever, just go wild" (2026-11-23). Claude's answers are folded in ("Decided", at the end).
- Built 2026-11-23: ten units, A1 to early A2 (374 sentences, 269 lexemes, nine scenarios), drafts awaiting a
  native reviewer. Where the build departs from the first draft: the dark a is written o, not å (the voice
  test below); the `scope` label is not built (Standard German answers are plain wrong for now); ten units,
  not twenty.

## Context

German-speaking South Tyroleans live in diglossia: Standard German is what they write, read and hear
on the news; the dialect is what they speak, at home, at work, in shops, in text messages. Moser's
foreword calls the dialect their "eigentliche Muttersprache". The dialects are South Bavarian, and they
differ from valley to valley (Moser's own example: *Stein* is *Stoan* in the Eisacktal and elsewhere,
*Stuan* in the west and the side valleys south of the Brenner, *Stan* in the upper Pustertal, *Stã* in
the Eggental). AlpiLinK's page on the Tyrolean dialects puts the real line east–west, not north–south (the
*Tirolischer Sprachatlas*'s maps): Vinschgau, for
instance, has a pronoun system in which many dialects use one form for nominative, accusative and
dative.

A course on Standard German as written in South Tyrol (*Kondominium*, *Matura*) would be a German
course with a regional glossary. What a learner cannot get anywhere else is the dialect, so this course
teaches the dialect.

What the library has (ADR 0079; notes in `nabu/notes/bar/`):

- **Moser**, *Wörterbuch der Südtiroler Mundarten* (Haymon, 2015). A born-digital ebook, clean text,
  no page numbers (cite headwords). It lists only words that Standard German lacks or uses otherwise,
  each with its sound variants and the valleys it comes from (Pass., Pust., Vin., Sa., Ahrnt. …; an
  untagged word is general). Its appendix states a spelling (below). The core grammar appears only in
  its examples: no verb paradigm, no numbers, nothing on pronunciation beyond the spelling.
- **Weiß**, *Syntax des Bairischen* (1998). Central Bavarian, his home dialect in the Bavarian
  Forest; nothing Tyrolean. Usable where it states a rule for Bavarian as a whole (clitic order,
  double negation, the article with names, the dative). OCR text layer; PDF page = printed page + 10.

The survey of both (`nabu/notes/bar/survey.md`) lists what they attest: the 2sg ending **-sch** (*bisch,
hasch, geasch*), the 2pl **es / enk** with verbs in **-ts** (*håbts*), 1pl *mir* with the clitic
*-ma/-mer* (*hamma, gian mer*), the masculine article *in/an* for dative and accusative alike, the
dative plural *di*, the perfect as the past with *war* the one surviving preterite, the subjunctives
*war, hatt, tetn, kannt*, *tian* as a periphrastic auxiliary, *nit* (not) beside *nix/nicht*
(nothing). And what they lack: full paradigms (*woaß*, *kinnen* are not attested), numbers,
relative clauses, pronunciation. Tscholl (1999), *Die jetzige Südtiroler Mundart in Wortschatz und
Struktur*, and the *Tirolischer Sprachatlas* (1965–71) would fill most of it.

No voice model knows South Tyrolean, or any Bavarian: OmniVoice lists German but no Alpine variety,
and the Hugging Face Hub has no Bavarian voice or speech dataset. What does exist is the **VinKo
Corpus** (Rabanus et al. 2023; Universities of Verona, Trento and Bozen, 2018–2022, continued as
AlpiLinK): native speakers recorded saying stimulus sentences in their own dialect, 20,659 files for
the Tyrolean dialects, under CC BY-NC-SA 4.0. Its consent form tells speakers the anonymous data may be
spread publicly and for educational purposes under that licence, and they grant the right to distribute
their voice recordings. 117 South Tyrolean speakers told all or nearly all of a 17-sentence story (a
witch and a hunter), about 70–110 s each.

## Decision (proposed)

**A course `bar`, South Tyrolean dialect (`bar-IT`; CLDR's likely subtags make it bar-Latn-IT), one
orthography `bar-Latn/moser`.** The rest of this section is Claude's proposal for each question the
owner has not answered; the questions are listed at the end.

**Which dialect.** The text is written in the forms Moser files his entries under (the most widespread,
or the one nearest the standard: *Stoan*, *rotn*, *schlogn*), which comes to a central variety, Bozen and
the Eisacktal. A western or Pustertal form that Moser lists is accepted where a learner types it
(*Stuan*, *Stan*), as es accepts pan-Hispanic forms beside the Cuban ones (ADR 0076). Vinschgau's
pronoun system and other valleys' grammar are a note, not a second canon.

**The spelling** (Moser's appendix, without the dictionary's aids):

- **o** for the dark a between a and o (*Wosser*, *olt*, *hot*), which Moser writes å (*Fåsching*,
  *Wåsser*), as dialect poems and song books do; the long a that became o is written o too (*rotn*,
  *schlogn*). The owner left å to the voice: OmniVoice cloning reads å as o (2026-11-23: the first formant
  and the second of the stressed vowel in seven words, each written å, o and a, in both voices: å lies at
  0.89 and 0.92 of the way from a to o, at times past o towards u; Whisper heard *Kult* for *kålt*), never
  between, and o gives a steady [ɔ]. Most people write o in messages. An å a learner types is read as o.
- A falling diphthong that starts in i is written **ia** (*schiach*, *Diarn*), whatever its second
  half sounds like in a given valley; so are *ua*, *oa*, *ea* (*Bua*, *Stoan*, *geasch*).
- Umlauts are unrounded, as the dialects say them: *Hittn*, *Heisl*, *efta*.
- **-scht-, -schp-** inside a word (*isch*, *Fenschter*), but **St-, Sp-** at its start.
- ss after a short vowel and after *au*, *ei*; ß after a long vowel and the other diphthongs (*Goaß*).
- gg (unaspirated) apart from ck (aspirated) inside and at the end of a word (*Buggl*, *buckn*).
- Nouns capitalized, as in German. Every e sound written e (*Besn*, not *Beisn*).
- Not kept: the acute on a diphthong's first vowel, the dot and the bar under stressed vowels (a
  dictionary's pronunciation aids), and the stroke between a compound's parts.
- **Free spellings, stated in the profile** (ADR 0148, `kind: free`, each REVIEW): -n and -en after a
  consonant at a word's end (*gessn*, *gessen*); ia and ie (*wia*, *wie*); ß and ss; -sch and -scht at a
  word's end (*bisch*, *bischt*); and å, which normalization reads as o. Not stated: oa beside ua (ua is
  *Bua*'s own diphthong, where oa is never said: a free oa/ua would take *Boa* for *Bua*), the participle's g-
  beside ge- (a statement cannot add a syllable), the valleys' other variants. South Tyroleans write the dialect every day with no norm, so a course that
  marked *gessen* wrong for *gessn* would teach nothing true. This is the first course where free
  variation is the rule, and the profile, not the accept sets, carries it.

**Standard German answers.** A Standard German word for a dialect one (*ich habe* for *i hon*, *Tag* for
*Tog*) is not accepted: today it is wrong (phonemic or lexical). ADR 0148's `scope` label (the right
concept, a variety the prompt ruled out) fits it exactly and has never been produced; building it is the
plan's stage 7, so the feedback can one day say "that is Standard German" instead of "wrong".

**The learner**: an adult English speaker, A1 to early B1, as sk's; support `en`. (A German-speaking
learner would want a contrastive course, an Italian-speaking South Tyrolean an Italian one; see the
questions.)

**The lexicon** (`lexicons/bar`, the lexical model, UD tags and features):

- Nouns store Gender, every noun (no `defaults`: the dialect drops the endings that tell German's
  genders, Kuchl, Schual); tokens choose Case (Nom, Acc, Dat; no genitive) and Number, a noun's case its
  phrase's. Articles, adjectives and pronouns choose what they agree in, every value written.
- Verbs: finite forms choose Person, Number, Mood (Ind, Sub), Tense; the past is the perfect (AUX
  *hobm*/*sein* + the participle, `VerbForm: Part`), with *war* `Tense: Past` its one preterite. The 2sg
  -sch and the 2pl -ts are endings of the verb, not clitics (Moser derives -ts from *es*; the course
  teaches it as an ending). Pronoun clitics (*-ma*, *-s*, *’n*) are lexemes their token writes.
- *tat* + infinitive (would) is a rule (`rule:tian-would`), as apc's patterns are; *hatt gearn* (I'd like)
  is hobm's subjunctive.
- Fused forms are a token writing two lexemes: a verb and its 's (*geat's*, *gip's*, *isch's*, *regnet's*),
  a preposition and the article written as its n (*afn*, *mitn*).
- Labels name the forms by their pronoun ("present: you (du) … -sch").

**Persons and register** (ADR 0056, 0075): *du* to one person, *es* (with -ts) to several, *Sie* to one
person politely; tagged where the dialect marks what English cannot. Gender is marked only on 3sg
pronouns and adjectives' agreement, as in German. *es/enk* as a polite singular is old usage (Moser),
taught as a note.

**The voice: OmniVoice cloning VinKo speakers** (ADR 0058, 0076, 0078). Cloning carries the speaker's
accent, as it did for es; no designed voice could sound South Tyrolean.

- The test (2026-11-23): two references of about 13 s, three dialect sentences of the story each, from
  a woman in Bozen (VinKo speaker U0430) and a man in Meran (U1810), with transcripts Claude wrote
  from Whisper's output and the stimulus; nine dialect items in the spelling above, `language: de`,
  OmniVoice at the pinned revision, bfloat16 on 4 CPU cores, about 30 s a clip. Whisper (which writes
  Standard German) recovers the meaning of most (*Gestern habe ich nicht viel Zeit gehabt* for *Geschter
  hon i nit viel Zeit ghobt*) and misses dialect-only words (*schians*, *Marende*). Whether they sound
  South Tyrolean is a listener's call; the owner has the files.
- Clips are CC-BY-NC-SA-4.0: OmniVoice's weights are non-commercial, and the reference adds share-alike
  (grc's clips carry the same licence). Each voice credits its VinKo speaker id and the corpus.
- `audio.quality: good`. ADR 0091 would have a model not of the language iffy, even reading through a
  native speaker's voice; the owner listened and rated it good (2026-11-24: "It sounds good"; "yeah,
  switch it to good"), so bar has listening cards. A native listener should still go through the audio
  check, and a clip they reject is made again.
- The round trip cannot read dialect spelling: Whisper writes Standard German. Clips are passed by a
  listener in the audio check (`nabu audio verdicts`), not by the round trip. Speaking is self-rated
  (tier 0) only.
- The course is 743 clips: about six hours on a cloud container's CPU, under an hour on a Kaggle T4
  (about 10 s a clip). The first 482 were made on a CPU, the rest on Kaggle (2026-11-24).

**Stories** are the course's own, everyday scenes with recurring people, as the other courses have.
Public-domain text in South Tyrolean dialect is rare; a passage is added only if one is found and
read from a page image.

`iPlusOne: 2`, `wordParts: true`. No script track (a Latin orthography never gates, ADR 0149).

## Consequences

- The first course with no standard to teach: its spelling is a convention the course states, and the
  profile's free correspondences do most of the accepting. Accept sets list one spelling per form.
- The `scope` label gets built (ADR 0148), and with it a feedback line for "another variety".
- The first course whose voices are cloned from a research corpus's anonymous volunteers.
- New files: `profiles/bar-Latn.moser.yaml`, a German QWERTZ keyboard (`profiles/keyboards/de.yaml`),
  `lexicons/bar/`, `courses/bar/`, conformance vectors for every free correspondence in both harnesses.
- Every sentence is an LLM draft awaiting a native speaker, and Claude's written South Tyrolean is
  weaker than its Slovak: there is little written dialect to learn from and no norm. A reviewer should
  read units 1–2 before the rest is drafted.

## Decided (Claude, on the owner's "whatever, just go wild", 2026-11-23)

1. **The dialect, not Standard German**, the central forms canonical (Moser's headwords), other valleys' as notes.
2. **The spelling**: Moser's without his stress marks, the dark a written o (the voice, above), å accepted as o.
3. **The learner**: English speakers from nothing; support `en`.
4. **Standard German answers**: wrong; the `scope` label is a later stage.
5. **The voices**: cloned from two VinKo volunteers (U0430 Bozen, U1810 Meran), credited by speaker id and corpus;
   their consent covers distribution for educational purposes under CC BY-NC-SA 4.0. A volunteer who asks the
   project to withdraw a recording is a reason to recast.
6. **A native reviewer**: none yet; every item is a draft (courses/REVIEW.md lists what to check first).
7. **Size and status**: ten units, A1 to early A2, a fixture course from the start (CLAUDE.md).
8. **Polite address**: *Sie* with *Eana*; *es/enk* to several people, their old polite use a note.
