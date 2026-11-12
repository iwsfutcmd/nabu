# 0048. Android and iOS apps: a Capacitor shell with the courses inside

- Status: Proposed
- Date: 2026-11-03

## Context

Phase 10 (gameplan §16) asks for a Capacitor wrapper with push notifications on iOS and Android.
The web app is local-first and works offline (ADR 0047). What a store app adds:
- an icon on the phone;
- reminders through the platform's own push service;
- no dependency on the browser keeping a service worker.

## Decision

**`apps/mobile` is a Capacitor 8 shell around the web app's production build.**
- **The courses ship inside.** The web build already contains every committed bundle, so the
  app works offline from its first launch. Downloads and the service worker stay off in the
  native shell (`platform.ts`).
- **The projects are committed.** `android/` and `ios/` are the generated native projects, so
  their settings are reviewed like any code. Build outputs and the copied web assets are
  ignored.
- **Versions.** Capacitor is pinned to 8.5.3 (core, Android, iOS, CLI), with the App 8.1.2 and
  Push Notifications 8.1.3 plugins.
- **Build.** `pnpm --filter @nabu/mobile build` builds the web app and syncs both projects. The
  sync server is the build's `VITE_NABU_API`.

**Reminders on the phone go through FCM (Android) and APNs (iOS), sent by the API**
(`apps/api/src/nativepush.ts`).
- **The app.** It asks for permission, registers with the platform and sends its device token
  (`POST /v1/push/native/register`).
- **Who can be reminded.** `GET /v1/push/native` says which platforms this instance can reach,
  and the switch appears only for those.
- **Sending.**
  - The reminder job decides as for Web Push (one a day, at the learner's habitual hour, in their
    UI locale) and sends to every token.
  - A token the service reports dead is forgotten.
  - FCM uses HTTP v1 with a service account (an RS256 assertion exchanged for an access token).
  - APNs uses token-based authentication (an ES256 provider token renewed within the hour) over
    HTTP/2.
- **Credentials.** They come only from the environment, as paths to the files:
  - `NABU_FCM_SERVICE_ACCOUNT`;
  - `NABU_APNS_KEY` with `NABU_APNS_KEY_ID`, `NABU_APNS_TEAM_ID` and `NABU_APNS_TOPIC`, plus
    `NABU_APNS_SANDBOX=1` for development builds.

  Native reminders need `NABU_PUSH=1`, as Web Push does.
- **Tapping a reminder** opens the app at its `url`.
- **Tests.** They check every request against the services' formats, and verify every signature
  with keys generated in the test. Nothing is sent to Google or Apple from tests.

**Foreground and permissions.**
- **Sync.** The app syncs when it returns to the foreground (`App` resume), in addition to the
  web app's triggers.
- **Microphone.** Speaking exercises use the microphone through the web view: `RECORD_AUDIO` on
  Android, and `NSMicrophoneUsageDescription` on iOS.
- **Layout.** The Android manifest declares RTL support. Layout direction and writing modes come
  from the web content, as in the browser.

**CI builds the Android debug APK** on every push. iOS needs macOS and signing, and is built by
the deployer in Xcode.

**Amendment (2026-11-12): a preview APK anyone can install.**
- CI builds a `preview` build type: a debug build with the id `org.nabu.app.preview`. It is
  signed with a public key committed at `android/app/preview.keystore`, and its version code is
  the CI run number.
- **Why a fixed key:** a debug key is made fresh on each runner, so no build would install over
  the last, and replacing the app loses the progress on the device.
- **Why its own id:** a store release under `org.nabu.app`, signed with a private key, never
  conflicts with a preview.
- **Publishing:** pushes to main replace the APK on one prerelease, `android-preview`. That gives
  one stable download link, and the release is created (and notifies watchers) only once. A
  slower run never replaces a newer run's APK.
- **The cost of a public key:** anyone can sign an APK that installs over a preview and reads its
  data. Previews are installed only from the release page, and the store app is never signed
  with that key.

## Consequences

- To publish, a deployment:
  - changes `appId` in `capacitor.config.ts` (and `NABU_APNS_TOPIC` to match);
  - adds its `google-services.json` to `android/app/`;
  - turns on the Push Notifications capability in Xcode;
  - signs both apps.
- `apps/mobile/README.md` lists the steps.
- Not yet:
  - **The iOS permission text is English only.** Localized `InfoPlist.strings` need adding to
    the Xcode project.
  - **Large catalogs.** A catalog too large to ship inside the app would need per-unit downloads
    in the native shell. iOS web views have no service worker for app-bundled content, so that
    means a loader that reads from the filesystem.
  - **Delivery to devices** has not been tried. It needs real credentials and devices.
