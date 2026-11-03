# 0047. Offline courses and background sync

- Status: Proposed
- Date: 2026-11-03

## Context

Phase 10 (gameplan §16) asks for:
- per-unit bundle downloads (OPFS or IndexedDB), so whole courses work offline;
- background sync;
- a Capacitor wrapper (ADR 0048).

Acceptance:
- three sessions in airplane mode, synced a day later, produce correct streak dates;
- client and server projections match exactly.

The local event log, client-side planning and the outbox exist from Phase 4. What was missing
was the app itself and its courses with no network, an upload that does not need the app open,
and a server game projection to compare against.

## Decision

**The compiler names each unit's media** (stage 9, `schemas/bundle.schema.json`).
- Every manifest file now carries `bytes`.
- Every unit lists `assets`: the audio clips and pictures its items use, found from the ids and
  paths in the unit's own JSON.
- A medium shared by units is listed in each; every medium belongs to some unit (tested).

**Two kinds of offline content** (`@nabu/core/offline`, pure).
- **The core: every non-media file.** That is units, profiles, tables, keyboards and the audio
  index. Opening a course reads all of it, so a device that has opened a course can teach its
  text offline.
- **Units carry the media**, downloaded and removed per unit with their sizes shown first.
- **`restrictMedia(course, has)`** removes the clips and pictures a device lacks. The builder
  then never makes an exercise that needs them (listening exists only where a clip does), so an
  offline lesson in a unit without its media is a lesson without listening, not a broken one.
- With every medium present it returns the same course, so plans and golden files are unchanged.

**The Cache API, not OPFS or IndexedDB**, holds course files, under their own URLs.
- The service worker can answer the app's ordinary fetches from it, so the loader, the audio
  element and pictures are unchanged.
- Course files are content-addressed, so a stored copy is valid for as long as its manifest
  lists it.
- **A download fetches each missing file and checks its sha256 against the manifest**, then
  stores it. The manifest goes in last, so a stored manifest only names files that are there.
  Files of older versions are deleted afterwards.
- **Fonts.** Each script's font comes in unicode-range pieces, so a download also loads every
  font for the course's own text (`document.fonts.load`). It then renders offline as online.

**The service worker** is TypeScript (`apps/web/sw/sw.ts`), built by a Vite plugin
(`vite-sw.ts`) with this build's shell list.
- **Shell.** The HTML, script and styles are cached at install. Navigations fall back to them,
  and fonts are kept as they are fetched.
- **Course files.** Content-addressed files are served cache-first. Manifests and the course
  index are served network-first, with the stored copy offline.
- **Ranges.** Audio range requests get 206 slices of stored clips.
- **Push.** Web Push (Phase 7) moved into it unchanged.
- **Dev server.** It builds the worker on request and leaves fetches alone.

**Background sync.**
- **When the worker uploads.** The app asks for a Background Sync (tag `nabu-outbox`) when an
  upload cannot reach the server, or when it records an event offline. The browser wakes the
  worker when the network is back, even with no page open.
- **How.** The worker reads the outbox and the saved account from IndexedDB and uploads with
  the same code as the app (`outbox.ts`, `idb.ts`, `http.ts`), then tells open windows.
- **Elsewhere.** Where Background Sync is missing (Firefox, Safari, Chromium's headless shell),
  the app syncs when it comes back online, when it is shown again, and every minute while events
  are pending.

**The server projects the game state as well** (`GET /v1/game`).
- **Its view.** It is the whole log with each event's receipt time, by the device's clock when
  the device passes one.
- **Receipt times on the device.** The upload and pull responses carry when the server first
  received each event (`received`, by id). The device keeps them (IndexedDB version 3) and
  replays the game with them.
- **Why.** A sync after the 72-hour grace window then counts for XP but not the streak on both
  sides alike (§12.2).
- **The check.** After a sync the device compares the server's learner state and game state with
  its own, for every course the server returned. A difference is reported (`data-verified`), and
  the server stays authoritative.

## Consequences

- The acceptance runs in `apps/web/tests/e2e/offline.spec.ts`, against the production build and
  the API:
  - Three sessions in airplane mode on two local dates in Asia/Kathmandu (UTC+05:45), around local
    midnight so that UTC dates would differ.
  - The app is reloaded from the worker before each session.
  - The worker's Background Sync uploads them with no page open.
  - The server's streak dates are the local dates, and the server's learner and game
    projections equal the device's exactly.
  - The test uses full Chromium, since the headless shell has no Background Sync.
- An instance needs `NABU_GAME` set to the `game.json` its web app is deployed with, or the
  game check reports a difference.
- A device that never opened a course online has nothing of it offline. The notice says so.
- Not yet:
  - storage estimates;
  - downloading a unit automatically before the learner reaches it;
  - Periodic Background Sync for pulling.
