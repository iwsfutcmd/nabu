# Gameplan errata (found during Phase 0)

Corrections to [gameplan.md](gameplan.md) that Phase 0 turned up. Where a fix changed a decision, the
ADR is linked. The gameplan text itself is left as written.

1. **§6.3 uz-Latn: the apostrophe map only covers lowercase o/g.** `O'zbekiston` falls through to the
   second map and becomes `O` + U+02BC (tutuq belgisi) instead of U+02BB. Fixed in
   `profiles/uz-Latn.standard.yaml` ([ADR 0016](adr/0016-orthography-profile-v0.md)).
2. **§6.3 uz-Latn `letters`: U+02BC (ʼ) is missing, and `ng` is listed although CLDR 49's `uz`
   exemplars don't list it.** ʼ added; `ng` left for Ben to decide. CLDR spells oʻ/gʻ with U+02BB, as the
   profile does.
3. **§6.3 fa-Arab comment "U+FE70–U+FEFF".** U+FEFF is ZWNBSP/BOM, not an Arabic presentation form.
   Presentation Forms-B end at U+FEFC, and U+FDD0–U+FDEF in the other range are noncharacters.
4. **§6.2: `Intl.Locale#maximize()` as the first step** conflicts with the §17 risk about engine
   data drift. CLDR likely subtags generated at build time are the source of truth; the engine only
   cross-checks ([ADR 0017](adr/0017-cldr-data.md)). Node 22 has only the older `textInfo` getter, not
   `getTextInfo()`.
5. **§11.2 "…then CLDR likely subtags"** reads as a third source of preferences. Likely subtags are a
   matching aid inside negotiation (zh-TW → zh-Hant), not a source ([ADR 0018](adr/0018-ui-locales-and-pseudo-locales.md)).
6. **§6.8 "font stacks … as `:lang()` rules generated from the script metadata."** `:lang()` matches
   language ranges, not scripts, and `:lang("*-Arab")` is not reliable. `<T>` sets the stack from the
   profile or script instead ([ADR 0019](adr/0019-self-hosted-fonts.md)).
7. **§11.9 "`stylelint-use-logical` (strict)" is not enough on its own.** It misses per-side borders,
   `overflow-x/y`, `scroll-*` sides, three- and four-value shorthands and `rotate`, and it exempts
   `:dir()` selectors ([ADR 0021](adr/0021-lint-tooling.md)).
8. **§7.3: a token's `sense: sfp-aa3` refers to a construction KC** (`construction:sfp-aa3` in
   `introduces`), but `Token.sense` is a `SenseId`. Either tokens get a general KC link, or the sense id
   space includes constructions. *Phase 2:* source tokens link any KC through `form` or `morphs[].kc`;
   `sense` stays a lexeme, and particles are lexemes (`sense:呀`) ([ADR 0027](adr/0027-course-source-format.md)).
9. **`apc` in CLDR 49:** there is no locale data, so `cldr:apc` exemplars don't exist for the §7.5
   script audit, and likely subtags give `apc → apc-Arab-SY`. Lebanese content should be tagged
   `apc-Arab-LB` / `apc-Latn-LB` ([ADR 0016](adr/0016-orthography-profile-v0.md)).
10. **§5.1 has no home for lint tooling.** Added `packages/lint` ([ADR 0021](adr/0021-lint-tooling.md)).
11. **§5.2 / tooling:** the current TypeScript (7.0) cannot run the type-aware rules §11.9 requires, so
    TS is pinned to 6.0 ([ADR 0013](adr/0013-typescript-6.md)).

## Phase 1

12. **§6.3 uz-Latn has no `whitespace: collapse` step** (fa-Arab does). Added; without it, a dropped
    optional word leaves double spaces in normalized accept-set text.
13. **§6.3 profiles name tables implicitly** (`variants: { table: hk-tw-variants }`,
    `homophones: { model: jyutping-ime }`, `scriptMismatch: { detect: Hans }`). Homophones and script
    detection now name their data tables too ([ADR 0024](adr/0024-profile-data.md)).
14. **§6.3 "Courses for Arabic itself … give a note for each" fold** cannot be written with
    normalization steps, which fold silently. Profiles gained `match.equivalences` with per-fold
    policies ([ADR 0024](adr/0024-profile-data.md)).
15. **§6.7 "touch keyboards are compiled from CLDR Keyboard 3.0"**: not done yet. The typo model runs
    on interim hand-encoded layouts ([ADR 0025](adr/0025-interim-keyboards.md)).
16. **Unihan `kCantonese` is not a full Cantonese reading list** (行 is only hang4). The IME-homophone
    model also uses kSMSZD2003Readings, and still lacks colloquial readings ([ADR 0024](adr/0024-profile-data.md)).

## Phase 2

17. **§7.5 script audit vs CLDR 49 `yue_Hant`:** the exemplars are essentially `zh_Hant` and lack
    everyday Cantonese characters (佢 哋 嘅 咗 嘢 冇 咩 啲 嚟 喺 …), so the audit as written rejects
    colloquial Cantonese. Profiles gained `exemplarsExtra` ([ADR 0032](adr/0032-exemplar-gaps.md)).
18. **§7.6 RBNF drills for `uz` and `tg`:** ICU 74 has no spellout rules for either and silently falls
    back to English (`uz`) or digits (`uz-Cyrl`). The compiler detects the fallback and reports
    `drills.rbnf-unavailable` ([ADR 0030](adr/0030-analyzers-and-icu.md)).
19. **§6.3 uz-Latn `transliterate: … via: cldr-transform` "powers script-convert exercises":** ICU's
    `uz_Latn-uz_Cyrl` writes *Men* as Мэн (not Мен) and *Yoʻq* as Ёʻқ (not Йўқ). It can check pinned
    Cyrillic (`enrich.transliteration-mismatch`, info) but cannot generate it; every Cyrillic form is
    pinned ([ADR 0027](adr/0027-course-source-format.md)).
20. **Phase 1's `hans-only` table (OpenCC STCharacters)** treated OpenCC's orthodox Traditional as the
    only Traditional, flagging HK standard characters (群 床 峰, and 晒 saai3) as Simplified. It now
    subtracts HK/TW variants and CLDR `yue_Hant` exemplars ([ADR 0032](adr/0032-exemplar-gaps.md)).
21. **§7.5 "record the Unicode version":** there are two. CLDR 49 is Unicode 16.0, but Python's
    `unicodedata` (used for NFC checks in the compiler) is 15.0 on Python 3.12 and 15.1 on 3.13. The
    manifest records both, so the pipeline pins Python 3.13 (`pipeline/.python-version`) to keep
    bundles reproducible across machines ([ADR 0029](adr/0029-bundle-format.md)).
22. **§7.5 "readings pinned in the source always win; the compiler warns":** PyCantonese reads the
    sentence-final particles 呀 and 嗎 as aa4 and maa5. The yue fixture pins aa3 and maa3 and carries
    six expected warnings; there is no way yet to mark a disagreement as reviewed.
23. **§16 Phase 2 "about 20 sentences and 30 knowledge components" vs i+1 with *k* = 1:** if every
    KC counted, 30 KCs would need at least 30 sentences. Only sense, form and construction KCs count;
    grapheme KCs are taught by script nodes ([ADR 0033](adr/0033-fixture-courses.md)).

## Phase 3

24. **§16 Phase 3 "CLDR touch keyboards for fa, uz-Latn, uz-Cyrl and apc-Arab":** CLDR's Keyboard 3.0
    set (release 48) has layouts such as Maltese and Bengali but none for fa, ar or uz, so there is
    nothing to compile. Phones' own keyboards and IMEs cover these scripts well; on-screen keyboards
    are deferred and the player leaves typing to the device ([ADR 0034](adr/0034-lesson-player.md)).
25. **§11.5 `PlayerState` holds only the current exercise.** A lesson also needs a session (the
    queue with retries, the results for the summary); every state carries one
    ([ADR 0034](adr/0034-lesson-player.md)).
26. **§6.6 "store fully vocalized text":** the fixture courses are not written fully vocalized. fa writes
    the ezafe kasra and apc the shadda. The *bundle* is vocalized instead: a course's vocalization
    files give each word its marks at compile time, and the source stays as written
    ([ADR 0053](adr/0053-vocalization.md)). The harakat toggle strips the marks, for display only.
27. **§8.2 `select-image` "images need licenses"** also needs a place in the course format:
    `kcs[].image` with file, SPDX licence and provenance ([ADR 0035](adr/0035-bundles-in-the-client.md)).

## Phase 4

28. **§9.3 "the planner only starts using predictions after a calibration curve looks sane":** with
    no learners yet there is no curve. The planner uses p̂ from the start, and a 30-day simulation
    with a hidden truth stands in as the sanity check. Predictions are still logged in shadow mode
    for the Phase 4b notebook ([ADR 0036](adr/0036-learner-model-and-planner.md)).
29. **§9.3 "item and component difficulties are global, server-authoritative":** they need a
    server. Until Phase 4b, each learner's projection learns its own difficulties from per-template
    priors ([ADR 0036](adr/0036-learner-model-and-planner.md)).
30. **§9.4 i+1 at runtime, "every non-target KC is known (R ≥ 0.8)":** with one unit of content,
    most review sentences would have some KC below 0.8 and reviews would starve. The planner
    requires non-target KCs to have been *seen*, and lets the score pull toward due facets.
31. **§9.2 ts-fsrs:** ts-fsrs 6 requires Node 24. The repo is on Node 22, so core pins ts-fsrs 5.4,
    which already implements FSRS-6 (21 parameters).
32. **§4 / §14.1 "Better Auth, behind our own adapter":** v0 ships only the adapter's own
    implementation: email and password, scrypt, opaque bearer tokens. The `Accounts` interface is
    where Better Auth plugs in once OAuth, verification or passkeys are needed
    ([ADR 0038](adr/0038-server-sync-and-accounts.md)).
33. **§14.3 projection tables** (`facet_state`, `user_ability`, …) are not created yet: the server
    replays a user's log on request with the same core as the device. §14.1's `GET /v1/state`
    returns that projection whole, not as deltas since a cursor
    ([ADR 0038](adr/0038-server-sync-and-accounts.md)).
34. **§9.5 placement "computerized adaptive testing over calibrated items":** there are no
    calibrated items yet. Placement v0 probes every lesson node once and places through the longest
    run answered right ([ADR 0039](adr/0039-placement-and-calibration.md)).

## Phase 5

35. **§10.1 "Local options include Piper, Kokoro and MMS-TTS":** for the fixture languages these are
    not free to ship. MMS-TTS is CC BY-NC 4.0. All four Persian Piper voices descend from the
    English "lessac" voice, whose Blizzard license restricts use. Kokoro has no fa, yue, uz or apc.
    The license-clean local engine is eSpeak NG. Its audio is robotic, and the round-trip check
    holds most of its clips back ([ADR 0040](adr/0040-audio-pipeline.md)).
36. **§16 Phase 5 "the polyphone fixture is synthesized correctly and passes round-trip
    verification":** 銀行 and 行路 are synthesized from their pinned readings, and eSpeak's own
    phoneme trace confirms hong4 and haang4. Whisper cannot recognize eSpeak's Cantonese at all, so
    the round trip fails, and the gate rightly kept those clips out. The voice is now VoxCPM2 cloning
    two designed anchors ([ADR 0094](adr/0094-yue-voxcpm2.md)). It reads characters, not the pinned
    readings: the carrier for word cards and the round trip and audio check stand in for that.
37. **§10.3 "an MMS-based aligner that takes romanized input, or the Montreal Forced Aligner":**
    alignment uses one phoneme CTC model (wav2vec2-xlsr-53-espeak-cv-ft). Its outputs are eSpeak
    IPA, which needs no romanizer. Word starts are refined from the audio's energy, because CTC
    fires late.
38. **§10.2 Lingua Libre, Tatoeba and Common Voice ingestion:** the ingestion path exists
    (`nabu audio ingest`, with licenses and provenance). No recordings are committed yet: the
    Commons API rate-limited this environment, so recordings are pulled by hand for now.
39. **§16 Phase 4 "server projections identical to the local ones":** they are byte-identical when
    the same JavaScript engine computes them (Node on the server, and Node in the tests).
    `Math.exp` and `Math.pow` are not specified to be correctly rounded, so a browser's replay can
    differ from the server's in the last bit. The listening priors first exposed this. The device
    therefore checks agreement within a relative 1e-9 and reports the first value outside it. The
    server is authoritative ([ADR 0038](adr/0038-server-sync-and-accounts.md)).

## Phase 6

40. **§8.2 "`story` … comprehension":** §9.1 has no comprehension facet. Story questions credit the
    `recognize` facet of their line's KCs ([ADR 0043](adr/0043-stories.md)). A comprehension
    question with no KCs of its own (`story-choose`) updates the performance model only.
41. **§7.5 stage 7 "validate glossaries with the runtime matcher":** until Phase 6 the compiler ran
    its own longest match in Python over core-cli's folded units. That covered the folded pass
    only, and the app had no glossary matcher at all. Both now run `@nabu/core`'s `glossTokens`,
    with exact and folded passes ([ADR 0043](adr/0043-stories.md)).

## Phase 7

42. **§12.2 "Tests cover crossing the date line":** the gameplan does not say what crossing it
    should do to a streak. Flying west from UTC−11 to UTC+14 skips a whole local date, so a
    learner who practises every day they live through would still break their streak. Dates
    skipped that way now bridge the streak ([ADR 0044](adr/0044-gamification-and-notifications.md)).
43. **§12.7 "uniqueness is decided on NFKC_Casefold":** that key alone lets сору (Cyrillic) and
    copy (Latin) coexist. Usernames are unique on the UTS #39 skeleton as well. Input is NFKC'd
    before the Identifier_Status check, so fullwidth input from an IME is accepted as the plain
    letters ([ADR 0044](adr/0044-gamification-and-notifications.md)).
44. **§12.4 plausibility checks:** minimum response times alone would still credit a session's
    completion XP when every answer in it was implausible. A session earns league XP only if at
    least one of its answers was plausible ([ADR 0044](adr/0044-gamification-and-notifications.md)).
45. **§12.6 Web Push:** the usual Node library is MPL-2.0. RFC 8291 and RFC 8292 are implemented
    on `node:crypto` instead, and tested against the RFC's own example
    ([ADR 0044](adr/0044-gamification-and-notifications.md)).


## Phase 8

46. **§8.3 the cascade before the judge:** the typo model accepts some meaning changes as typos,
    so they never reach the judge or a reviewer. Examples are the person and possessive suffixes
    one letter apart in Uzbek (*talabasan* for *talabaman*, *kitobing* for *kitobim*), Сен for
    Мен (adjacent keys on the Cyrillic layout), and ⁨وأنا⁩ for ⁨وإنت⁩ in Lebanese. The judge's
    harness found them (`evals/README.md`). Resolved by
    [ADR 0066](adr/0066-meaningful-endings.md): a profile lists the endings and pronouns that carry
    meaning (`typo.contrasts`, REVIEW), and a slip that trades one for another is WRONG_WORD.
47. **§8.3 "online, the judge gets up to about 2 seconds while a checking state shows":** the
    player grades at once and moves on. A second check runs in the background, and its accept
    revises the answer retroactively. It is the same mechanism as offline, without holding the
    learner. The lesson's own retry of that exercise still happens
    ([ADR 0045](adr/0045-ai-services.md)).
48. **§13.2 judge input "its alignment diff":** the prompt carries the accept set's canonical answer
    and heaviest alternatives, and the answer. The diff adds nothing a model can use that the two
    texts do not show ([ADR 0045](adr/0045-ai-services.md)).
49. **§14.1 `POST /v1/judge`, `POST /v1/reports`:** these are `/v1/ai/judge` and the
    `answer_reported` event, which syncs like every other event, so reporting works offline and
    before sign-up ([ADR 0045](adr/0045-ai-services.md)).
50. **§13.4 "Learner turns are graded gently":** not in Phase 8. Model turns are checked; learner
    turns are not graded yet.

## Phase 9

51. **§10.4 tier 3 "F0 extracted with pYIN, Parselmouth or CREPE … speaker-normalized from a
    short calibration":** pitch is tracked with YIN in TypeScript on the device, so tone feedback
    needs no server and no upload. The calibration is the learner's own recordings, a running
    mean and spread kept as three numbers on the device, not a separate step a beginner could not
    yet say right. Until enough has been heard, only a contour's shape is judged
    ([ADR 0046](adr/0046-speech.md)).
52. **§10.4 tier 2 "wav2vec2-lv-60-espeak-cv-ft … goodness-of-pronunciation confidence":** the
    service uses the XLSR-53 eSpeak model Phase 5 already ships, and reports a phone error rate
    and the words with wrong phones; a GOP-style confidence is not computed yet.
53. **§16 Phase 9 acceptance "a recorded fixture set of native and deliberately wrong tones":** no
    recordings exist. The harness and its report are done, and run on a synthetic eSpeak NG set
    marked as such; the acceptance waits for native speakers (`evals/tones/README.md`).
54. **§8.1 `tone-identify` for yue:** it needs one-syllable clips, and eSpeak NG's were held back by
    the round-trip check (Whisper did not understand its Cantonese). The exercise appears with
    VoxCPM2's word cards ([ADR 0094](adr/0094-yue-voxcpm2.md)) where they pass the check.
55. **§10.4 tier 1 everywhere:** Whisper writes Uzbek in Latin and Lebanese in Arabic script, so
    `uz-Cyrl` and `apc-Latn` get no tier 1, and `apc` no tier 2 (no trustworthy expected
    phones from unvocalized text). Their speaking is self-rated unless tones apply
    ([ADR 0046](adr/0046-speech.md)).

## Phase 10

56. **§16 Phase 10 "per-unit bundle downloads (OPFS or IndexedDB)":** course files live in the
    Cache API under their own URLs, so the service worker answers the app's ordinary fetches and
    the loader, audio and pictures need no change. A unit's download is its media; the course's
    text (every non-media file) is stored for any course the device has opened
    ([ADR 0047](adr/0047-offline.md)).
57. **§2 table "vite-plugin-pwa":** the service worker is our own TypeScript, built by a small
    Vite plugin, because it shares the outbox upload with the app and needs range requests and
    content-addressed caching that Workbox would have to be configured into.
58. **§12.2 grace window on the device:** the gameplan has the server apply the 72-hour grace
    window. A device that did not know when the server received its events counted late
    sessions the server did not, so their game states differed. The upload and pull responses
    now carry receipt times, and the device replays with them.
59. **Background Sync is Chromium-only** (and absent from its headless shell): elsewhere the app
    syncs on reconnecting, on being shown again and every minute while events are pending.
60. **§16 Phase 10 "a Capacitor wrapper":** the native apps ship every course inside rather
    than downloading them, which the committed catalog's size allows; native per-unit downloads
    would need a filesystem-backed loader, since iOS web views run no service worker for
    app-bundled pages ([ADR 0048](adr/0048-native-apps.md)).
61. **§12.6 "Capacitor later":** reminders on the phone are sent by the API through FCM (HTTP v1)
    and APNs (token authentication over HTTP/2) with credentials from the environment; the
    decision of whether and what to send is the Web Push one, unchanged.
62. **§8.2 `vocalize` "form":** the card asks how the script reads a word, so it exercises the
    `read-script` facet, like `char-read`. A Han counterpart, `transcribe` (type the word's
    Jyutping), joins it ([ADR 0054](adr/0054-pronunciation-exercises.md)).
63. **§9.2 "latency ≤ the learner's median for this template":** slower than one's own median
    made about half of all right answers Hard, whatever the learner, and long sentences nearly
    always "slow". Pace is now judged per unit of length (the item's KCs plus a fixed part) and
    only well past the usual (twice) is slow ([ADR 0096](adr/0096-pace-in-ratings.md)).
64. **§9.2 "Easy is never assigned automatically":** a right answer typed from memory in at most
    half the usual time, on a card already recalled with at least 0.9 probability, is Easy
    ([ADR 0096](adr/0096-pace-in-ratings.md)). Learners still never rate themselves, except
    speaking at tier 0.

65. **§8.2 `gap-fill` "form·produce":** picking the missing word among options is recognition,
    like tiles: production is supplying the form, typed (or, once scored speech exists, said from
    the meaning). A word is known once it has shown each skill on a later day than it was met
    ([ADR 0100](adr/0100-known-words.md)); sessions aim at the skills words lack
    ([ADR 0101](adr/0101-skill-targets.md)).
66. **§12.6 "the median of their recent session start times":** at the median, on about half the
    days the learner practises anyway the reminder came just before practice that was going to
    happen, and took the credit, so the back-off never started. Reminders now come half an hour
    after the 80th percentile of the start times, and only practice begun after a reminder answers
    it ([ADR 0103](adr/0103-reminder-timing.md)).
67. **§5.1 `services/speech/`:** the speech service is part of the pipeline (`nabu speech serve`,
    `pipeline/src/nabu/speech/service.py`), sharing its uv project and the models Phase 5 already
    uses; there is no `services/` directory ([ADR 0046](adr/0046-speech.md)).
68. **§11.4 "ruby … hidden by default there" (vertical text):** hiding readings whenever text turned
    vertical took away what a learner had chosen to see. The reading layer the learner chose now
    shows in vertical text too, and only the target text turns; the chrome stays horizontal
    ([ADR 0118](adr/0118-the-player-on-a-phone.md)).
69. **§11.5 "submit is ignored while composing":** on Android, keyboards compose Latin words until they
    are committed, so an ignored press made every typed answer take two taps. A Check pressed while
    composing is now held until `compositionend` and goes ahead with the settled text; nothing is ever
    submitted mid-composition ([ADR 0118](adr/0118-the-player-on-a-phone.md)). Roleplay's Send, the correction
    form's Send and Start over's confirmation take a press the same way (D39).
