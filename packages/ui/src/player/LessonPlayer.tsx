/**
 * The lesson player (gameplan §11.5): header (quit, progress), the current
 * exercise's view, the reading toggles, feedback and the footer. The shell is
 * usePlayer(); this component only renders state and turns clicks and keys
 * into PlayerEvents.
 *
 * Three language contexts (§11.2): the chrome follows the UI locale, prompts and
 * answers follow their own TaggedText, and answer regions take the target
 * script's direction, never the UI's.
 */
import { draftOf, emptyDraft, isCorrect, LISTENING, progressOf, responseOf, SPEAKING, type CourseView, type Exercise, type Grader, type LessonEvent, type Outcome, type PlayerState, type Response } from "@nabu/core/lesson";
import type { OrthographyProfile, SchemeId } from "@nabu/schema";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type JSX, type ReactNode } from "react";
import { Button, Dialog, Heading, Modal, ProgressBar, Switch } from "react-aria-components";
import { NabuUiProvider, useTranslator } from "../context.tsx";
import { ArrowForwardIcon, CloseIcon } from "../icons.tsx";
import { Feedback } from "./Feedback.tsx";
import styles from "./Player.module.css";
import { ReadingsControl, useReadings } from "./Readings.tsx";
import { digitIndex, effectiveWritingMode, hasMarksLayer, typingInField, type Shortcuts, type WritingMode } from "./shared.ts";
import { SpeechProvider, type SpeechServices } from "./speech.tsx";
import { usePlayer } from "./usePlayer.ts";
import { ExerciseView, INSTRUCTIONS } from "./ExerciseView.tsx";

export interface LessonPlayerProps {
  readonly course: CourseView;
  readonly lessonId: string;
  readonly exercises: readonly Exercise[];
  readonly grader: Grader;
  /** Maps a bundle path (images/…) to a URL. */
  readonly imageUrl: (path: string) => string;
  /** The course name, for instructions ("Write this in Persian"). */
  readonly language: string;
  readonly onEvent?: (event: LessonEvent) => void;
  readonly onExit?: () => void;
  readonly sound?: boolean;
  /** Initial writing mode for target prompts and word banks (vertical where allowed). */
  readonly writingMode?: WritingMode;
  /** For stories and tests: start from this state instead of the lesson's first exercise. */
  readonly initialState?: PlayerState;
  /** XP this session earned so far, shown when it ends (the app computes it from the event log). */
  readonly xpEarned?: number | undefined;
  /** Missed exercises come back at the end (default); off for a placement test. */
  readonly retries?: boolean | undefined;
  /** The learner pressed "Can't listen now": the app leaves listening out of the next sessions. */
  readonly onCantListen?: (() => void) | undefined;
  /** The learner pressed "Can't speak now": the app leaves speaking out of the next sessions. */
  readonly onCantSpeak?: (() => void) | undefined;
  /**
   * More under the feedback for an answer (Phase 8: report it, a second check, an explanation).
   * The app supplies it; the player only places it, outside the live region.
   */
  readonly feedbackExtra?: ((ex: Exercise, outcome: Outcome, response: Response | null) => ReactNode) | undefined;
  /** What can score speech (Phase 9): the device's calibration, and the server when the app has one. */
  readonly speech?: SpeechServices | undefined;
  /** Debug mode: label each card with its kind (template id), to test every kind of card. */
  readonly debug?: boolean | undefined;
  /** The reading layer the learner chose before (false: none), which the app keeps (ADR 0071). */
  readonly reading?: SchemeId | false | undefined;
  /** The learner chose a reading layer, or none. */
  readonly onReadingChange?: ((scheme: SchemeId | false) => void) | undefined;
}

const Toggle = ({ selected, onChange, label, id }: { selected: boolean; onChange: (v: boolean) => void; label: string; id: string }): JSX.Element => (
  <Switch className={styles.switch} isSelected={selected} onChange={onChange} data-toggle={id}>
    <span className={styles.switchTrack} aria-hidden="true">
      <span className={styles.switchThumb} />
    </span>
    {label}
  </Switch>
);

const PlayerBody = (props: LessonPlayerProps & { readonly profile: OrthographyProfile | undefined }): JSX.Element => {
  const { course, exercises, grader, lessonId, imageUrl, language, onEvent, onExit, sound, profile, xpEarned, retries, onCantListen, onCantSpeak } = props;
  const t = useTranslator();
  const shell = usePlayer({ lesson: lessonId, exercises, grader, onEvent, sound, retries });
  const [override, setOverride] = useState(props.initialState);
  const state = override ?? shell.state;
  const dispatch = (event: Parameters<typeof shell.dispatch>[0]): void => {
    setOverride(undefined);
    shell.dispatch(event);
  };
  const [mode, setMode] = useState<WritingMode>(props.writingMode ?? "horizontal-tb");
  // Rotated Latin ruby reads badly in vertical text: off by default there, on request (§11.4).
  const readings = useReadings(profile, mode, props.reading, props.onReadingChange);
  const [vowels, setVowels] = useState(true);
  const verticalMode = profile?.layout?.vertical;
  const canVertical = verticalMode !== undefined && verticalMode !== "none" && effectiveWritingMode(profile, verticalMode, "wordbank") !== "horizontal-tb";
  const ruby = readings.shown;
  const marks = vowels ? "show" : "hide";
  const continueButton = useRef<HTMLButtonElement>(null);
  const shortcuts = useRef<Shortcuts | null>(null);
  const keys = useRef<(e: globalThis.KeyboardEvent) => void>(() => undefined);

  useEffect(() => {
    if (state.tag === "presenting") dispatch({ tag: "ready" });
    if (state.tag === "feedback") continueButton.current?.focus();
  });

  // Keyboard (§11.3, §11.7): Enter checks and continues, number keys and Backspace go to the
  // current view. A capturing window listener keeps them working when focus falls back to the
  // page, and claims Enter before a focused radio would re-select itself.
  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent): void => keys.current(e);
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, []);

  if (state.tag === "finished") {
    keys.current = () => undefined;
    return (
      <section className={styles.card} data-lesson-player="" data-state="finished">
        <h2 className={styles.instruction}>{t.format(state.summary.completed ? "player.finished.title" : "player.finished.stopped")}</h2>
        <p data-summary="">{t.format("player.finished.score", { correct: state.summary.correctFirstTry, total: state.summary.exercises })}</p>
        {xpEarned !== undefined && xpEarned > 0 && (
          <p className={styles.xp} data-xp-earned={xpEarned}>
            {t.format("player.finished.xp", { xp: xpEarned })}
          </p>
        )}
        {onExit !== undefined && (
          <Button className={styles.primary} onPress={onExit} autoFocus data-action="exit">
            {t.format("player.action.continue")}
            <ArrowForwardIcon />
          </Button>
        )}
      </section>
    );
  }

  const active = state.tag === "interrupted" ? state.resume : state;
  const ex = active.ex;
  const draft = draftOf(state) ?? emptyDraft(ex);
  const outcome = active.tag === "feedback" ? active.outcome : undefined;
  const locked = active.tag !== "answering" && active.tag !== "presenting";
  const progress = progressOf(state);
  const progressLabel = t.format("exercise.progress", { current: progress.done, total: progress.total });
  const canCheck = active.tag === "answering" && !active.composing && responseOf(ex, active.draft) !== undefined;
  const instruction = t.format(INSTRUCTIONS[ex.template], { language });
  // Every speaking card can be put off, as every listening card can: rated or scored alike.
  const speaking = SPEAKING.has(ex.template);
  const listening = LISTENING.has(ex.template);
  const pairs = ex.template === "match-pairs";

  keys.current = (e) => {
    // Never act during IME composition (§6.7), inside text fields (they handle Enter), or in the dialog.
    if (e.isComposing || e.keyCode === 229 || typingInField(e.target) || state.tag === "interrupted") return;
    const target = e.target instanceof HTMLElement ? e.target : null;
    const control = target?.closest("button, a, [role=switch]") ?? null;
    if (e.key === "Enter") {
      if (control !== null) return; // buttons and links activate themselves
      if (active.tag === "feedback") {
        e.preventDefault();
        e.stopPropagation();
        dispatch({ tag: "continue" });
      } else if (canCheck) {
        e.preventDefault();
        e.stopPropagation();
        dispatch({ tag: "submit" });
      }
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const current = shortcuts.current;
    const digit = digitIndex(e.key);
    if (digit !== undefined && current?.digit !== undefined) {
      e.preventDefault();
      current.digit(digit);
    } else if (e.key === "Backspace" && current?.backspace !== undefined) {
      e.preventDefault();
      current.backspace();
    }
  };

  return (
    <section className={styles.card} data-lesson-player="" data-template={ex.template} data-exercise={ex.id} data-state={state.tag}>
      <header className={styles.header}>
        <Button className={styles.iconButton} aria-label={t.format("exercise.action.quit")} onPress={() => dispatch({ tag: "interrupt", reason: "quit-confirm" })} data-action="quit">
          <CloseIcon />
        </Button>
        <ProgressBar className={styles.progress} value={progress.done} minValue={0} maxValue={progress.total} aria-label={progressLabel} valueLabel={progressLabel}>
          {({ percentage }) => (
            <div className={styles.track} data-progress-track="">
              <div className={styles.fill} data-progress-fill="" style={{ "--nabu-progress": `${percentage ?? 0}%` } as CSSProperties} />
            </div>
          )}
        </ProgressBar>
      </header>

      <h2 className={styles.instruction}>{instruction}</h2>
      {props.debug === true && (
        <p className={styles.muted} data-debug-template={ex.template}>
          {t.format("debug.template", { template: ex.template })}
        </p>
      )}

      {(readings.layers.length > 0 || hasMarksLayer(profile) || canVertical) && (
        <div className={styles.toggles}>
          <ReadingsControl readings={readings} />
          {hasMarksLayer(profile) && <Toggle id="marks" selected={vowels} onChange={setVowels} label={t.format("player.toggle.marks")} />}
          {canVertical && verticalMode !== undefined && (
            <Toggle
              id="vertical"
              selected={mode !== "horizontal-tb"}
              onChange={(v) => {
                setMode(v ? verticalMode : "horizontal-tb");
                readings.onVertical(v);
              }}
              label={t.format("player.toggle.vertical")}
            />
          )}
        </div>
      )}

      <ExerciseView
        key={ex.id}
        ex={ex}
        draft={draft}
        dispatch={dispatch}
        course={course}
        locked={locked}
        ruby={ruby}
        marks={marks}
        writingMode={mode}
        imageUrl={imageUrl}
        sound={sound !== false}
        outcome={outcome}
        language={language}
        shortcuts={shortcuts}
      />

      <div className={styles.feedbackSlot} role="status" aria-live="polite" data-live-region="">
        {active.tag === "feedback" && <Feedback ex={ex} outcome={active.outcome} course={course} ruby={ruby} marks={ex.template === "vocalize" ? "show" : marks} />}
      </div>
      {active.tag === "feedback" && props.feedbackExtra?.(ex, active.outcome, active.response)}

      <footer className={styles.footer}>
        {active.tag === "feedback" ? (
          <Button ref={continueButton} className={`${styles.primary} ${isCorrect(active.outcome.verdict) ? "" : styles.primaryWrong}`} onPress={() => dispatch({ tag: "continue" })} data-action="continue">
            {t.format("player.action.continue")}
            <ArrowForwardIcon />
          </Button>
        ) : (
          <>
            {speaking ? (
              <Button
                className={styles.secondary}
                onPress={() => {
                  onCantSpeak?.();
                  dispatch({ tag: "skip", reason: "cant-speak" });
                }}
                isDisabled={locked}
                data-action="cant-speak"
              >
                {t.format("player.action.cant-speak")}
              </Button>
            ) : listening ? (
              <Button
                className={styles.secondary}
                onPress={() => {
                  onCantListen?.();
                  dispatch({ tag: "skip", reason: "cant-listen" });
                }}
                isDisabled={locked}
                data-action="cant-listen"
              >
                {t.format("player.action.cant-listen")}
              </Button>
            ) : (
              <Button className={styles.secondary} onPress={() => dispatch({ tag: "skip", reason: "skip" })} isDisabled={locked} data-action="skip">
                {t.format("exercise.action.skip")}
              </Button>
            )}
            {!speaking && !pairs && (
              <Button className={styles.primary} onPress={() => dispatch({ tag: "submit" })} isDisabled={!canCheck} data-action="check">
                {t.format("exercise.action.check")}
                <ArrowForwardIcon />
              </Button>
            )}
          </>
        )}
      </footer>

      <Modal className={styles.modal} isOpen={state.tag === "interrupted"} isDismissable onOpenChange={(open) => !open && dispatch({ tag: "resume" })}>
        <Dialog className={styles.dialog} data-quit-dialog="">
          <Heading slot="title" className={styles.instruction}>
            {t.format("player.quit.title")}
          </Heading>
          <p>{t.format("player.quit.body")}</p>
          <div className={styles.footer}>
            <Button className={styles.secondary} onPress={() => dispatch({ tag: "quit" })} data-action="quit-confirm">
              {t.format("player.quit.confirm")}
            </Button>
            <Button className={styles.primary} onPress={() => dispatch({ tag: "resume" })} autoFocus data-action="resume">
              {t.format("player.quit.cancel")}
            </Button>
          </div>
        </Dialog>
      </Modal>
    </section>
  );
};

/** Plays one lesson. Provides the course's orthography profiles to <T> (fonts, marks). */
export const LessonPlayer = (props: LessonPlayerProps): JSX.Element => {
  const translator = useTranslator();
  const orthographies = useMemo(() => new Map([...props.course.profiles].map(([id, p]) => [id, p.source])), [props.course]);
  return (
    <NabuUiProvider translator={translator} orthographies={orthographies}>
      <SpeechProvider value={props.speech}>
        <PlayerBody {...props} profile={orthographies.get(props.course.orthography)} />
      </SpeechProvider>
    </NabuUiProvider>
  );
};
