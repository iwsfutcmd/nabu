/**
 * What the lesson player and the story reader share (C14 in the 2026-11 review): their keys, the
 * header with its progress bar, the toggles in it (the display menu, the sound switch) and the quit
 * dialog. A fix to one of them is made once, for both.
 */
import type { OrthographyProfile, SchemeId } from "@nabu/schema";
import { useEffect, useRef, useState, type CSSProperties, type JSX, type ReactNode } from "react";
import { Button, Dialog, Heading, Modal, ProgressBar } from "react-aria-components";
import { CloseIcon } from "../icons.tsx";
import { chromeClass, useChrome } from "../UiRoot.tsx";
import { DisplayMenu, hasDisplayChoices, useDisplay, type Display, type DisplayChoice } from "./Display.tsx";
import styles from "./Player.module.css";
import { useReadings, type Readings } from "./Readings.tsx";
import { digitIndex, inDialog, typingInField, type Shortcuts, type WritingMode } from "./shared.ts";
import { SoundToggle } from "./SoundToggle.tsx";

// ------------------------------------------------------------------------------------ keys

/** What a session's keys do now (§11.3, §11.7). */
export interface PlayerKeys {
  /** What Enter does now (check, continue), or undefined: nothing. */
  readonly enter: (() => void) | undefined;
  /**
   * The one button Enter still goes to the session from (a story's Continue). From any other button
   * or link Enter is theirs: they activate themselves.
   */
  readonly enterFrom?: { readonly current: HTMLElement | null } | undefined;
  /** Where the card's view registers its number keys and Backspace, or undefined: no card now. */
  readonly shortcuts: { readonly current: Shortcuts | null } | undefined;
}

/**
 * A key the session takes: Enter checks and continues, number keys and Backspace go to the card's
 * view. Never during IME composition (§6.7), inside a text field (it handles its own Enter), or in a
 * dialog: the quit dialog, a correction's form, a menu (P11). Their keys are theirs.
 */
const onPlayerKey = (e: globalThis.KeyboardEvent, keys: PlayerKeys): void => {
  if (e.isComposing || e.keyCode === 229 || typingInField(e.target) || inDialog(e.target)) return;
  if (e.key === "Enter") {
    const control = e.target instanceof HTMLElement ? e.target.closest("button, a, [role=switch]") : null;
    if (control !== null && control !== keys.enterFrom?.current) return;
    if (keys.enter !== undefined) {
      e.preventDefault();
      e.stopPropagation();
      keys.enter();
    }
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const view = keys.shortcuts?.current;
  const digit = digitIndex(e.key);
  if (digit !== undefined && view?.digit !== undefined) {
    e.preventDefault();
    view.digit(digit);
  } else if (e.key === "Backspace" && view?.backspace !== undefined) {
    e.preventDefault();
    view.backspace();
  }
};

/**
 * A session's keys (§11.3, §11.7). A capturing window listener keeps them working when focus falls
 * back to the page, and claims Enter before a focused radio would re-select itself. The shell says
 * what they do as it renders (`keys.current`): undefined while they are not the session's (its quit
 * dialog is open, or it is over).
 */
export const usePlayerKeys = (): { current: PlayerKeys | undefined } => {
  const keys = useRef<PlayerKeys | undefined>(undefined);
  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent): void => {
      if (keys.current !== undefined) onPlayerKey(e, keys.current);
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, []);
  return keys;
};

// ------------------------------------------------------------------------------------ toggles

/** The display and sound choices a lesson or story opens with, as the app keeps them, and where a change goes. */
export interface ToggleProps {
  readonly sound?: boolean | undefined;
  readonly onSoundChange?: ((on: boolean) => void) | undefined;
  readonly writingMode?: WritingMode | undefined;
  readonly reading?: SchemeId | false | undefined;
  readonly onReadingChange?: ((scheme: SchemeId | false) => void) | undefined;
  readonly display?: DisplayChoice | undefined;
  readonly onDisplayChange?: ((choice: DisplayChoice) => void) | undefined;
}

export interface Toggles {
  /** Sound on: off, nothing plays by itself (P6). */
  readonly sound: boolean;
  /** The sound switch: the session's sound, and the app keeps the choice. */
  readonly setSound: (on: boolean) => void;
  /** Vowel marks and vertical text (P12). */
  readonly display: Display;
  /** The reading layer shown, in horizontal and vertical text alike (ADR 0118). */
  readonly readings: Readings;
  /** A tapped word's gloss shows its reading: the layer shown, or the only one there is (yue). */
  readonly glossRuby: SchemeId | false;
}

/**
 * Sound, the reading layer, vowel marks and vertical text in a lesson or story: the learner's choices
 * for the course, else the profile's (P12); a change goes to the app. `scope` is where vertical text
 * applies (a lesson's word banks and prompts, a story's lines).
 */
export const useToggles = (profile: OrthographyProfile | undefined, scope: "wordbank" | "reading", props: ToggleProps): Toggles => {
  const [sound, setSound] = useState(props.sound !== false);
  const display = useDisplay(profile, scope, props.writingMode, props.display, props.onDisplayChange);
  const readings = useReadings(profile, props.reading, props.onReadingChange);
  return {
    sound,
    setSound: (on) => {
      setSound(on);
      props.onSoundChange?.(on);
    },
    display,
    readings,
    glossRuby: readings.shown !== false ? readings.shown : readings.layers.length === 1 ? (readings.layers[0]?.scheme ?? false) : false,
  };
};

/**
 * The header's toggles: readings, vowel marks and vertical text behind one button, so they take no
 * room above the card or the story (P12), where the profile offers a choice; then the sound switch (P6).
 */
export const HeaderToggles = ({ profile, toggles, open = false }: { readonly profile: OrthographyProfile | undefined; readonly toggles: Toggles; readonly open?: boolean }): JSX.Element => (
  <>
    {hasDisplayChoices(profile, toggles.readings, toggles.display) && <DisplayMenu profile={profile} readings={toggles.readings} display={toggles.display} defaultOpen={open} />}
    <SoundToggle on={toggles.sound} onChange={toggles.setSound} />
  </>
);

// ------------------------------------------------------------------------------------ header

/** A session's progress bar: how much is done of all, and what it says to a screen reader. */
export interface Progress {
  readonly done: number;
  readonly total: number;
  /** The bar's name. */
  readonly label: string;
  /** Its value in words. */
  readonly value: string;
}

/**
 * A lesson's or story's header: the button that leaves it (or closes a story read again), the
 * progress bar (without one, its room is kept), then what the session adds (cards left, the toggles,
 * a link to Preferences).
 */
export const SessionHeader = ({
  close,
  progress,
  children,
}: {
  readonly close: { readonly label: string; readonly action: string; readonly onPress: () => void };
  readonly progress: Progress | undefined;
  readonly children: ReactNode;
}): JSX.Element => (
  <header className={styles.header}>
    <Button className={styles.iconButton} aria-label={close.label} onPress={close.onPress} data-action={close.action}>
      <CloseIcon />
    </Button>
    {progress === undefined ? (
      <span className={styles.progress} />
    ) : (
      <ProgressBar className={styles.progress} value={progress.done} minValue={0} maxValue={progress.total} aria-label={progress.label} valueLabel={progress.value}>
        {({ percentage }) => (
          <div className={styles.track} data-progress-track="">
            <div className={styles.fill} data-progress-fill="" style={{ "--nabu-progress": `${percentage ?? 0}%` } as CSSProperties} />
          </div>
        )}
      </ProgressBar>
    )}
    {children}
  </header>
);

// ------------------------------------------------------------------------------------ quitting

/** What a quit dialog says: its title, what quitting keeps, and its two buttons. */
export interface QuitCopy {
  readonly title: string;
  readonly body: string;
  readonly confirm: string;
  readonly cancel: string;
}

/**
 * Asks before leaving a session, and says what leaving keeps (P8). The dialog is portalled out of the
 * app's root, so it takes the chrome's lang, dir and font itself. Dismissing it goes on, as its
 * cancel button does.
 */
export const QuitDialog = ({
  open,
  copy,
  replay,
  mode,
  onConfirm,
  onCancel,
}: {
  readonly open: boolean;
  readonly copy: QuitCopy;
  /** The session was finished before (D13): leaving it loses nothing more. */
  readonly replay: boolean;
  /** The session's kind, where it has one (a lesson, practice, the placement test). */
  readonly mode?: string | undefined;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}): JSX.Element => {
  const chrome = useChrome();
  return (
    <Modal
      className={styles.modal}
      isOpen={open}
      isDismissable
      onOpenChange={(isOpen) => {
        if (!isOpen) onCancel();
      }}
    >
      <Dialog className={`${styles.dialog} ${chromeClass}`} style={chrome.style} data-quit-dialog="" data-mode={mode}>
        <div className={styles.dialogBody} lang={chrome.lang} dir={chrome.dir}>
          <Heading slot="title" className={styles.instruction}>
            {copy.title}
          </Heading>
          <p data-quit-kept="" data-replay={replay || undefined}>
            {copy.body}
          </p>
          <div className={styles.footer}>
            <Button className={styles.secondary} onPress={onConfirm} data-action="quit-confirm">
              {copy.confirm}
            </Button>
            <Button className={styles.primary} onPress={onCancel} autoFocus data-action="resume">
              {copy.cancel}
            </Button>
          </div>
        </div>
      </Dialog>
    </Modal>
  );
};

/**
 * The app bumps `request` to ask, as the quit button does, whether to leave (S3: Back, or a phone's
 * back button, in the middle of a session). `ask` is the one of the render that saw the bump.
 */
export const useQuitRequest = (request: number | undefined, ask: () => void): void => {
  const asked = useRef(request);
  useEffect(() => {
    if (request === asked.current) return;
    asked.current = request;
    ask();
  }, [request]);
};
