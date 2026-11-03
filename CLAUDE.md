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
- pnpm i && pnpm dev               # web + api (API on PGlite in apps/api/.data; no database server needed)
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
- pnpm bundles                     # rebuild apps/web/public/bundles (committed; CI fails if stale)
- pnpm test:e2e                    # lesson per course by keyboard and touch, IME composition, axe

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

## Phase 3 notes (see docs/adr/0034–0035)
- Lessons: pure @nabu/core/lesson (templates, buildLesson, step). The player shell and views are @nabu/ui/player;
  views render state and dispatch PlayerEvents, never grade or advance themselves.
- After changing courses/ or profiles/, run `pnpm bundles`: the web app, Storybook and tests read the committed bundles.
- Typing is left to the device keyboard or IME; on-screen keyboards are deferred (ADR 0034). Keep the field IME-safe.
- Quote YAML values like "on"/"off"/"yes": PyYAML (YAML 1.1) reads them as booleans; the JS parser does not.
- Keyboard shortcuts live in the player's capturing window listener; views register digit/Backspace handlers.

## Phase 4 notes (see docs/adr/0036–0039)
- Learner state is a projection: @nabu/core/learner `replay(events)`. Never store derived state; change the fold.
- The planner is pure: (request, state, bundle, now, seed) → plan. Re-tune CALIBRATION_WEIGHT only against
  test/simulation.test.ts (every course within ±5pp of 85%); golden files: UPDATE_GOLDEN=1 after a deliberate change.
- Card keys: "kc|facet", and "kc|facet|orthography" for read-script/write-script (§6.3).
- The web app stamps events (apps/web/src/clock.ts, session.ts) and keeps them in IndexedDB (store.ts).
- e2e sessions depend on the log and clock: fix the clock (page.clock.setFixedTime), seed history through
  window.nabu, and plan with the solver's `planned()`.
- The API (apps/api) runs on PGlite unless DATABASE_URL is set; migrations are SQL in src/db/migrations.ts
  (append, never edit). Events are validated against schemas/learner-event.schema.json with Ajv.
- Sync is optional: the web app talks to a server only with VITE_NABU_API (dev: .env.development) or ?api=.
  Every recorded event enters the IndexedDB outbox; sign-up uploads it. Never derive state on the server
  differently from core's replay.
- Calibration: `pnpm --filter @nabu/core simulate --out f.jsonl`, then `cd pipeline && uv run nabu calibration f.jsonl`
  or `uv run python notebooks/calibration.py f.jsonl`.

## Phase 5 notes (see docs/adr/0040–0042)
- Audio is committed source: courses/<id>/audio/{index.yaml,clips/}. `cd pipeline && uv run nabu audio generate
  ../courses/<id> [--check]` writes it (needs espeak-ng and ffmpeg; --check needs `uv sync --group speech`). The compiler only
  reads it; after changing a reading, regenerate (the compiler warns `audio.stale`), then `pnpm bundles`.
- Synthesize from pinned readings (Jyutping), never raw characters. apc is human-required: `nabu audio ingest`.
- Clips that fail the round-trip check stay out of bundles until reviewed (`nabu audio report`).
- Speech tests need NABU_SPEECH=1 and the speech group; CI runs only the espeak-ng tests.
- Listening templates exist only where a clip does; "Can't listen now" uses the planner's exclude (LISTENING).
- Hosted voices (ADR 0042): provider elevenlabs/cartesia with `model` and `language`. Keys only from the environment
  (ELEVENLABS_API_KEY, CARTESIA_API_KEY): never in course files, commits or chat. `pronounce: jyutping` sends IPA for
  tokens whose characters do not settle the pinned reading. `--voice <id>` picks a cast voice. Live tests: NABU_HOSTED=1.

## Phase 6 notes (see docs/adr/0043)
- Stories: `stories:` in a unit (schemas/course-source), each on a node of kind story. Lines compile like sentence
  forms and need every course orthography; questions are `choose` steps or lines with `ask: complete|arrange`.
- One glossary matcher: @nabu/core `glossTokens` (exact and folded passes, longer wins). The app's tap-for-gloss and
  stage 7's lints both use it (core-cli `gloss`); never re-implement matching in Python.
- The story reader nests the lesson player per question (@nabu/core/story); story sessions are mode "story".
- `pathNodes` (lessons and stories) drives the path; placement and the planner use lessons only.
- Tappable words: `<T onTokenPress>`; never wrap tokens by hand.

## Working in this repo
- Pushing straight to main is always fine here. CI (.github/workflows/ci.yml) must stay green.
- GitHub Pages (pages.yml) publishes Storybook and the web demo on every push to main.
- ADRs 0013–0043 are Proposed, awaiting acceptance. docs/gameplan-errata.md lists where the gameplan was wrong.
- Fresh cloud container setup:
  - `pnpm i`
  - `sudo apt-get install -y libicu-dev pkg-config` (skip `sudo` when root)
  - `sudo apt-get install -y espeak-ng ffmpeg` (audio)
  - `cd pipeline && uv sync --all-groups` (the speech group pulls CPU PyTorch; add `--no-group speech` to skip it)
- For `pnpm test:visual:docker` in a container, start the Docker daemon first:
  `(dockerd > /tmp/dockerd.log 2>&1 &)`
- Agents: shell heredocs can turn a typed `\uXXXX` into the literal character. Build escapes in code (chr(92)),
  then grep for literal invisibles before committing.
