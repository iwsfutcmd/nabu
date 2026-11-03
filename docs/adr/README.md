# Architecture decision records

Numbering follows gameplan §0: **0001–0012 are the twelve decisions in [gameplan §1](../gameplan.md#1-the-decisions)**
(accepted 2026-11-02, recorded there rather than duplicated here). Any change to one of them needs a
new ADR that supersedes it. New decisions start at 0013.

| # | Title | Status |
|---|---|---|
| 0001–0012 | Gameplan §1 decisions 1–12 | Accepted |
| [0013](0013-typescript-6.md) | Pin TypeScript to 6.0.x | Proposed |
| [0014](0014-ts-source-packages.md) | Workspace packages ship TypeScript source; Node runs it directly | Proposed |
| [0015](0015-schema-codegen-conventions.md) | Schema bundling, branded and readonly TS types, Pydantic aliases | Proposed |
| [0016](0016-orthography-profile-v0.md) | OrthographyProfile v0 shape, profile files, corrections to §6.3 | Proposed |
| [0017](0017-cldr-data.md) | CLDR data: pinned cldr-json, checked-in tables, our own likely subtags | Proposed |
| [0018](0018-ui-locales-and-pseudo-locales.md) | Catalog format, negotiation and pseudo-locales | Proposed |
| [0019](0019-self-hosted-fonts.md) | Self-hosted OFL webfonts; no system fallback for language data | Proposed |
| [0020](0020-visual-testing.md) | Storybook + Playwright in a pinned container; structural checks | Proposed |
| [0021](0021-lint-tooling.md) | `packages/lint`: rule semantics and strict logical CSS | Proposed |
| [0022](0022-typed-css-modules.md) | Generated CSS module declarations | Proposed |
| [0023](0023-grading-engine.md) | The deterministic grading engine | Proposed |
| [0024](0024-profile-data.md) | Profile data: equivalences, tables, numbering systems | Proposed |
| [0025](0025-interim-keyboards.md) | Interim, hand-encoded keyboard layouts | Proposed |
| [0026](0026-conformance-and-performance.md) | Conformance harnesses and the performance budget | Proposed |
| [0027](0027-course-source-format.md) | Course source format: forms per orthography, aligned tokens, KC links | Proposed |
| [0028](0028-compiler-lints.md) | Compiler lints and file:line diagnostics | Proposed |
| [0029](0029-bundle-format.md) | Bundle format and byte-for-byte determinism | Proposed |
| [0030](0030-analyzers-and-icu.md) | Analyzers, ICU and tool availability | Proposed |
| [0031](0031-librelingo-importer.md) | LibreLingo importer (own parser; AGPL loader avoided) | Proposed |
| [0032](0032-exemplar-gaps.md) | `exemplarsExtra` and the corrected Simplified-only table | Proposed |
| [0033](0033-fixture-courses.md) | Fixture courses: scope and modelling conventions | Proposed |
| [0034](0034-lesson-player.md) | The lesson player: pure core, templates, IME-safe shell; on-screen keyboards deferred | Proposed |
| [0035](0035-bundles-in-the-client.md) | Course bundles in the client (committed, CI-checked), pictures, vocalization | Proposed |
| [0036](0036-learner-model-and-planner.md) | Learner events, projections (FSRS-6 facets, Elo, XP, mistakes) and the session planner | Proposed |
| [0037](0037-local-first-app.md) | The local-first app: IndexedDB event log, path, review and mistakes | Proposed |
| [0038](0038-server-sync-and-accounts.md) | Server event store (Postgres/PGlite), sync with an outbox, optional accounts behind our own adapter | Proposed |
| [0039](0039-placement-and-calibration.md) | Placement v0 and the DuckDB calibration notebook | Proposed |
| [0040](0040-audio-pipeline.md) | Audio: pinned-reading synthesis (eSpeak NG, Piper), committed clips, forced alignment, round-trip QA gating, human recordings | Proposed |
| [0041](0041-listening-in-the-app.md) | Listening templates, karaoke, "Can't listen now" | Proposed |

Template: [0000-template.md](0000-template.md).
