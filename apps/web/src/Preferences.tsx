/**
 * Preferences for this device. A preference is a per-device convenience: it lives in
 * localStorage, as the reading layer and the listening and speaking breaks do, and without
 * storage it lasts the page.
 *
 * Text size is for the language being learned only: it sets --nabu-target-scale, which <T>
 * applies to the words of the course's own orthographies (and the answer field when typing
 * them), on top of the profile's scale. The chrome and the support language keep their size;
 * the browser's zoom is there for everything at once.
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

/** The preferences screen: the size of the language being learned, applied as the learner chooses. */
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
