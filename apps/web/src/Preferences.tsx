/**
 * Preferences for this device. A preference is a per-device convenience: it lives in
 * localStorage, as the reading layer and the listening and speaking breaks do, and without
 * storage it lasts the page.
 *
 * Text size scales the root font size, so every rem in the app follows it: the chrome and
 * every course's text alike. It is a percentage of the browser's own font size, so a size the
 * learner set in the browser still counts.
 */
import { useTranslator } from "@nabu/ui";
import { useState, type JSX } from "react";
import { Label, Radio, RadioGroup, Text } from "react-aria-components";
import styles from "./App.module.css";

export const TEXT_SIZES = ["smaller", "default", "large", "larger", "largest"] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

/** Percent of the browser's font size. */
const PERCENT: Readonly<Record<TextSize, number>> = { smaller: 87.5, default: 100, large: 115, larger: 130, largest: 150 };

const LABEL = {
  smaller: "preferences.text-size.smaller",
  default: "preferences.text-size.default",
  large: "preferences.text-size.large",
  larger: "preferences.text-size.larger",
  largest: "preferences.text-size.largest",
} as const satisfies Readonly<Record<TextSize, string>>;

const TEXT_SIZE_KEY = "nabu.text-size";
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

/** Sets the root font size to the chosen size (the default leaves the browser's own). */
export const applyTextSize = (size: TextSize): void => {
  const root = document.documentElement;
  if (size === "default") root.style.removeProperty("font-size");
  else root.style.setProperty("font-size", `${PERCENT[size]}%`);
  root.dataset["nabuTextSize"] = size;
};

/** The preferences screen: text size, applied as the learner chooses. */
export const PreferencesPage = ({ back }: { readonly back: string }): JSX.Element => {
  const t = useTranslator();
  const [size, setSize] = useState<TextSize>(storedTextSize);
  const choose = (value: string): void => {
    if (!isTextSize(value)) return;
    setSize(value);
    storeTextSize(value);
    applyTextSize(value);
  };
  return (
    <main className={styles.page} data-preferences="">
      <h1 className={styles.heading}>{t.format("preferences.title")}</h1>
      <RadioGroup className={styles.preferenceOptions} value={size} onChange={choose} data-preference="text-size">
        <Label className={styles.subheading}>{t.format("preferences.text-size.label")}</Label>
        <Text slot="description" className={styles.muted}>
          {t.format("preferences.text-size.hint")}
        </Text>
        {TEXT_SIZES.map((s) => (
          <Radio key={s} value={s} className={styles.preferenceOption} data-text-size={s}>
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
