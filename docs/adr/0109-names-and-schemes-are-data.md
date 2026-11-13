# 0109. Course names and reading schemes are data, not app code

- Status: Proposed
- Date: 2026-11-12
- Amends: gameplan §1 decision 8 (course and orthography names were MF2 messages of the app);
  [0054](0054-pronunciation-exercises.md) and [0071](0071-classical-chinese.md) (what a new reading
  scheme needs: a syllable shape and a `READING_TAGS` entry in code)

## Context

The 2026-11 review found two ways a new course or script meant editing shared code.

- **Names (C19).** Every new course needed new app messages: its name (`course.name.<id>`) and its
  orthographies' (`orthography.<id>`) lived in the UI catalogs, and the app and the landing page
  each had their own `courseName`. A course is content; its name is part of it.
- **Reading schemes (C3).** What a reading scheme is (Jyutping, Pinyin, Baxter, sitelen Lasina, the
  Tiberian reading, Attic) was spread over tables in TypeScript and Python: `READING_TAGS`,
  `SYLLABLE`, `TONE_SYSTEMS` and the tone note in core and the UI; `IPA_SCHEMES`,
  `PHONEME_SCHEMES`, `PIPER_PHONEME_SCHEMES`, an `attic` branch, a Han check, `BY_READING` and the
  tone letters in the pipeline. The Jyutping syllable was written as a regular expression five
  times and the tone contours twice. Some branches did the wrong thing quietly: `pronounced()` ran
  the Jyutping tables whatever the scheme, and the expected phones of a recording fell back to
  eSpeak NG reading the surface as a modern language for the Tiberian reading and Attic, which
  ADR 0082 and 0087 forbid.

## Decision

**Names are course data.** `course.yaml` gives `names`, by the language they are written in (a
BCP 47 tag): the course's name and, for each orthography it teaches, the orthography's.

```yaml
names:
  en:
    course: Lebanese Arabic
    orthographies:
      apc-Arab/standard: Arabic script
      apc-Latn/arabizi: "Arabizi (Latin letters and numbers)"
```

- The compiler copies them into the manifest and the bundles' `index.json`, so a list of courses
  names each before loading it. Lint `course.names` (warning): no name in a support language, or a
  name for an orthography the course does not teach.
- Names are plain text, not MF2 messages: the UI places them in its own messages (`$language`).
  A language that needs a name inflected can add a form to the schema then.
- One lookup, `courseName` and `orthographyName` in `@nabu/i18n`, for the app, the landing page
  and the UI package. In order: the course's own name in the UI language or a CLDR parent of it;
  else a UI catalog's (`course.name.<id>`, `orthography.<id>`); else the course's own in the first
  language it gives; else what CLDR calls the language or script (`Intl.DisplayNames`); else the id.
- The catalogs keep their `course.name.*` and `orthography.*` messages for now, only so the draft
  catalogs' translations keep working. Their English is pinned to the courses' by a test. They go
  when the courses carry the names in those languages (moving a draft translation into
  `course.yaml` makes it course content, reviewed as course content).

**Reading schemes are data, with plug-ins for what voices do.** `profiles/schemes/<id>.yaml`
(`schemas/reading-scheme.schema.json`) says what a scheme is:

- its `name` (by language, as course names are), the `language` whose sounds it writes and the
  `lang` its text takes on its own;
- `answer`: the orthography its readings are in when a card offers them or asks for one; a scheme
  without one is shown, never asked (Pinyin and Baxter in Classical Chinese);
- `typed`: a typed syllable's shape, the locale it is lowercased in and what may stand between
  syllables (Jyutping only, so far);
- `tones`: what marks a tone in a syllable, and each tone's name, Chao letters (and a checked
  syllable's), shape and the device classifier's template.

Core reads the files through `@nabu/schema/schemes`, generated and validated by `pnpm codegen`
(`readingScheme`, `readingTag`); the pipeline reads them itself (`nabu.schemes`). What each half
does with that data is written once and pinned to the same conformance vectors
(`reading-syllables`, `reading-tone` in `conformance/pronounce.json`: core through core-cli,
`nabu.schemes` in `tests/test_schemes.py`).

What the pipeline does with a scheme's readings, where it can, is code registered by scheme in
`nabu.schemes.plugins`: `espeak` (phoneme input), `piper` (the IPA a Piper voice takes), `ipa` and
`settled` (inline IPA for a `pronounce` voice), `phones` (alignment and scoring), `cite` (a word
card's citation form) and `read` (readings of written characters, for the round trip). A voice
says a scheme as phonemes because it has an `espeak` plug-in, takes IPA because it has `ipa`; the
round trip compares a language's transcript by reading because a scheme of that language can
`read`. A profile's reading layer and a course voice must name a scheme that has data (`compileProfile`
fails with `unknown-scheme`; the audio planner with `audio.schema`).

## Consequences

- A new course needs no catalog entry, and its name is translated where its content is.
- The draft catalogs' 21 names are duplicates of course data until moved; a reviewer of a catalog
  still sees them there. The same goes for the reading schemes' names (`reading.scheme.*`) and
  Cantonese's tone names (`player.tone.yue-jyutping.*`, now `player.tone.label` around the data's
  name).
- A new reading scheme is a data file; it needs code only for what voices and checks do with its
  readings. Shown as ruby it needs nothing else; asked for, an `answer`; typed, a `typed` shape
  and vectors; heard as tones, `tones` (and native recordings before anyone trusts the templates).
- The expected phones of a recording in a phoneme scheme are eSpeak NG's phonemes of its phoneme
  input, as forced alignment already did: never the surface read as a modern language.
- The recognizer a language's clips are checked with (`FINE_TUNED`) and the speech settings are
  still per language in code: C6 moves them.
- Spoken names of combining marks (`player.key.mark.*`) stay messages: since vocalize became
  multiple choice (ADR 0098) no view offers a mark key, so none is reachable; if typed marks come
  back, the names belong with the keys in the profile.
