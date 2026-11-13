/**
 * Web client entry: negotiate the UI locale (setting → navigator.languages →
 * default), load its catalog, and render the app (course list, the course
 * path, and lesson, review and mistakes sessions over the on-device event log).
 *
 * Preferences (appearance, text size) are on their own screen, #/preferences. Query parameters stand in for
 * the other settings:
 *   ?ui=ar-XB            UI locale or pseudo-locale
 *   ?drafts=1            also offer draft UI catalogs (reviewers, ADR 0070): ?ui=fa&drafts=1
 *   ?seed=7              session seed (with a fixed clock and log, reproducible sessions for tests)
 *   ?sound=off           no feedback sounds
 *   ?target=yue-Hant-HK  the Phase 0 demo exercise card instead (fa, yue-Hant-HK, uz-Latn, apc-Arab),
 *                        loaded only then (it parses its profiles' YAML)
 *   ?mode=vertical-rl    the demo card's requested writing mode
 *
 * Course text takes its profiles from the course it belongs to (CourseUiProvider), so the app-wide
 * provider has none.
 */
import { DEFAULT_UI_LOCALE, DRAFT_UI_LOCALES, loadTranslator, negotiateLocale, PSEUDO_LOCALES, UI_LOCALES } from "@nabu/i18n";
import { NabuUiProvider, UiRoot } from "@nabu/ui";
import type { DemoTarget, WritingMode } from "@nabu/ui/demo";
import "@nabu/ui/fonts.css";
import "@nabu/ui/tokens.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { DebugNotice, debugMode } from "./Debug.tsx";
import { ErrorBoundary } from "./ErrorBoundary.tsx";
import { applyTextSize, applyTheme, storedTextSize, storedTheme } from "./Preferences.tsx";

// The learner's text size and theme, before the first paint (Preferences; index.html sets the theme earlier still).
applyTextSize(storedTextSize());
applyTheme(storedTheme());

const params = new URLSearchParams(window.location.search);
const drafts = params.get("drafts") === "1";
const negotiated = negotiateLocale({
  userSetting: params.get("ui") ?? undefined,
  accepted: navigator.languages,
  available: drafts ? [...UI_LOCALES, ...DRAFT_UI_LOCALES] : UI_LOCALES,
  pseudo: PSEUDO_LOCALES,
  defaultLocale: DEFAULT_UI_LOCALE,
});
const translator = await loadTranslator(negotiated.locale, { formattingLocale: negotiated.formattingLocale, drafts });

document.documentElement.lang = translator.locale;
document.documentElement.dir = translator.dir;
document.title = translator.format("app.name");

const root = createRoot(document.getElementById("root")!);
const requested = params.get("target");
const demo = requested === null ? undefined : await import("@nabu/ui/demo");
if (demo !== undefined && requested !== null && requested in demo.DEMO_TARGETS) {
  const { DEMO_ORTHOGRAPHIES, DemoExerciseCard } = demo;
  const mode = (params.get("mode") ?? "horizontal-tb") as WritingMode;
  root.render(
    <StrictMode>
      <NabuUiProvider translator={translator} orthographies={DEMO_ORTHOGRAPHIES}>
        <UiRoot>
          <DemoExerciseCard target={requested as DemoTarget} writingMode={mode} />
        </UiRoot>
      </NabuUiProvider>
    </StrictMode>,
  );
} else {
  root.render(
    <StrictMode>
      <NabuUiProvider translator={translator}>
        <UiRoot>
          {debugMode && <DebugNotice />}
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </UiRoot>
      </NabuUiProvider>
    </StrictMode>,
  );
}
