# CLAUDE.md: Nabu

Open-source, script-first, Duolingo-style language-learning app.
Architecture and roadmap: docs/gameplan.md. §1 lists the decisions; any change to one needs an ADR in docs/adr/.

## Non-negotiables
- Language data is never a bare string. Use `TaggedText` (a BCP 47 tag with script, plus tokens) and render it only through `<T>`.
- No physical CSS (left/right, margin-left, text-align: left, width/height in components). Use logical properties.
  stylelint enforces this. Never disable the rule.
- No user-facing string literals. Add MF2 messages in packages/i18n/messages/.
- Never index, slice, reverse or count user-visible text by UTF-16 unit or code point. Use the grapheme utilities in @nabu/core/text.
- NFC at every boundary. NFKC only through a named orthography-profile step.
- No toLowerCase()/toUpperCase() on language data without a locale. Prefer the profile's case folding.
- packages/core is pure: no I/O, no Date.now(), no Math.random(). Inject the clock and a seeded RNG.
- Direction comes from the script subtag (Intl.Locale#maximize plus generated script metadata), never from a language name.
- During IME composition: never submit, never normalize, never reset the input value.
- Every new normalization or matching behavior needs vectors in conformance/ that pass in BOTH the TS and Python harnesses.
- Every content item and asset needs provenance and an SPDX license.
- The fixture courses (fa, yue-Hant-HK, uz, apc) must stay green, and UI changes must pass the visual matrix (LTR, RTL, vertical).
- Never hand-edit packages/schema or the Pydantic models. Edit schemas/ and regenerate.

## Style
- TypeScript: strict; functional; discriminated unions; Result types for expected failures; no classes in core.
- Python: uv; generated Pydantic models; Typer CLIs; pytest + Hypothesis; type-checked with pyright.
- Conventional commits. Small PRs, one roadmap deliverable each.

## Commands
- pnpm i && pnpm dev               # web + api
- pnpm lint · pnpm typecheck · pnpm test   # all packages incl. the Python pipeline (via turbo)
- pnpm test:visual:docker          # visual matrix in the pinned Playwright image (needs Docker)
- pnpm test:visual:update          # same, rewriting baselines: review every changed PNG
- pnpm storybook                   # toolbar: UI locale, pseudo-locale, target, dir, writing mode
- pnpm codegen                     # schemas/ → packages/schema (TS) + pipeline (Pydantic); CSS module types
- pnpm cldr                        # regenerate packages/i18n/src/generated from the pinned CLDR packages
- pnpm conformance                 # TS + Python harnesses over conformance/ (≥300 vectors)
- pnpm test:perf                   # grading p95 < 5 ms, 4× CPU throttling, cold caches (Chromium)
- pnpm tables                      # regenerate profiles/tables from pinned Unihan/OpenCC
- pnpm courses                     # compile every course in courses/ (lint only; diagnostics as file:line)
- cd pipeline && uv run nabu build ../courses/<id>   # write the bundle to dist/<id>; `uv run nabu lints` lists lints

## Phase 0–1 notes (see docs/adr/0013–0026)
- TypeScript is pinned to 6.0.x: typescript-eslint's type-aware rules need the JS compiler API, which TS 7 lacks.
- Workspace packages ship TS source; relative imports carry `.ts` extensions; Node ≥ 22.18 runs scripts directly.
- Generated, never hand-edited: packages/schema/src/generated, pipeline/src/nabu/schema/models.py,
  packages/i18n/src/generated, **/*.module.d.css.ts. CI fails if they are stale.
- Visual baselines are only valid from the pinned container; never update them from a bare host run.
- Lint rules and their fixtures live in packages/lint. A new rule needs a fixture that proves it fires.
- Write invisible characters (ZWNJ, bidi controls) as \u escapes in source, never literally.
- Grading lives in @nabu/core (accept/, match/, normalize/, profile/); profiles get their data passed in.
- A new grading behaviour needs conformance vectors (conformance/*.json) that pass in both harnesses.
- Profile policies marked REVIEW await Ben's linguistic sign-off.

## Phase 2 notes (see docs/adr/0027–0033)
- Course sources: courses/<id>/course.yaml + units/*.yaml (schemas/course-source.schema.json). Every orthography's
  form is pinned; tokens are aligned to `text`; translations and `reverse` are accept sets.
- Fixture courses fa, yue, uz, apc are LLM-drafted (`llm:` provenance, status draft) and await native review.
- A new lint needs a registry entry (pipeline/src/nabu/compiler/diagnostics.py) and a fixture: add a mutation to
  pipeline/tests/fixtures/make_lint_fixtures.py and run it. clean.yaml must stay diagnostic-free.
- Write course YAML with nabu.yamlio.dump (keeps invisibles as \u escapes), never yaml.safe_dump.
- Analyzers (PyCantonese, hazm) are a default uv group; PyICU is the `icu` group (apt install libicu-dev pkg-config,
  then uv sync --all-groups). NABU_REQUIRE_TOOLS=1 turns tool-dependent skips into failures (CI sets it).
- CLDR exemplar gaps go in a profile's `exemplarsExtra` (marked REVIEW), never by loosening the script audit.
