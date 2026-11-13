/**
 * How the language being learned is shown (P12): its reading layer, its vowel marks and vertical
 * text, behind one button in the header of a lesson or a story, so the choices take no room above
 * every card. The app keeps the marks and vertical choices per device and course (the reading layer
 * per orthography, ADR 0071); before the learner chooses, the profile says (Persian: marks on the
 * words still being learned).
 */
import type { OrthographyProfile } from "@nabu/schema";
import { useState, type JSX } from "react";
import { Button, Dialog, DialogTrigger, Popover, Switch, ToggleButton, ToggleButtonGroup, type Key } from "react-aria-components";
import { useTranslator } from "../context.tsx";
import type { Marks } from "../marks.tsx";
import { chromeClass, useChrome } from "../UiRoot.tsx";
import styles from "./Player.module.css";
import { ReadingsControl, type Readings } from "./Readings.tsx";
import { defaultMarks, effectiveWritingMode, hasMarksLayer, type WritingMode } from "./shared.ts";

/** What the learner chose for a course on this device: undefined where they have not chosen. */
export interface DisplayChoice {
  readonly marks?: Marks | undefined;
  readonly vertical?: boolean | undefined;
}

export interface Display {
  /** The vowel marks shown, where the profile has a marks layer. */
  readonly marks: Marks;
  readonly setMarks: (marks: Marks) => void;
  /** The writing mode of the text that may turn vertical (word banks and prompts; a story's transcript). */
  readonly mode: WritingMode;
  /** The profile's vertical mode, where this text may take it. */
  readonly vertical: WritingMode | undefined;
  readonly setVertical: (on: boolean) => void;
}

/**
 * The display choices of a lesson or story: what the learner chose before, else the profile's
 * default; a change goes to `onChange` (the app keeps it). `scope` is where vertical text applies.
 */
export const useDisplay = (
  profile: OrthographyProfile | undefined,
  scope: "wordbank" | "reading",
  requested: WritingMode | undefined,
  chosen: DisplayChoice | undefined,
  onChange: ((choice: DisplayChoice) => void) | undefined,
): Display => {
  const layout = profile?.layout?.vertical;
  const vertical = layout !== undefined && layout !== "none" && effectiveWritingMode(profile, layout, scope) !== "horizontal-tb" ? layout : undefined;
  const [marks, setMarksState] = useState<Marks>(() => chosen?.marks ?? defaultMarks(profile));
  const [mode, setMode] = useState<WritingMode>(() => requested ?? (chosen?.vertical === true && vertical !== undefined ? vertical : "horizontal-tb"));
  return {
    marks,
    setMarks: (next) => {
      setMarksState(next);
      onChange?.({ marks: next, vertical: mode !== "horizontal-tb" });
    },
    mode,
    vertical,
    setVertical: (on) => {
      setMode(on && vertical !== undefined ? vertical : "horizontal-tb");
      onChange?.({ marks, vertical: on });
    },
  };
};

const MARKS: readonly (readonly [Marks, "player.marks.show" | "player.marks.new" | "player.marks.hide"])[] = [
  ["show", "player.marks.show"],
  ["new", "player.marks.new"],
  ["hide", "player.marks.hide"],
];

/** Vowel marks on every word, on the new words, or on none: a labelled row of three choices. */
const MarksControl = ({ marks, onChange }: { readonly marks: Marks; readonly onChange: (marks: Marks) => void }): JSX.Element => {
  const t = useTranslator();
  const label = t.format("player.marks.label");
  return (
    <div className={styles.readings} data-toggle="marks" data-marks-shown={marks}>
      <span className={styles.readingsLabel} aria-hidden="true">
        {label}
      </span>
      <ToggleButtonGroup
        className={styles.segments}
        aria-label={label}
        selectionMode="single"
        disallowEmptySelection
        selectedKeys={[marks]}
        onSelectionChange={(keys: Set<Key>) => {
          const [key] = [...keys];
          if (key === "show" || key === "new" || key === "hide") onChange(key);
        }}
      >
        {MARKS.map(([value, message]) => (
          <ToggleButton key={value} id={value} className={styles.segment} data-marks={value}>
            {t.format(message)}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </div>
  );
};

/** Sliders: display settings. Symmetric enough never to mirror. */
const DisplayIcon = (): JSX.Element => (
  <svg width={20} height={20} viewBox="0 0 24 24" aria-hidden focusable={false} data-icon="display">
    <path d="M4 7h16M4 17h16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <circle cx="9" cy="7" r="2.5" fill="currentColor" />
    <circle cx="15" cy="17" r="2.5" fill="currentColor" />
  </svg>
);

/** Whether a profile offers anything to choose: a reading layer, vowel marks, or vertical text here. */
export const hasDisplayChoices = (profile: OrthographyProfile | undefined, readings: Readings, display: Display): boolean =>
  readings.layers.length > 0 || hasMarksLayer(profile) || display.vertical !== undefined;

/**
 * The display button and its menu. The menu is a popover outside the app's root, so it takes the
 * chrome's lang, dir and font itself (useChrome); its keys are its own (P11).
 */
export const DisplayMenu = ({
  profile,
  readings,
  display,
  defaultOpen = false,
}: {
  readonly profile: OrthographyProfile | undefined;
  readonly readings: Readings;
  readonly display: Display;
  /** For Storybook and tests: the menu starts open. */
  readonly defaultOpen?: boolean;
}): JSX.Element => {
  const t = useTranslator();
  const chrome = useChrome();
  const label = t.format("player.display.label");
  const { vertical } = display;
  return (
    <DialogTrigger defaultOpen={defaultOpen}>
      <Button className={styles.iconButton} aria-label={label} data-action="display">
        <DisplayIcon />
      </Button>
      <Popover className={styles.popover} placement="bottom end" offset={6}>
        <Dialog className={`${styles.menu} ${chromeClass}`} style={chrome.style} aria-label={label} data-display-menu="">
          <div className={styles.menuBody} lang={chrome.lang} dir={chrome.dir}>
            <ReadingsControl readings={readings} />
            {hasMarksLayer(profile) && <MarksControl marks={display.marks} onChange={display.setMarks} />}
            {vertical !== undefined && (
              <Switch
                className={styles.switch}
                isSelected={display.mode !== "horizontal-tb"}
                onChange={(on) => {
                  display.setVertical(on);
                  readings.onVertical(on);
                }}
                data-toggle="vertical"
              >
                <span className={styles.switchTrack} aria-hidden="true">
                  <span className={styles.switchThumb} />
                </span>
                {t.format("player.toggle.vertical")}
              </Switch>
            )}
          </div>
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
};
