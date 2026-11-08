/**
 * Preferences for this device. A preference is a per-device convenience: it lives in
 * localStorage, as the reading layer and the listening and speaking breaks do, and without
 * storage it lasts the page.
 *
 * Text size is for the language being learned only: it sets --nabu-target-scale, which <T>
 * applies to the words of the course's own orthographies (and the answer field when typing
 * them), on top of the profile's scale. The chrome and the support language keep their size;
 * the browser's zoom is there for everything at once.
 *
 * Appearance: match the browser (the default: light or dark as the browser or device is set), or
 * light or dark whatever it is set to. A chosen theme is data-theme on <html> (tokens.css);
 * index.html sets it before the first paint, so a dark page never flashes light.
 */
import { useTranslator } from "@nabu/ui";
import { useState, type JSX } from "react";
import { Label, Radio, RadioGroup, Text } from "react-aria-components";
import styles from "./App.module.css";

export const TEXT_SIZES = ["smaller", "default", "large", "larger", "largest"] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

/** Times the size the course sets it at. */
const SCALE: Readonly<Record<TextSize, number>> = { smaller: 0.85, default: 1, large: 1.25, larger: 1.5, largest: 1.75 };

const LABEL = {
  smaller: "preferences.target-size.smaller",
  default: "preferences.target-size.default",
  large: "preferences.target-size.large",
  larger: "preferences.target-size.larger",
  largest: "preferences.target-size.largest",
} as const satisfies Readonly<Record<TextSize, string>>;

const TEXT_SIZE_KEY = "nabu.target-size";
let fallback: TextSize = "default";

const isTextSize = (value: string | null): value is TextSize => value !== null && (TEXT_SIZES as readonly string[]).includes(value);

/** The text size chosen on this device ("default" until the learner picks one). */
export const storedTextSize = (): TextSize => {
  try {
    const value = localStorage.getItem(TEXT_SIZE_KEY);
    return isTextSize(value) ? value : "default";
  } catch {
    return fallback;
  }
};

const storeTextSize = (size: TextSize): void => {
  fallback = size;
  try {
    if (size === "default") localStorage.removeItem(TEXT_SIZE_KEY);
    else localStorage.setItem(TEXT_SIZE_KEY, size);
  } catch {
    // Storage unavailable: the choice lasts this page.
  }
};

/** Sets the scale of the language being learned (the default leaves it as the course sets it). */
export const applyTextSize = (size: TextSize): void => {
  const root = document.documentElement;
  if (size === "default") root.style.removeProperty("--nabu-target-scale");
  else root.style.setProperty("--nabu-target-scale", String(SCALE[size]));
  root.dataset["nabuTargetSize"] = size;
};

export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

const THEME_LABEL = { system: "preferences.theme.system", light: "preferences.theme.light", dark: "preferences.theme.dark" } as const satisfies Readonly<Record<Theme, string>>;

/** Read before the first paint by index.html too: keep the two in step. */
export const THEME_KEY = "nabu.theme";
let themeFallback: Theme = "system";

const isTheme = (value: string | null): value is Theme => value !== null && (THEMES as readonly string[]).includes(value);

/** The theme chosen on this device ("system", matching the browser, until the learner picks one). */
export const storedTheme = (): Theme => {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return isTheme(value) ? value : "system";
  } catch {
    return themeFallback;
  }
};

const storeTheme = (theme: Theme): void => {
  themeFallback = theme;
  try {
    if (theme === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Storage unavailable: the choice lasts this page.
  }
};

/**
 * Applies a theme: data-theme on <html> for a chosen one, none to follow the browser. The browser's
 * own chrome follows too: index.html's theme-color for the chosen theme applies whatever the
 * browser prefers, and with "system" each applies under its own media query again.
 */
export const applyTheme = (theme: Theme): void => {
  const root = document.documentElement;
  if (theme === "system") delete root.dataset["theme"];
  else root.dataset["theme"] = theme;
  for (const meta of document.querySelectorAll<HTMLMetaElement>("meta[name=theme-color][data-theme-for]")) {
    const own = meta.dataset["themeFor"];
    meta.media = theme === "system" ? `(prefers-color-scheme: ${own ?? "light"})` : own === theme ? "all" : "not all";
  }
};

/** The preferences screen: appearance and the size of the language being learned, applied as the learner chooses. */
export const PreferencesPage = ({ back }: { readonly back: string }): JSX.Element => {
  const t = useTranslator();
  const [size, setSize] = useState<TextSize>(storedTextSize);
  const [theme, setTheme] = useState<Theme>(storedTheme);
  const choose = (value: string): void => {
    if (!isTextSize(value)) return;
    setSize(value);
    storeTextSize(value);
    applyTextSize(value);
  };
  const chooseTheme = (value: string): void => {
    if (!isTheme(value)) return;
    setTheme(value);
    storeTheme(value);
    applyTheme(value);
  };
  return (
    <main className={styles.page} data-preferences="">
      <h1 className={styles.heading}>{t.format("preferences.title")}</h1>
      <RadioGroup className={styles.preferenceOptions} value={theme} onChange={chooseTheme} data-preference="theme">
        <Label className={styles.subheading}>{t.format("preferences.theme.label")}</Label>
        <Text slot="description" className={styles.muted}>
          {t.format("preferences.theme.hint")}
        </Text>
        {THEMES.map((th) => (
          <Radio key={th} value={th} className={styles.preferenceOption} data-theme-choice={th}>
            {t.format(THEME_LABEL[th])}
          </Radio>
        ))}
      </RadioGroup>
      <RadioGroup className={styles.preferenceOptions} value={size} onChange={choose} data-preference="target-size">
        <Label className={styles.subheading}>{t.format("preferences.target-size.label")}</Label>
        <Text slot="description" className={styles.muted}>
          {t.format("preferences.target-size.hint")}
        </Text>
        {TEXT_SIZES.map((s) => (
          <Radio key={s} value={s} className={styles.preferenceOption} data-target-size={s}>
            {t.format(LABEL[s])}
          </Radio>
        ))}
      </RadioGroup>
      <p>
        <a className={styles.back} href={back} data-preferences-back="">
          {t.format("preferences.back")}
        </a>
      </p>
    </main>
  );
};
