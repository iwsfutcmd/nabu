# 0109. Course names and reading schemes are data, not app code

- Status: Proposed
- Date: 2026-11-12
- Amends: gameplan §1 decision 8 (course and orthography names were MF2 messages of the app)

## Context

The 2026-11 review (C19) found that every new course needed new app messages: its name
(`course.name.<id>`) and its orthographies' (`orthography.<id>`) lived in the UI catalogs, and
the app and the landing page each had their own `courseName`. A course is content; its name is
part of it, and a course added to `courses/` should appear in the app without touching the app.

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

## Consequences

- A new course needs no catalog entry, and its name is translated where its content is.
- The draft catalogs' 21 names are duplicates of course data until moved; a reviewer of a catalog
  still sees them there.
- Spoken names of combining marks (`player.key.mark.*`) stay messages: since vocalize became
  multiple choice (ADR 0098) no view offers a mark key, so none is reachable; if typed marks come
  back, the names belong with the keys in the profile.
