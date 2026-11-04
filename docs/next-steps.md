# Next steps after Phase 10

- Date: 2026-11-04
- Status: proposed plan, for Ben to accept, reorder or cut

Phases 0–10 of the gameplan (§16) are built, and CI is green. This plan takes Nabu from
"complete on four small fixture courses" to "something people can run, use and help build". It
follows two things the gameplan already says:
- content quality is the real bottleneck (§17);
- everything is multilingual from the ground up (§2).

## Where things stand

- **Courses.** There are four fixture courses (fa, yue, uz, apc). Each has one unit of 24–39
  sentences and 6–8 lessons. Every item is an LLM draft that no native speaker has reviewed.
- **Interface.** The interface is in English only, plus the en-XA and ar-XB pseudo-locales.
  Course content handles RTL, vertical text and mixed scripts. The chrome around it has never
  been translated.
- **Running it.** The demo on GitHub Pages is local-only. There is no recipe for running a full
  instance with accounts, sync, reminders and speech: `deploy/` is still a placeholder.
- **Grading bug (erratum 46).** The typo model accepts some meaning changes as typos, so they
  never reach the judge:
  - Uzbek person and possessive suffixes one letter apart (*talabasan* for *talabaman*);
  - Сен for Мен, which are neighbouring keys on the Cyrillic layout;
  - a Lebanese pronoun.

  Learners are told these answers are right.

## What needs you, or people you know

These cannot be done in code. Each one gates something below.

| What | Why | Unblocks |
|---|---|---|
| Native review of the four fixture courses | All content is an LLM draft (`status: draft`) | Phase 13; any public release |
| Sign-off on the 10 REVIEW markers: 8 in orthography profiles, the speech tiers per orthography, the Cantonese tone templates | Linguistic policy is yours to set (CLAUDE.md) | Grading and speech defaults |
| Recordings of native Cantonese speakers saying each tone, right and deliberately wrong (`evals/tones/README.md`) | The Phase 9 acceptance; tone templates are tuned only on native speech | Tone scoring you can trust |
| Human audio for apc (`nabu audio ingest`) | Lebanese is marked human-required for audio | Listening in apc |
| A model for the judge: Ollama on the server, or an endpoint and key in its environment, then `pnpm --filter @nabu/api evals -- --run` | No gate can open without real evaluations | The second check on answers |
| Push credentials (Firebase, an APNs key), test phones and a Mac with Xcode | Reminders on phones have never been delivered; iOS has never been built | Native reminders; the iOS app |
| A decision on hosted TTS (on hold) | Better voices for fa, uz and apc | Phase 13 audio |
| Accepting or amending ADRs 0013–0048 | They are all Proposed | Nothing directly; it settles what later work builds on |

## Phases

### Phase 11: Correct grading, and an instance anyone can run (§8.4, §14.4–14.5)

- **Deliverables:**
  - **Erratum 46.** The typo model learns each profile's inflectional minimal pairs, with
    conformance vectors in both harnesses:
    - an edit that turns one known form into another known form of the same word is WRONG_WORD,
      not a typo;
    - neighbouring-key slips that make another real word are checked against the lexicon first.
  - **Self-hosting** (`deploy/compose.yaml`):
    - Caddy serving the web build over HTTPS (the microphone and the service worker need it);
    - the API and Postgres;
    - optional profiles for the speech service and Ollama;
    - one `.env` file;
    - images built in CI.
  - **Running a server:** migrations run on start, and backups (`pg_dump`) and upgrades are
    documented. The API checks `NABU_GAME` at startup.
  - **Privacy** (§14.4):
    - export of a learner's server data (events and projections);
    - deleting an account, which recomputes shared aggregates;
    - an optional age gate for instances that may serve minors.
  - **Abuse limits:** rate limits on sign-up, sign-in and uploads.
  - **CI:**
    - the API tests also run against real Postgres (today they run on PGlite only);
    - a license check that fails on copyleft code in what ships (§17);
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
