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
 *
 * Sound: on, or off (nothing plays by itself in lessons and stories). The player's header has the
 * same switch.
 *
 * The time of the daily reminder is the one preference that is the account's, not the device's:
 * the server sends the reminders, so it keeps the time (ADR 0103) for every device that gets them.
 * It shows when signed in to a server that sends reminders.
 */
import { parseTime, Time } from "@internationalized/date";
import { useTranslator } from "@nabu/ui";
import { useEffect, useState, type FormEvent, type JSX } from "react";
import { Button, DateInput, DateSegment, Form, Label, Radio, RadioGroup, Text, TimeField, type TimeValue } from "react-aria-components";
import styles from "./App.module.css";
import { request, type Account } from "./sync.ts";

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

/**
 * Sound in lessons and stories (P6): on, or off. Off, nothing plays by itself (feedback tones, clips
 * said as a card opens or is answered, story lines read out); the play buttons still work. The
 * player's own sound button changes the same setting.
 */
const SOUND_KEY = "nabu.sound";
let soundFallback = true;

/** Whether sound is on on this device (on until the learner turns it off). */
export const storedSound = (): boolean => {
  try {
    return localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return soundFallback;
  }
};

export const storeSound = (on: boolean): void => {
  soundFallback = on;
  try {
    if (on) localStorage.removeItem(SOUND_KEY);
    else localStorage.setItem(SOUND_KEY, "off");
  } catch {
    // Storage unavailable: the choice lasts this page.
  }
};

/** What the server says of the reminder time: whether it sends reminders at all, and the time chosen ("HH:MM"; null: automatic). */
interface ReminderSetting {
  readonly available: boolean;
  readonly time: string | null;
}

/** Automatic (after the time the learner usually practises) or a time they choose. */
type ReminderMode = "automatic" | "chosen";

/** "07:30" from a time field's value: the 24-hour form the API takes, whatever the field shows. */
const hhmm = (value: TimeValue): string => `${String(value.hour).padStart(2, "0")}:${String(value.minute).padStart(2, "0")}`;

/**
 * When the daily reminder comes: a little after the time the learner usually practises, or at a
 * time they choose. The field shows the time as the UI locale writes it (12 or 24 hours, its
 * digits); the account keeps it as hours and minutes of the learner's own day.
 */
const ReminderTime = ({ account }: { readonly account: Account }): JSX.Element | null => {
  const t = useTranslator();
  const [setting, setSetting] = useState<ReminderSetting | null>(null);
  const [mode, setMode] = useState<ReminderMode>("automatic");
  const [time, setTime] = useState<TimeValue | null>(() => new Time(19, 0));
  const [status, setStatus] = useState<"saved" | "failed" | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void request<ReminderSetting>(account.server, "/v1/push/reminder", { token: account.token }).then(
      (s) => {
        setSetting(s);
        setMode(s.time === null ? "automatic" : "chosen");
        if (s.time !== null) setTime(parseTime(s.time));
      },
      // An older server, or none reachable: nothing to set.
      () => setSetting(null),
    );
  }, [account]);
  if (setting === null || !setting.available) return null;
  const save = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (busy || (mode === "chosen" && time === null)) return;
    setBusy(true);
    const body = { time: mode === "chosen" && time !== null ? hhmm(time) : null };
    void request<ReminderSetting>(account.server, "/v1/push/reminder", { token: account.token, method: "PUT", body }).then(
      (s) => {
        setSetting(s);
        setStatus("saved");
        setBusy(false);
      },
      () => {
        setStatus("failed");
        setBusy(false);
      },
    );
  };
  return (
    <Form className={styles.preferenceOptions} onSubmit={save} data-preference="reminder-time">
      <RadioGroup
        className={styles.reminderModes}
        value={mode}
        onChange={(value) => {
          if (value !== "automatic" && value !== "chosen") return;
          setMode(value);
          setStatus(null);
        }}
      >
        <Label className={styles.subheading}>{t.format("preferences.reminder.label")}</Label>
        <Text slot="description" className={styles.muted}>
          {t.format("preferences.reminder.hint")}
        </Text>
        <Radio value="automatic" className={styles.preferenceOption} data-reminder-mode="automatic">
          {t.format("preferences.reminder.automatic")}
        </Radio>
        <Radio value="chosen" className={styles.preferenceOption} data-reminder-mode="chosen">
          {t.format("preferences.reminder.chosen")}
        </Radio>
      </RadioGroup>
      {mode === "chosen" && (
        <TimeField
          className={styles.field}
          value={time}
          onChange={(value) => {
            setTime(value);
            setStatus(null);
          }}
          isRequired
          data-field="reminder-time"
        >
          <Label className={styles.label}>{t.format("preferences.reminder.time")}</Label>
          <DateInput className={styles.timeInput}>{(segment) => <DateSegment segment={segment} className={styles.timeSegment} />}</DateInput>
        </TimeField>
      )}
      <div className={styles.links}>
        <Button className={styles.button} type="submit" isDisabled={busy} data-action="reminder-time-save">
          {t.format("preferences.reminder.save")}
        </Button>
      </div>
      {status === "saved" && (
        <p className={styles.muted} role="status" data-reminder-time-saved="">
          {t.format("preferences.reminder.saved")}
        </p>
      )}
      {status === "failed" && (
        <p className={styles.notice} role="alert" data-reminder-time-error="">
          {t.format("preferences.reminder.failed")}
        </p>
      )}
    </Form>
  );
};

/**
 * The preferences screen: appearance, the size of the language being learned and sound, applied as
 * the learner chooses; with an account, the time of the daily reminder.
 */
export const PreferencesPage = ({ back, account }: { readonly back: string; readonly account?: Account | undefined }): JSX.Element => {
  const t = useTranslator();
  const [size, setSize] = useState<TextSize>(storedTextSize);
  const [theme, setTheme] = useState<Theme>(storedTheme);
  const [sound, setSound] = useState<boolean>(storedSound);
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
      <RadioGroup
        className={styles.preferenceOptions}
        value={sound ? "on" : "off"}
        onChange={(value) => {
          const on = value !== "off";
          setSound(on);
          storeSound(on);
        }}
        data-preference="sound"
      >
        <Label className={styles.subheading}>{t.format("preferences.sound.label")}</Label>
        <Text slot="description" className={styles.muted}>
          {t.format("preferences.sound.hint")}
        </Text>
        <Radio value="on" className={styles.preferenceOption} data-sound-choice="on">
          {t.format("preferences.sound.on")}
        </Radio>
        <Radio value="off" className={styles.preferenceOption} data-sound-choice="off">
          {t.format("preferences.sound.off")}
        </Radio>
      </RadioGroup>
      {account !== undefined && <ReminderTime account={account} />}
      <p>
        <a className={styles.back} href={back} data-preferences-back="">
          {t.format("preferences.back")}
        </a>
      </p>
    </main>
  );
};
