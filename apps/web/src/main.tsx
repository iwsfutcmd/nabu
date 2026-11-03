/**
 * Phase 0 shell: negotiate the UI locale (setting → navigator.languages →
 * default), load its catalog, and render the demo exercise card. The real app
 * (router, player, store) arrives in Phases 3–4.
 *
 * Query parameters stand in for settings until there is a settings screen:
 *   ?ui=ar-XB            UI locale or pseudo-locale
 *   ?target=yue-Hant-HK  demo target (fa, yue-Hant-HK, uz-Latn, apc-Arab)
 *   ?mode=vertical-rl    requested writing mode
 */
import { DEFAULT_UI_LOCALE, loadTranslator, negotiateLocale, PSEUDO_LOCALES, UI_LOCALES } from "@nabu/i18n";
import { NabuUiProvider, UiRoot } from "@nabu/ui";
import { DEMO_ORTHOGRAPHIES, DEMO_TARGETS, DemoExerciseCard, type DemoTarget, type WritingMode } from "@nabu/ui/demo";
import "@nabu/ui/fonts.css";
import "@nabu/ui/tokens.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

const params = new URLSearchParams(window.location.search);
const negotiated = negotiateLocale({
  userSetting: params.get("ui") ?? undefined,
  accepted: navigator.languages,
  available: UI_LOCALES,
  pseudo: PSEUDO_LOCALES,
  defaultLocale: DEFAULT_UI_LOCALE,
});
const translator = await loadTranslator(negotiated.locale, { formattingLocale: negotiated.formattingLocale });

document.documentElement.lang = translator.locale;
document.documentElement.dir = translator.dir;
document.title = translator.format("app.name");

const requested = params.get("target");
const target: DemoTarget = requested !== null && requested in DEMO_TARGETS ? (requested as DemoTarget) : "fa";
const mode = (params.get("mode") ?? "horizontal-tb") as WritingMode;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <NabuUiProvider translator={translator} orthographies={DEMO_ORTHOGRAPHIES}>
      <UiRoot>
        <DemoExerciseCard target={target} writingMode={mode} />
      </UiRoot>
    </NabuUiProvider>
  </StrictMode>,
);
