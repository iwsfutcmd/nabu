/**
 * Storybook toolbar globals (gameplan §11.9): UI locale, pseudo-locale, target,
 * dir, writing mode and theme. The visual tests drive the same globals through the
 * iframe URL, so what you click here is what CI screenshots.
 */
import { DRAFT_UI_LOCALES, type PSEUDO_LOCALES, UI_LOCALES } from "@nabu/i18n";
import type { Preview } from "@storybook/react-vite";
import { DEMO_TARGETS } from "../src/demo/fixtures.ts";

export interface NabuGlobals {
  readonly uiLocale: string;
  readonly pseudoLocale: "off" | (typeof PSEUDO_LOCALES)[number];
  readonly target: keyof typeof DEMO_TARGETS;
  readonly dir: "auto" | "ltr" | "rtl";
  readonly writingMode: "horizontal-tb" | "vertical-rl" | "vertical-lr";
  /** data-theme on <html>, as the app sets it for a chosen theme (tokens.css). */
  readonly theme: "light" | "dark";
}

export const initialGlobals: NabuGlobals = {
  uiLocale: "en",
  pseudoLocale: "off",
  target: "fa",
  dir: "auto",
  writingMode: "horizontal-tb",
  theme: "light",
};

/** The locale the chrome actually uses: a pseudo-locale overrides the UI locale. */
export const effectiveUiLocale = (g: Partial<NabuGlobals>): string =>
  g.pseudoLocale !== undefined && g.pseudoLocale !== "off" ? g.pseudoLocale : (g.uiLocale ?? initialGlobals.uiLocale);

export const globalTypes: NonNullable<Preview["globalTypes"]> = {
  uiLocale: {
    description: "UI locale (real catalogs)",
    toolbar: { title: "UI locale", icon: "globe", dynamicTitle: true, items: [...UI_LOCALES.map((l) => ({ value: l, title: l })), ...DRAFT_UI_LOCALES.map((l) => ({ value: l, title: `${l} (draft)` }))] },
  },
  pseudoLocale: {
    description: "Pseudo-locale (overrides the UI locale)",
    toolbar: {
      title: "Pseudo",
      icon: "transfer",
      dynamicTitle: true,
      items: [
        { value: "off", title: "Pseudo-locale off" },
        { value: "en-XA", title: "en-XA (accented, expanded)" },
        { value: "ar-XB", title: "ar-XB (mirrored, RTL)" },
      ],
    },
  },
  target: {
    description: "Target orthography",
    toolbar: {
      title: "Target",
      icon: "book",
      dynamicTitle: true,
      items: Object.keys(DEMO_TARGETS).map((t) => ({ value: t, title: t })),
    },
  },
  dir: {
    description: "Force the chrome direction (auto = from the UI locale's script)",
    toolbar: {
      title: "dir",
      icon: "paragraph",
      dynamicTitle: true,
      items: [
        { value: "auto", title: "dir: auto" },
        { value: "ltr", title: "dir: ltr" },
        { value: "rtl", title: "dir: rtl" },
      ],
    },
  },
  writingMode: {
    description: "Requested writing mode for target text (applied only where the profile allows it)",
    toolbar: {
      title: "Writing mode",
      icon: "component",
      dynamicTitle: true,
      items: [
        { value: "horizontal-tb", title: "horizontal-tb" },
        { value: "vertical-rl", title: "vertical-rl" },
        { value: "vertical-lr", title: "vertical-lr" },
      ],
    },
  },
  theme: {
    description: "Light or dark theme",
    toolbar: {
      title: "Theme",
      icon: "contrast",
      dynamicTitle: true,
      items: [
        { value: "light", title: "Light" },
        { value: "dark", title: "Dark" },
      ],
    },
  },
};
