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

- **Which languages, best first** (@nabu/i18n `keyboardLanguages`, from data only):
  1. **The text's own language**, for a keyboard of the language itself.
  2. **The keyboard the orthography's profile names** (`input.keyboard`: cldr-kbd:fa for
     Chaghatay, cldr-kbd:he for Biblical Hebrew, cldr-kbd:en for Toki Pona, Jyutping and Pinyin).
     A person chose that keyboard as the one the orthography is typed on, so nothing further is
     guessed: a romanization is never sent to a Chinese keyboard.
     - Where that keyboard is another language's and the text is Latin, a Latin keyboard of no
       language comes before it (`und-Latn`: Gboard's Alphabet, the project owner's choice). The
       orthography only borrows that language's letters, and English suggestions do not fit
       Toki Pona.
  3. **Without one:** the text's macrolanguage in the same script and region, from CLDR's data
     (yue-Hant-HK: zh-Hant-HK; lzh-Hant: zh-Hant; apc-Arab: ar).
  4. **Any keyboard of its script** (`und-Arab`, `und-Latn`, `und-Hant`).
  - Chaghatay asks for chg, fa, und-Arab; Toki Pona for tok, und-Latn, en.
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
  - **Android does the falling back.** Gboard acts on the first hint alone (LatinIME's code says
    so: its other hints are a TODO), so a list that starts with a language it has no keyboard for
    would switch nothing.
    - `KeyboardChoice` puts first the first hint the current keyboard has enabled, as that
      keyboard's own tag (`getEnabledInputMethodSubtypeList`).
    - A language matches with its script: zh-Hant never takes the Simplified keyboard, and Jyutping
      never takes Hong Kong Chinese.
    - `und-X` takes any keyboard of the script X; for Latin, Alphabet first (Android's `zz`, the
      tag LatinIME and Gboard give it).
    - A keyboard that lists no languages gets the hints in order, `und-Latn` as `zz`.
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
