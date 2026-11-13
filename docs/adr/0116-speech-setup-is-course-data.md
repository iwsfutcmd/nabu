# 0116. Speech setup is course data: each profile says how its orthography is heard

- Status: Proposed
- Date: 2026-11-12
- Amends: [0046](0046-speech.md) (where the per-orthography tiers live),
  [0094](0094-yue-voxcpm2.md) (the Cantonese recognizer is the yue profile's),
  [0109](0109-names-and-schemes-are-data.md) (its last consequence: the recognizer and speech
  settings were still per language in code)

## Context

How speech is heard was configured in code, in three places (the 2026-11 review's C6):

- **The API** had `SPEECH_SETUP`, keyed by orthography id, for fa, yue, uz and apc. It gave each the
  tiers the speech service scores, Whisper's language code (apc's was "ar") and the eSpeak NG voice
  or reading scheme for the expected phones. es has a good voice and Whisper reads Spanish, but no
  one added it, so its learners' speech was never scored.
- **The audio CLI** had `ASR_LANGUAGE` and `ESPEAK_VOICE`, keyed by course id: apc's clips were
  heard as Arabic and aligned with Arabic phonemes.
- **The round trip** had `FINE_TUNED`, keyed by language: yue's clips were heard by a Cantonese
  fine-tune.

A new course meant edits to tables in two languages. The tables said the same thing twice: that
Lebanese Arabic is heard as Arabic.

## Decision

**An orthography profile says how speech in it is heard**, under `speech`
(`schemas/orthography-profile.schema.json`):

- **`tiers`**: what the speech service scores. 1 is the words, where Whisper writes the
  orthography; 2 is the phones, where the expected phones can be trusted. The tiers stay marked
  REVIEW, now in each profile.
- **`recognizer`**: who hears the orthography.
  - `language` is the language Whisper hears it as; it defaults to the profile's language.
  - `fineTuned` (`model`, as repo@revision, and `token`, the Whisper language token it was trained
    with) is a fine-tune that hears it instead of Whisper's own.
- **`phones`**: where the expected phones come from.
  - `reading` is a scheme whose pinned readings give them (Jyutping).
  - `voice` is the eSpeak NG voice that reads the spelling; it defaults to the profile's language.

The setups are the API's, plus es:

| Orthography | Tiers | Heard by | Expected phones |
|---|---|---|---|
| fa-Arab/standard | 1, 2 | Whisper, fa | eSpeak NG fa |
| yue-Hant-HK/standard | 1, 2 | the Cantonese fine-tune (token zh) | pinned Jyutping |
| uz-Latn/standard | 1, 2 | Whisper, uz | eSpeak NG uz |
| uz-Cyrl/standard | none: Whisper writes Uzbek in Latin letters | | |
| apc-Arab/standard | 1 | Whisper, ar (the macrolanguage) | not scored: eSpeak NG's Arabic is Standard Arabic |
| apc-Latn/arabizi | none: Whisper writes Lebanese in Arabic script | | |
| es-Latn/standard | 1 (new) | Whisper, es | not scored (below) |

**A language a tool has no model for is heard as its macrolanguage.** apc is heard as ar; yue
stays yue, since Whisper has it; hbo stays hbo, which has no macrolanguage, and Whisper refuses it
as before.

- **The data is CLDR's.** `pnpm cldr` writes `packages/i18n/src/generated/macrolanguages.json`
  (253 languages) from two lists, which are disjoint:
  - the replacements its aliases give for a reason of "macrolanguage": arb → ar, cmn → zh;
  - its one-way language matches at distance 10 between two bare languages: apc → ar, yue → zh.
- **Each tool says what it has.** Whisper answers with its `supported_languages`, eSpeak NG with
  whether it has a voice of that name, so no table here lists either's languages.

**Everyone reads the profile.**

- **The API** reads the course's profile from its bundle. `/v1/speech/status` gives its tiers.
  `/v1/speech/score` sends the service the profile's language (apc, not ar) with its recognizer
  and phones.
- **The speech service**:
  - hears the language as above;
  - defaults the eSpeak NG voice to the language's;
  - loads a fine-tune only if a profile names it. A model named in a request would run code from
    wherever it came from.
- **The audio CLI**:
  - `nabu audio generate --check` and `nabu audio check` hear clips with the recognizer of the
    orthography they say;
  - `nabu audio align` and `ingest --align` take that orthography's eSpeak NG voice.
- `SPEECH_SETUP`, `ASR_LANGUAGE`, `ESPEAK_VOICE` and `FINE_TUNED` are gone.

**The profile, not `course.yaml`.** The review suggested `audio.check` and `align` settings in
`course.yaml`. They are in the profile instead, for two reasons:

- The recognizer and the phones are facts about an orthography. Learners' speech and the course's
  clips share them, and one place keeps the two in step.
- The API reads courses from their bundles, which carry profiles but not `course.yaml`.

If a course ever needs settings of its own, beyond its orthography's, it can add them then.

**es is scored on its words (tier 1), not its phones.** eSpeak NG's es is Castilian: θ for c and z,
and every s pronounced. The course is Cuban Spanish for heritage speakers (ADR 0076). Seseo, and an
s aspirated or dropped before a consonant (ehtá), would be marked wrong where they are right. es-419
(seseo) still says every s. Tier 2 waits for phones that fit Cuban speech, or for recorded learners
to show the error is small (REVIEW).

**Unchanged:**

- Device tone scoring stays off (ADR 0093).
- The recognizer is never prompted with the sentence.
- The bundle format stays as it is (`formatVersion` 1, ADR 0110). Profiles gain an optional field,
  which an older app ignores.

## Consequences

- A new course's learners get speech scoring from a line in its profile, `speech: {tiers: [1]}`,
  where Whisper writes its orthography. A language Whisper lacks but whose macrolanguage it has
  (the Arabic varieties, the Chinese ones) needs nothing more.
- **Speech scoring waits for rebuilt bundles.** Until a course's bundle is rebuilt, its profile has
  no `speech` and nothing in it is scored. There is no fallback table.
- **Deploy the API and the speech service from one commit.** The API sends the orthography's
  language (apc), not Whisper's code. A service from before this change would refuse apc.
- The speech image (`deploy/speech.Dockerfile`) copies the profiles and `macrolanguages.json`.
- CLDR's list is not the whole IANA registry. It has pes → fa, for one, but not prs → fa. A language
  it misses needs a `recognizer.language` or `phones.voice` in its profile.
- The clips' QA records name the same recognizers as before (`whisper-large-v3-turbo`,
  `alvanlii/whisper-small-cantonese@b03a4e5d482f`), so no clip needs checking again.
