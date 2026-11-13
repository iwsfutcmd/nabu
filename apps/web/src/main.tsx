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
 *   ?target=yue-Hant-HK  the Phase 0 demo exercise card instead (fa, yue-Hant-HK, uz-Latn, apc-Arab)
 *   ?mode=vertical-rl    the demo card's requested writing mode
 */
import { DEFAULT_UI_LOCALE, DRAFT_UI_LOCALES, loadTranslator, negotiateLocale, PSEUDO_LOCALES, UI_LOCALES } from "@nabu/i18n";
import { NabuUiProvider, UiRoot } from "@nabu/ui";
import { DEMO_ORTHOGRAPHIES, DEMO_TARGETS, DemoExerciseCard, type DemoTarget, type WritingMode } from "@nabu/ui/demo";
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

const requested = params.get("target");
const target: DemoTarget | undefined = requested !== null && requested in DEMO_TARGETS ? (requested as DemoTarget) : undefined;
const mode = (params.get("mode") ?? "horizontal-tb") as WritingMode;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <NabuUiProvider translator={translator} orthographies={DEMO_ORTHOGRAPHIES}>
      <UiRoot>
        {target === undefined ? (
          <>
            {debugMode && <DebugNotice />}
            <ErrorBoundary>
              <App />
            </ErrorBoundary>
          </>
        ) : (
          <DemoExerciseCard target={target} writingMode={mode} />
        )}
      </UiRoot>
    </NabuUiProvider>
  </StrictMode>,
);
