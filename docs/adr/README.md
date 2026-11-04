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
| [0042](0042-hosted-tts-providers.md) | Hosted TTS (ElevenLabs, Cartesia): keys from the environment, IPA for unsettled readings, punctuated input | Proposed |
| [0043](0043-stories.md) | Stories: source and lints, one runtime glossary matcher (exact and folded passes), the reader, vertical reading | Proposed |
| [0044](0044-gamification-and-notifications.md) | Game state as projections (streaks across the date line, freezes, quests, gate), UTS #39 usernames, leagues with an idempotent rollover, Web Push reminders | Proposed |
| [0045](0045-ai-services.md) | The LLM gateway (local first, schema-validated, provenance, cache, budgets, kill switch), the judge behind per-language gates with retroactive revisions, golden sets and the evaluation harness, reports to accept-set pull requests, Explain My Answer, roleplay, drafting | Proposed |
| [0046](0046-speech.md) | Tier 3 tones on the device (YIN, contours, self-calibration), tiers 1–2 on a speech service (unprompted Whisper graded by the course grader; phones against surface readings), feedback not verdicts, per-word credit, recordings never kept, the tone evaluation | Proposed |
| [0047](0047-offline.md) | Per-unit media downloads in the Cache API (sha256-checked, manifest last), the course text always kept, `restrictMedia` so offline lessons skip missing clips, a TypeScript service worker (shell, course files, ranges, push), Background Sync of the outbox, receipt times so device and server game states match | Proposed |
| [0048](0048-native-apps.md) | A Capacitor 8 shell around the web build with every course inside; reminders through FCM (HTTP v1, service account) and APNs (token auth, HTTP/2) from the API with credentials from the environment; resume sync; Android debug build in CI | Proposed |
| [0049](0049-starting-over.md) | Starting a course over is a `progress_reset` event: the fold forgets the course's cards, lessons, placement and mistakes before it; XP and the game state stay; nothing is deleted | Proposed |
| [0050](0050-ten-unit-courses.md) | Ten-unit fixture courses; the planner presents every new KC in its lesson (calibration weight 70); distractors come from the item's unit or earlier; a KC met only inside longer words reads its share of their reading; word forms carry their senses' readings | Proposed |
| [0051](0051-corrections.md) | Any learner can mark a sentence or story line as wrong with a correction (a `sentence_reported` event; sentence list, lessons, stories); a review queue and `nabu corrections apply` write reviewed corrections into the source; story answers can be reported too | Proposed |
| [0052](0052-learner-claims.md) | A learner's claim about their answer ("should have been accepted", "should have been wrong") is their own revision of it: it counts at once in every projection, and joins the review queue | Proposed |
| [0053](0053-vocalization.md) | A course's vocalization (`vocalization:` files: words, ambiguous, uncertain) gives its words their vowel marks at compile time; tokens can pin `vocalized`; grading, credit, glossary, voices and corrections compare letters | Proposed |
| [0054](0054-pronunciation-exercises.md) | Learners write in what the script leaves out: `vocalize` (an abjad word's vowel marks, from the vocalization) and `transcribe` (a Han word's Jyutping), on the read-script facet, graded all or nothing (`gradeVowels`, `gradeReading`); sukun optional per profile | Proposed |

Template: [0000-template.md](0000-template.md).
