# 0143. Asking the device keyboard for the field's language

- Status: Proposed
- Date: 2026-11-17

## Context

Typing is left to the device keyboard ([ADR 0034](0034-lesson-player.md)). A learner of Persian
whose phone keyboard is set to English must switch to Persian before every Persian answer, then
back to English for every English one. Google Translate on Android switches Gboard for them: when
the languages change, the keyboard follows.

Translate does this with an Android API. A text field gives the keyboard app a list of languages
(`EditorInfo#hintLocales`, what `TextView#setImeHintLocales` sets), and Gboard switches to the first
one the learner has a keyboard for.

A web page cannot do the same:
- **Chrome and the Android WebView** never fill `hintLocales`. Chromium's `ImeAdapterImpl` and
  `ImeUtils` build the field's `EditorInfo` without the element's `lang` (checked on Chromium's
  main branch, 2026-11).
- **Firefox for Android** doesn't either (GeckoView's `GeckoInputConnection`).
- **No web API** chooses the system keyboard. The Keyboard API reads a layout; it cannot change one.
- **iOS** lets an app pick a keyboard by overriding `textInputMode` on the view being typed into. In
  a `WKWebView` that view is WebKit's private content view.

## Decision

**The Android app hands the keyboard app each text field's languages as the field takes focus.**

- **Which languages** (@nabu/i18n `keyboardLanguages`, from data only):
  - **The keyboard the orthography's profile names** (`input.keyboard`: cldr-kbd:fa, cldr-kbd:he
    for Biblical Hebrew, cldr-kbd:en for Toki Pona, Jyutping and Pinyin), then the text's own
    language. A person chose that keyboard as the one the orthography is typed on, so nothing
    further is guessed: a romanization is never sent to a Chinese keyboard.
  - **Without one:** the text's own language, then its macrolanguage in the same script and
    region, from CLDR's data (yue-Hant-HK: yue-HK, zh-Hant-HK; lzh-Hant: lzh, zh-Hant; apc-Arab:
    apc, ar).
  - Each is a CLDR locale id, keeping the script only where it is not the language's own (uz-Cyrl,
    but fa), so a Cyrillic Uzbek field never asks for Latin Uzbek.
- **The page names them.**
  - A field whose orthography is known names them in `data-keyboard` (@nabu/ui `keyboardHint`):
    the answer field, a correction's text, a reviewer's accepted answer.
  - Any other field asks for the language it is tagged with, its own `lang` or the nearest above
    it: a translation into English asks for English.
  - Fields that take no words (passwords, email addresses, numbers) and everything else that takes
    focus leave the keyboard as it is.
- **The shell passes them on.**
  - On Android, apps/web/src/native.ts listens for `focusin` and calls the app's `KeyboardLanguage`
    plugin.
  - `NabuWebView`, which replaces Capacitor's web view through its layout, adds the languages to
    the `EditorInfo` it builds.
  - The keyboard reads them only when an editor starts. When the languages change, the open editor
    restarts once (`InputMethodManager#restartInput`), at focus, before the learner has typed.
  - A field handed the same languages as the last one never restarts, so moving from card to card
    in a lesson costs nothing and an IME's composition is never cut short.

## Consequences

- **Android app only.** The web app, in any browser, and the iOS app keep the keyboard the learner
  chose. On the web there is no API to ask with.
- **A hint, not a switch.**
  - Gboard switches only to a language the learner has added to it. Nothing prompts them to add
    one.
  - Other keyboard apps may ignore the hint. The learner's own switching always works and always
    wins until the next field.
- **English fields switch back**, as in Translate: a typed translation into English asks for
  English.
- **Profiles decide.** A profile's `input.keyboard` now also chooses the device keyboard. A profile
  without one is typed on its language's keyboard, as CLDR's data finds it.
- **Upgrades.** The layout override must stay in step with Capacitor's
  `capacitor_bridge_layout_main.xml`.
- **Later.**
  - The app could say when the learner has no keyboard for the course's language and open the
    keyboard settings. Android lists the enabled keyboard languages of some keyboard apps
    (`getEnabledInputMethodSubtypeList`), not all.
  - iOS, if WebKit ever lets a page or an app pick the keyboard.
