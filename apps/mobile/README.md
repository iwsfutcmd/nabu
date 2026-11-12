# Nabu for Android and iOS

The web app's production build in a [Capacitor](https://capacitorjs.com) shell
([ADR 0048](../../docs/adr/0048-native-apps.md)). Every course ships inside the app, so it works
offline from the first launch.

## Build

```sh
pnpm i
VITE_NABU_API=https://api.example.org pnpm --filter @nabu/mobile build   # web build + cap sync
pnpm --filter @nabu/mobile android   # opens Android Studio
pnpm --filter @nabu/mobile ios       # opens Xcode (macOS)
```

- **Requirements.** Android needs JDK 21 and the Android SDK (API 36). iOS needs Xcode, with
  Swift Package Manager (no CocoaPods).
- **No server.** Leave `VITE_NABU_API` unset for a local-only app.
- **CI** builds the preview APK on every push and pull request, and publishes it from main.

## Preview APK

Every push to main builds the app and replaces the APK on the
[android-preview release](https://github.com/iwsfutcmd/nabu/releases/tag/android-preview).
[This link](https://github.com/iwsfutcmd/nabu/releases/download/android-preview/nabu-preview.apk)
always downloads the latest. Each pull request's run keeps its APK as a run artifact for 14 days.

- **Installing.** Open the link on the phone, then allow your browser to install apps when Android
  asks. Play Protect may warn about an unknown developer.
- **Updating.** Install the next one over it. Your progress stays, because each build is signed
  with the same key and numbered by its run.
- **What it is.**
  - A debug build of the app, with every course inside and no sync server.
  - Its id is `org.nabu.app.preview`, so it sits beside a store install of `org.nabu.app` and
    never claims that id.
  - It is debuggable: with USB debugging on, `chrome://inspect` on a computer shows its web view.
- **The preview key is public.** `android/app/preview.keystore` (password `nabu-preview`) is
  committed so that every machine signs previews alike.
  - Anyone can sign an APK that installs over a preview, so install previews only from the
    release page.
  - Never sign a store release with this key. A store release gets its own private upload key.
- **Building one yourself.**
  - Run `./gradlew assemblePreview` in `android/` after `pnpm --filter @nabu/mobile build`.
  - It is numbered 1 unless `NABU_VERSION_CODE` is set, so it will not install over a newer CI
    build. Use `adb install -r -d`, or set the number.
  - With a `google-services.json`, the Firebase project needs an Android app for
    `org.nabu.app.preview` as well.

## Publishing your own build

1. Set `appId` in `capacitor.config.ts` to your own reverse-domain id, and run `cap sync`.
2. **Android reminders.**
   - Create a Firebase project with an Android app of that id.
   - Put its `google-services.json` in `android/app/`. It is read at build time; do not commit
     it to a public repository.
   - On the server, set `NABU_FCM_SERVICE_ACCOUNT` to the path of a service-account key with the
     Firebase Cloud Messaging permission.
3. **iOS reminders.**
   - In Xcode, add the Push Notifications capability to the App target.
   - Create an APNs auth key (.p8) in your Apple Developer account.
   - On the server, set `NABU_APNS_KEY` (its path), `NABU_APNS_KEY_ID`, `NABU_APNS_TEAM_ID` and
     `NABU_APNS_TOPIC` (your `appId`). Add `NABU_APNS_SANDBOX=1` for development builds.
4. **Turn reminders on** on the server with `NABU_PUSH=1`. The app shows its reminder switch only
   when the server can reach that platform.
5. **Sign** both apps for release in Android Studio and Xcode.

Credentials stay on the server, in its environment. The app holds none.

## Icons and splash screens

Drawn for Nabu by `scripts/icons.ts` (three cuneiform wedges on the UI's accent colour) and
released under CC0-1.0. To redraw at every Android density and for iOS:
`pnpm --filter @nabu/mobile icons`.
