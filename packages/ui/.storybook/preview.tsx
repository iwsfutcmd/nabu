import { loadTranslator, type Translator } from "@nabu/i18n";
import type { Decorator, Loader, Preview } from "@storybook/react-vite";
import { NabuUiProvider } from "../src/context.tsx";
import { DEMO_ORTHOGRAPHIES } from "../src/demo/profiles.ts";
import "../src/fonts.css";
import "../src/tokens.css";
import { UiRoot } from "../src/UiRoot.tsx";
import "./preview.css";
import { effectiveUiLocale, globalTypes, initialGlobals, type NabuGlobals } from "./toolbar.ts";

const loaders: Loader[] = [
  // Drafts too: Storybook is where reviewers look at a draft catalog (ADR 0070); the app ships only reviewed ones.
  async ({ globals }) => ({ translator: await loadTranslator(effectiveUiLocale(globals), { drafts: true }) }),
];

const withNabu: Decorator = (Story, { globals, loaded }) => {
  const g = globals as Partial<NabuGlobals>;
  return (
    <NabuUiProvider translator={loaded["translator"] as Translator} orthographies={DEMO_ORTHOGRAPHIES}>
      <UiRoot dir={g.dir === "ltr" || g.dir === "rtl" ? g.dir : undefined}>
        <Story />
      </UiRoot>
    </NabuUiProvider>
  );
};

const preview: Preview = {
  globalTypes,
  initialGlobals: { ...initialGlobals },
  loaders,
  decorators: [withNabu],
  parameters: { layout: "fullscreen" },
};

export default preview;
