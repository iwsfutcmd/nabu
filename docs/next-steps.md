# Next steps after Phase 10

- Date: 2026-11-04
- Status: proposed plan, for Ben to accept, reorder or cut

Phases 0–10 of the gameplan (§16) are built, and CI is green. This plan takes Nabu from
"complete on four small fixture courses" to "something people can run, use and help build". It
follows two things the gameplan already says:
- content quality is the real bottleneck (§17);
- everything is multilingual from the ground up (§2).

## Where things stand

- **Courses.** There are four fixture courses (fa, yue, uz, apc). Each has ten units (A1 to early
  A2): 293–348 sentences, 55–60 lessons, 10 stories and 6 roleplay scenarios
  ([ADR 0050](adr/0050-ten-unit-courses.md)). Every item is an LLM draft that no native speaker has
  reviewed; `courses/REVIEW.md` lists what to check first. Synthesized audio covers every unit of
  fa and uz, but the round-trip check holds back most uz clips. yue has clips for its first unit
  only, nearly all held back, and apc waits for human recordings.
- **Interface.** The interface is in English only, plus the en-XA and ar-XB pseudo-locales.
  Course content handles RTL, vertical text and mixed scripts. The chrome around it has never
  been translated.
- **Running it.** The demo on GitHub Pages is local-only. `deploy/compose.yaml` runs a full
  instance (Caddy over HTTPS, the API, Postgres; optional Ollama and speech): see
  `deploy/README.md`. CI starts it on every push and checks it end to end (`deploy/smoke.sh`).
- **Grading bug (erratum 46): fixed.** The typo model accepted some meaning changes as typos:
  Uzbek person and possessive suffixes one letter apart (*talabasan* for *talabaman*), Сен for Мен,
  a Lebanese pronoun. Profiles now list the endings and pronouns that carry meaning
  ([ADR 0066](adr/0066-meaningful-endings.md); the sets await sign-off), and these grade
  WRONG_WORD.

## What needs you, or people you know

These cannot be done in code. Each one gates something below.

| What | Why | Unblocks |
|---|---|---|
| Native review of the four fixture courses (start with `courses/REVIEW.md`; mark mistakes in the app's sentence list, ADR 0051) | All content is an LLM draft (`status: draft`) | Phase 13; any public release |
| Sign-off on the REVIEW markers: those in orthography profiles (with the meaningful endings of uz and apc, ADR 0066), the speech tiers per orthography, the Cantonese tone templates | Linguistic policy is yours to set (CLAUDE.md) | Grading and speech defaults |
| Recordings of native Cantonese speakers saying each tone, right and deliberately wrong (`evals/tones/README.md`) | The Phase 9 acceptance; tone templates are tuned only on native speech | Tone scoring you can trust |
| Listening to apc's synthetic voice, and human audio where it falls short (`nabu audio report`, `nabu audio ingest`) | Lahgtna is synthetic and its clips are non-commercial (ADR 0058) | apc audio you can trust; commercial use |
| A model for the judge: Ollama on the server, or an endpoint and key in its environment, then `pnpm --filter @nabu/api evals -- --run` | No gate can open without real evaluations | The second check on answers |
| Push credentials (Firebase, an APNs key), test phones and a Mac with Xcode | Reminders on phones have never been delivered; iOS has never been built | Native reminders; the iOS app |
| A decision on hosted TTS (on hold) | Better voices for fa, uz and apc | Phase 13 audio |
| Accepting or amending ADRs 0013–0048 | They are all Proposed | Nothing directly; it settles what later work builds on |

## Phases

### Phase 11: Correct grading, and an instance anyone can run (§8.4, §14.4–14.5)

- **Deliverables:**
  - **Erratum 46** (done: [ADR 0066](adr/0066-meaningful-endings.md)). The typo model learns each
    profile's inflectional minimal pairs, with conformance vectors in both harnesses:
    - an edit that turns one known form into another known form of the same word is WRONG_WORD,
      not a typo (`typo.contrasts`);
    - neighbouring-key slips that make another real word are checked against the lexicon first
      (which now holds every word the course writes).
  - **Self-hosting** (`deploy/compose.yaml`; done, see `deploy/README.md`):
    - Caddy serving the web build over HTTPS (the microphone and the service worker need it);
    - the API and Postgres;
    - optional profiles for the speech service and Ollama;
    - one `.env` file;
    - images built in CI.
  - **Running a server** (done: `deploy/README.md`): migrations run on start, and backups (`pg_dump`) and upgrades are
    documented. The API checks `NABU_GAME` at startup.
  - **Privacy** (§14.4):
    - export of a learner's server data (events and projections) (done: [ADR 0067](adr/0067-account-data-and-limits.md));
    - deleting an account, which recomputes shared aggregates (done: ADR 0067);
    - an optional age gate for instances that may serve minors.
  - **Abuse limits:** rate limits on sign-up, sign-in and uploads (done: ADR 0067).
  - **CI:**
    - the API tests also run against real Postgres (done: the `api-postgres` job, one fresh database per test file);
    - a license check that fails on copyleft code in what ships (§17) (done: `pnpm license-check` over the production
      dependencies of the web app, the API and the mobile shell; the optional speech image's Python packages are not
      covered yet);
    - Renovate for dependency updates.
- **Acceptance:**
  - The Uzbek, Uzbek Cyrillic and Lebanese examples from erratum 46 grade WRONG_WORD in both
    harnesses, and every existing conformance vector still passes.
  - In CI, `docker compose up` on a clean runner serves the app. An e2e test then signs up,
    finishes a lesson, syncs, exports the account and deletes it.

### Phase 12: The interface in the learners' own languages (§11.2, §11.8, §15)

- **Deliverables:**
  - **First locales.** UI catalogs for the fixture courses' own communities: Persian, Arabic,
    Traditional Chinese (Hong Kong), and Uzbek in Latin and Cyrillic script.
  - **Same gate as course content.** Catalogs are drafted with `llm:` provenance and ship only
    after a native reviewer signs them off. The per-message descriptions written so far are the
    translators' notes.
  - **A catalog check in CI.** For every message:
    - it parses as MF2;
    - its placeholders match English;
    - its selectors cover the locale's CLDR plural categories;
    - it has no literal invisible characters.
  - **Formatting the locale expects** (§11.8):
    - native digits;
    - the locale's calendar for dates (Solar Hijri for Persian, Islamic where chosen);
    - CLDR week starts;
    - CLDR person-name order (§12.7).
  - **The native apps' system strings** (the iOS permission text, Android app strings) come from
    the same catalogs.
  - **The visual matrix** gains each shipped locale (§15).
- **Acceptance:**
  - A Persian-speaking learner of Cantonese sees Persian chrome, Persian digits and Solar Hijri
    dates. Cantonese answers still run left to right, and stories still read vertically.
  - The catalog check and the visual matrix are green for every shipped locale.

### Phase 13: Reviewers, and courses that grow (§7, §13.5, §17)

- **Deliverables:**
  - **A review workspace in the app**, for reviewer accounts:
    - items by course and status;
    - the source beside the compiled forms;
    - audio playback and accept-set edits;
    - the report queue (`/admin/v1` has no interface today).
  - **Sign-off.** Signing off moves an item from draft to reviewed, with the reviewer's
    provenance.
  - **Release builds.** A release build of a course leaves out unreviewed items. The demo keeps
    showing drafts, labelled as drafts.
  - **Larger courses.** Each fixture course grows to an A1 path of about 8–10 units, drafted with
    `nabu author draft`, linted, and then reviewed.
  - **One new course to stretch the design.** Either Tajik, with the tg↔fa script conversion left
    out in ADR 0033, or Japanese, for the furigana paths in §6.6.
- **Acceptance:**
  - In the browser, a reviewer signs off a whole unit, which an e2e test covers.
  - A release build contains only reviewed items.
  - Each fixture course has at least eight units with every lint clean. Counting units as done
    depends on reviewers.

### Phase 14: Learning quality and accessibility (§9.2, §11.7, §14.6)

- **Deliverables:**
  - **Per-learner FSRS parameters** (§9.2), fitted on the device or nightly on the server, with the
    learner simulator as the guard.
  - **Experiments** (§14.6): deterministic bucketing, exposure events and a DuckDB notebook, used
    for safety and regression checks.
  - **Observability, opt-in:** structured logs and OpenTelemetry traces, with no third-party
    trackers.
  - **Accessibility** (§11.7):
    - a dyslexia-friendly font option for Latin script;
    - captions for audio (the transcripts exist);
    - a recorded VoiceOver and TalkBack pass over every screen.
  - **Offline extras** (ADR 0047): storage estimates, and downloading the next unit before the
    learner reaches it.
- **Acceptance:**
  - In the simulator, fitted parameters keep success within ±5 points of 85% with less review
    time than the defaults.
  - The screen-reader checklist passes on every screen.

### Phase 15: Deeper speech and input (§6.7, §6.9, §10.4)

- **Deliverables:**
  - **On-screen keyboards** (deferred in ADR 0034), for scripts phones lack keyboards for.
  - **Speech feedback:** pronunciation feedback per sound, and a goodness-of-pronunciation
    confidence (ADR 0046).
  - **Speech offline:** an on-device recognizer (ONNX or WebGPU), so words and sounds are scored
    with no network.
  - **More tone systems** once a Mandarin, Vietnamese or Thai course exists.
  - **Stroke order** for yue only if open Hong Kong-order data turns up (§17). Otherwise skip it.
- **Acceptance:** per-tone accuracy on native recordings meets a threshold you set. This is
  blocked on the recordings.

### Phase 16: Social (§12.7)

- **Deliverables:** follows, friend quests and shared streaks, all built in the game rules engine
  and opt-in per instance.
- **Acceptance:** two accounts follow each other and finish a friend quest, and their game
  projections match on both devices and the server.

## Recommended order

1. **Phase 11 first.**
   - The grading bug misleads learners today.
   - No reviewer or learner can use the app with an account until there is an instance to
     reach.
   - Export and deletion must exist before anyone's data sits on a server.
2. **Phase 12 next.** English-only chrome contradicts the app's first promise. The fixture
   courses' own communities are also the reviewers Phase 13 needs, and they should be able to
   work in their own language.
3. **Phase 13** needs a server (11) and reviewers working in their own language (12).
4. **Phases 14–16** as capacity allows. Phase 15's speech work waits on recordings.

The reviews and recordings in "What needs you" can start now and run alongside all of this.
