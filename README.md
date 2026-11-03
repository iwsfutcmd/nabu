# Nabu

An open-source, script-first, Duolingo-style language-learning app. Writing systems are data:
Persian, Cantonese, Uzbek and Lebanese Arabic fixtures (RTL, ZWNJ, ruby, vertical text,
modifier-letter apostrophes, unstandardized spelling) shape the architecture before any Latin-only
shortcut can.

- Architecture and roadmap: [docs/gameplan.md](docs/gameplan.md)
- Decisions: [docs/adr/](docs/adr/) (0001–0012 are gameplan §1; 0013+ came out of Phases 0–2)
- Working agreement for contributors and agents: [CLAUDE.md](CLAUDE.md)

## Status: Phase 2 (content compiler and fixture courses) on top of Phases 0–1

| Path | What |
|---|---|
| `schemas/` | JSON Schema 2020-12: TaggedText, Token, RubySegment, OrthographyProfile, MessageCatalog, CourseSource, BundleManifest |
| `packages/schema` | TS types generated from `schemas/` (branded, deeply readonly) |
| `pipeline/` | uv project: Pydantic v2 models generated from `schemas/`; the course compiler (`nabu build`, 36 lints with fixtures, deterministic content-addressed bundles), analyzer adapters (PyCantonese, hazm), CLDR RBNF number drills (PyICU), a LibreLingo importer |
| `packages/i18n` | Generated CLDR 49 tables (script metadata, likely subtags, parent locales, exemplars), locale negotiation, MF2 catalogs (`en`) and pseudo-locales (`en-XA`, `ar-XB`), font stacks |
| `packages/ui` | `<T>` (the only way language data reaches the DOM), demo exercise card, Storybook, visual matrix |
| `packages/lint` | Custom ESLint rules (§11.9) and strict logical-properties stylelint config, with fixtures |
| `packages/core` | Pure core: TaggedText checks, letters and case folding, the normalization engine, profile compiler, accept-set notation → lattice, closest-path matcher, typo models, grading |
| `packages/core-cli` | JSON-lines CLI over core (the Python pipeline's only way in), profile loader, conformance and property tests, throttled grading benchmark |
| `apps/web`, `apps/api` | Vite + React shell; Hono server (health, UI-locale negotiation) |
| `profiles/` | Orthography profiles: fa-Arab, yue-Hant-HK, uz-Latn, uz-Cyrl, ar-Arab, apc-Arab, apc-Latn (Arabizi), tg-Cyrl, tr-Latn; data tables and interim keyboard layouts |
| `courses/` | Fixture courses, one unit each: `fa` (ZWNJ plurals, ezafe), `yue` (Jyutping ruby, particles), `uz` (Latin + Cyrillic, script-convert node), `apc` (Arabic script or Arabizi, script-convert node). LLM-drafted, awaiting review |
| `conformance/` | 322 shared test vectors (graphemes, UnicodeSets, direction, case folding, normalization, segmentation, accept sets, grading, TaggedText), run in TS and Python |

## Getting started

Requirements: Node ≥ 22.18 (with corepack), [uv](https://docs.astral.sh/uv/), and Docker for the
pixel half of the visual tests.

```sh
corepack enable
pnpm install
(cd pipeline && uv sync)        # add --all-groups for PyICU (needs libicu-dev, pkg-config)
pnpm lint && pnpm typecheck && pnpm test
pnpm courses                   # compile the fixture courses
pnpm storybook                 # http://localhost:6006
pnpm test:visual:docker        # the visual matrix, in the same container CI uses
```

## Licence

Code: [MIT](LICENSE-MIT) OR [Apache-2.0](LICENSE-APACHE), at your option. Course content
defaults to CC BY-SA 4.0. Bundled fonts are OFL-1.1, and CLDR data is Unicode-3.0.
