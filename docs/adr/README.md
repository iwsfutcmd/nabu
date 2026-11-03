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

Template: [0000-template.md](0000-template.md).
