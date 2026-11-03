# Nabu

An open-source, script-first, Duolingo-style language-learning app. Writing systems are data:
Persian, Cantonese, Uzbek and Lebanese Arabic fixtures (RTL, ZWNJ, ruby, vertical text,
modifier-letter apostrophes, unstandardized spelling) shape the architecture before any Latin-only
shortcut can.

- Architecture and roadmap: [docs/gameplan.md](docs/gameplan.md)
- Decisions: [docs/adr/](docs/adr/) (0001–0012 are gameplan §1; 0013+ came out of Phases 0–3)
- Working agreement for contributors and agents: [CLAUDE.md](CLAUDE.md)

## Status: Phase 7 (gamification and notifications) on top of Phases 0–6

| Path | What |
|---|---|
| `schemas/` | JSON Schema 2020-12: TaggedText, Token, RubySegment, OrthographyProfile, MessageCatalog, CourseSource, BundleManifest, LearnerEvent |
| `packages/schema` | TS types generated from `schemas/` (branded, deeply readonly) |
| `pipeline/` | uv project: Pydantic v2 models generated from `schemas/`; the course compiler (`nabu build`, 49 lints with fixtures, stories, deterministic content-addressed bundles), analyzer adapters (PyCantonese, hazm), CLDR RBNF number drills (PyICU), a LibreLingo importer; DuckDB calibration of the performance model (`nabu calibration`, `notebooks/calibration.py`); audio (`nabu audio`: eSpeak NG / Piper synthesis from pinned readings, or hosted ElevenLabs / Cartesia voices with keys from the environment; forced alignment, Whisper round-trip QA, human-recording ingestion) |
| `packages/i18n` | Generated CLDR 49 tables (script metadata, likely subtags, parent locales, exemplars) and Unicode 16 security data (confusables, identifier status), locale negotiation, MF2 catalogs (`en`) and pseudo-locales (`en-XA`, `ar-XB`), font stacks |
| `packages/ui` | `<T>` (the only way language data reaches the DOM; tappable words for glossing), the lesson player (templates, word bank, IME-safe input, feedback, ruby and harakat toggles), the story reader (dialogue, tap-for-gloss, questions, vertical reading), Storybook, visual matrix |
| `packages/lint` | Custom ESLint rules (§11.9) and strict logical-properties stylelint config, with fixtures |
| `packages/core` | Pure core: TaggedText checks, letters and case folding, the normalization engine, profile compiler, accept-set notation → lattice, closest-path matcher, typo models, grading, the runtime glossary (longest match, exact and folded passes); lessons (templates, seeded lesson builder, player state machine); the learner model (event projection: FSRS-6 facets, Elo performance model, XP, mistakes, path) and the seeded session planner; stories (scripts and the reader state machine); game rules (streaks with freezes and date-line bridging, quests, achievements, gates, league XP) and UTS #39 username checks |
| `packages/core-cli` | JSON-lines CLI over core (the Python pipeline's only way in), profile loader, conformance and property tests, throttled grading benchmark |
| `apps/web` | Vite + React client: course list, the streak and quests panel, the course path (lessons and stories unlock in order), placement, review and mistakes sessions, listening exercises with karaoke, XP; every learner event kept in an on-device IndexedDB log, with optional account sync, a profile, the weekly league and practice reminders (service worker); reads the committed bundles (`public/bundles`); Playwright e2e |
| `apps/api` | Hono server: optional accounts, the learner event log (Postgres via Drizzle, or PGlite with no setup), idempotent uploads, sync by cursor, server projections by the same core replay; profiles (UTS #39 usernames), opt-in leagues with an idempotent weekly rollover, opt-in Web Push reminders (RFC 8291/8292 on node:crypto) |
| `profiles/` | Orthography profiles: fa-Arab, yue-Hant-HK, uz-Latn, uz-Cyrl, ar-Arab, apc-Arab, apc-Latn (Arabizi), tg-Cyrl, tr-Latn; data tables and interim keyboard layouts |
| `courses/` | Fixture courses, one unit each, with their audio (`audio/`, clips and index): `fa` (ZWNJ plurals, ezafe), `yue` (Jyutping ruby, particles), `uz` (Latin + Cyrillic, script-convert node), `apc` (Arabic script or Arabizi, script-convert node); one story each (the apc one vocalized). LLM-drafted, awaiting review |
| `conformance/` | 340 shared test vectors (graphemes, UnicodeSets, direction, case folding, normalization, segmentation, accept sets, grading, TaggedText, glossing), run in TS and Python |

## Getting started

Requirements: Node ≥ 22.18 (with corepack), [uv](https://docs.astral.sh/uv/), and Docker for the
pixel half of the visual tests.

```sh
corepack enable
pnpm install
(cd pipeline && uv sync)        # add --all-groups for PyICU (needs libicu-dev, pkg-config)
pnpm lint && pnpm typecheck && pnpm test
pnpm courses                   # compile the fixture courses
pnpm dev                       # the web app and the API (PGlite: no database server needed)
pnpm test:e2e                  # lessons by keyboard and by touch, IME, axe, progress, placement, sync
pnpm --filter @nabu/core simulate --out /tmp/sim.jsonl && (cd pipeline && uv run nabu calibration /tmp/sim.jsonl)
pnpm storybook                 # http://localhost:6006
pnpm test:visual:docker        # the visual matrix, in the same container CI uses
```

## Licence

Code: [MIT](LICENSE-MIT) OR [Apache-2.0](LICENSE-APACHE), at your option. Course content
defaults to CC BY-SA 4.0. Bundled fonts are OFL-1.1, and CLDR data is Unicode-3.0.
