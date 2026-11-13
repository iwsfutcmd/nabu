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
BCP 47 tag): the course's name and, for each orthography it teaches, the orthography's, with the
lines the course list says of them: a `blurb` on what the course teaches and, for a course in
several orthographies, a `hint` on what choosing each means.

```yaml
names:
  en:
    course: Lebanese Arabic
    blurb: "The Arabic of Lebanon, as people speak it every day."
    orthographies:
      apc-Arab/standard: Arabic script
      apc-Latn/arabizi: "Arabizi (Latin letters and numbers)"
    hints:
      apc-Latn/arabizi: "Latin letters and digits, as many Lebanese write in messages."
```

- The compiler copies them into the manifest and the bundles' `index.json`, so a list of courses
  names each before loading it. Lint `course.names` (warning): no name in a support language, or a
  name or hint for an orthography the course does not teach.
- Blurbs and hints came in as app messages (`course.blurb.*`, `orthography.hint.*`) while this was
  under way; no catalog had translated them, so they moved into the courses and left the catalog
  (`courseBlurb`, `orthographyHint` in `@nabu/i18n`).
- Names are plain text, not MF2 messages: the UI places them in its own messages (`$language`).
  A language that needs a name inflected can add a form to the schema then.
- One lookup, `courseName` and `orthographyName` in `@nabu/i18n`, for the app, the landing page
  and the UI package. In order: the course's own name in the UI language or a CLDR parent of it;
  else its English one, as the app's messages fall back to English; else the course's own in the
  first language it gives; else what CLDR calls the language or script (`Intl.DisplayNames`); else
  the id. Each field is looked up on its own: a translation without a blurb leaves the English one.
- A pseudo-locale (en-XA, ar-XB) is English made strange: it shows the English names
  pseudo-localized, as its messages are, so the visual matrix still sees names grow and mirror. It
  never shows the names of the language its tag begins with (ar-XB is not Arabic).
- No UI catalog carries a name (D19 in the 2026-11 review). The draft catalogs had translated the
  names before the courses carried them; those translations moved into `names` in each course,
  by language, each with its provenance (an LLM's, status draft), and the messages left every
  catalog, English included. A translation is course content now, reviewed as course content.
  The compiler reads a name as text in its own language: `text.invisible` lets a Persian name keep
  its ZWNJ in a course in any script.

```yaml
  ar:
    course: "العربية اللبنانية"
    orthographies:
      apc-Arab/standard: "الحروف العربية"
      apc-Latn/arabizi: "العربيزي (حروف لاتينية وأرقام)"
    provenance: {author: 'llm:claude@baa6bf1d5e24', status: draft}
```

**Reading schemes are data, with plug-ins for what voices do.** `profiles/schemes/<id>.yaml`
(`schemas/reading-scheme.schema.json`) says what a scheme is:

- its `names` by language, as a course's are: the scheme's (`scheme`) and its tones' pitches
  (`tones`), a translation with its provenance (the draft catalogs' `reading.scheme.*` and
  `player.tone.yue-jyutping.*` moved here; `player.tone.label` stays, placing the data's name);
- the `language` whose sounds it writes and the `lang` its text takes on its own;
- `answer`: the orthography its readings are in when a card offers them or asks for one; a scheme
  without one is shown, never asked (Pinyin and Baxter in Classical Chinese);
- `typed`: a typed syllable's shape, the locale it is lowercased in and what may stand between
  syllables (Jyutping only, so far);
- `tones`: what marks a tone in a syllable, and each tone's Chao letters (and a checked
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
- A catalog's reviewer no longer sees the names: a course's reviewer sees its names in
  `course.yaml`, and the schemes' are in `profiles/schemes`. A new UI language translates them
  there, in every course, as content.
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
