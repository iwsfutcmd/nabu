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
import { cameBack, draftOf, emptyDraft, isCorrect, LISTENING, progressOf, responseOf, SPEAKING, type AdaptiveTest, type CourseView, type Effect, type Exercise, type Grader, type LessonEvent, type Outcome, type PlayerState, type Response, type SessionSummary } from "@nabu/core/lesson";
import type { OrthographyProfile, SchemeId } from "@nabu/schema";
import { useEffect, useId, useRef, useState, type CSSProperties, type JSX, type ReactNode } from "react";
import { Button, Dialog, Heading, Modal, ProgressBar, Switch } from "react-aria-components";
import { CourseUiProvider, useTranslator } from "../context.tsx";
import { ArrowForwardIcon, CloseIcon } from "../icons.tsx";
import { Feedback } from "./Feedback.tsx";
import styles from "./Player.module.css";
import { ReadingsControl, useReadings } from "./Readings.tsx";
import { digitIndex, effectiveWritingMode, focusInReach, hasMarksLayer, inDialog, typingInField, useActionsInReach, type Shortcuts, type WritingMode } from "./shared.ts";
import { SoundToggle } from "./SoundToggle.tsx";
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
  /**
   * Sound as the lesson opens (the learner's choice on this device; default on). Off, nothing plays by
   * itself: no feedback tones, no clip said on its own. The play buttons still work (P6).
   */
  readonly sound?: boolean;
  /** The learner switched sound on or off in the lesson's header: the app keeps the choice. */
  readonly onSoundChange?: ((on: boolean) => void) | undefined;
  /**
   * False while the learner is on a listening break ("Can't listen now" in an earlier session): no clip
   * plays by itself then either, as after "Can't listen now" in this lesson (P6).
   */
  readonly listening?: boolean | undefined;
  /** Initial writing mode for target prompts and word banks (vertical where allowed). */
  readonly writingMode?: WritingMode;
  /** For stories and tests: start from this state instead of the lesson's first exercise. */
  readonly initialState?: PlayerState;
  /** XP this session earned so far, shown when it ends (the app computes it from the event log). */
  readonly xpEarned?: number | undefined;
  /** Missed exercises come back at the end (default); off for a placement test. */
  readonly retries?: boolean | undefined;
  /** An adaptive test (the placement test, ADR 0077): what comes next depends on the answers. */
  readonly adaptive?: AdaptiveTest | undefined;
  /**
   * The learner pressed "Can't listen now": the app leaves listening out of the sessions of the next
   * hour. With it, the player says so when it happens (P13); without it, only this lesson drops them.
   */
  readonly onCantListen?: (() => void) | undefined;
  /** The learner pressed "Can't speak now": the app leaves speaking out of the next hour's sessions. */
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
  /** A session picked up again after a reload (core `resume`, S3): where it stands, and what reopens it. */
  readonly resumed?: readonly [PlayerState, readonly Effect[]] | undefined;
  /**
   * The app bumps this to ask, as the quit button does, whether to quit (S3: Back, or the phone's
   * back button, in the middle of a lesson). Ignored once the lesson is over.
   */
  readonly quitRequest?: number | undefined;
  /** What the quit dialog says, where quitting means something else (stopping a placement test, S5). */
  readonly quitCopy?: { readonly title: string; readonly body: string; readonly confirm: string; readonly cancel: string } | undefined;
  /** What the end screen says above its XP and Continue, in place of the score (a placement test's result, S5). */
  readonly summary?: ((summary: SessionSummary) => ReactNode) | undefined;
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
  const { course, exercises, grader, lessonId, imageUrl, language, onEvent, onExit, profile, xpEarned, retries, adaptive, onCantListen, onCantSpeak } = props;
  const t = useTranslator();
  const [sound, setSound] = useState(props.sound !== false);
  // Listening or speaking put off in this lesson ("Can't listen now"): said once it happens (P13).
  const [putOff, setPutOff] = useState<{ readonly listening: boolean; readonly speaking: boolean }>({ listening: false, speaking: false });
  // Nothing plays by itself with sound off, or while the learner can't listen (P6): no tones, no clips.
  const quiet = !sound || putOff.listening || props.listening === false;
  const shell = usePlayer({ lesson: lessonId, exercises, grader, onEvent, sound: !quiet, retries, adaptive, resumed: props.resumed });
  const [override, setOverride] = useState(props.initialState);
  const state = override ?? shell.state;
  const dispatch = (event: Parameters<typeof shell.dispatch>[0]): void => {
    setOverride(undefined);
    shell.dispatch(event);
  };
  // Leaving mid-lesson (S3) asks as the quit button does; the state machine ignores it once finished.
  const quitAsked = useRef(props.quitRequest);
  useEffect(() => {
    if (props.quitRequest === quitAsked.current) return;
    quitAsked.current = props.quitRequest;
    dispatch({ tag: "interrupt", reason: "quit-confirm" });
  }, [props.quitRequest]);
  const [mode, setMode] = useState<WritingMode>(props.writingMode ?? "horizontal-tb");
  // Rotated Latin ruby reads badly in vertical text: off by default there, on request (§11.4).
  const readings = useReadings(profile, mode, props.reading, props.onReadingChange);
  const [vowels, setVowels] = useState(true);
  const verticalMode = profile?.layout?.vertical;
  const canVertical = verticalMode !== undefined && verticalMode !== "none" && effectiveWritingMode(profile, verticalMode, "wordbank") !== "horizontal-tb";
  const ruby = readings.shown;
  const marks = vowels ? "show" : "hide";
  const continueButton = useRef<HTMLButtonElement>(null);
  // The card's instruction and prompt describe the control it focuses first (P10).
  const base = useId();
  const ids = { instruction: `${base}-instruction`, base };
  const footer = useRef<HTMLElement>(null);
  const card = useRef<HTMLElement>(null);
  useActionsInReach(card, footer, state.tag === "finished" ? "" : (state.tag === "interrupted" ? state.resume : state).ex.id);
  const shortcuts = useRef<Shortcuts | null>(null);
  const keys = useRef<(e: globalThis.KeyboardEvent) => void>(() => undefined);

  useEffect(() => {
    if (state.tag === "presenting") dispatch({ tag: "ready" });
  });
  // Continue takes the focus once, as the feedback opens (P11): never again on a later render, which
  // every recorded event causes, so focus stays where the learner put it (a correction's form).
  const feedbackOf = state.tag === "feedback" ? state.ex.id : undefined;
  useEffect(() => {
    if (feedbackOf !== undefined) focusInReach(continueButton.current, footer.current);
  }, [feedbackOf]);

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
        {props.summary !== undefined ? (
          props.summary(state.summary)
        ) : (
          <>
            <h2 className={styles.instruction}>{t.format(state.summary.completed ? "player.finished.title" : "player.finished.stopped")}</h2>
            <p data-summary="">{t.format("player.finished.score", { correct: state.summary.correctFirstTry, total: state.summary.exercises })}</p>
          </>
        )}
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
  // Cards done for good out of the lesson's cards: a miss never moves the bar back (P4).
  const progress = progressOf(state);
  const left = progress.total - progress.done;
  // An adaptive test knows only the most it may still ask, so it says no count.
  const counted = state.session.adaptive === undefined;
  // Why this card is back: an earlier mistake, or a skip (P4).
  const back = cameBack(state.session, ex);
  const canCheck = active.tag === "answering" && !active.composing && responseOf(ex, active.draft) !== undefined;
  const instruction = t.format(INSTRUCTIONS[ex.template], { language });
  // Every speaking card can be put off, as every listening card can: rated or scored alike.
  const speaking = SPEAKING.has(ex.template);
  const listening = LISTENING.has(ex.template);
  const pairs = ex.template === "match-pairs" || ex.template === "letter-pairs";

  keys.current = (e) => {
    // Never act during IME composition (§6.7), inside text fields (they handle Enter), or in a dialog:
    // the quit dialog, a correction's form, a menu (P11). Their keys are theirs.
    if (e.isComposing || e.keyCode === 229 || typingInField(e.target) || inDialog(e.target) || state.tag === "interrupted") return;
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
    <section ref={card} className={styles.card} data-lesson-player="" data-template={ex.template} data-exercise={ex.id} data-state={state.tag}>
      <header className={styles.header}>
        <Button className={styles.iconButton} aria-label={t.format("exercise.action.quit")} onPress={() => dispatch({ tag: "interrupt", reason: "quit-confirm" })} data-action="quit">
          <CloseIcon />
        </Button>
        <ProgressBar
          className={styles.progress}
          value={progress.done}
          minValue={0}
          maxValue={progress.total}
          aria-label={t.format("player.progress.label")}
          valueLabel={t.format("player.progress.value", { done: progress.done, total: progress.total })}
        >
          {({ percentage }) => (
            <div className={styles.track} data-progress-track="">
              <div className={styles.fill} data-progress-fill="" style={{ "--nabu-progress": `${percentage ?? 0}%` } as CSSProperties} />
            </div>
          )}
        </ProgressBar>
        {/* How many cards remain, in sight (the bar's value says it to a screen reader). */}
        {counted && (
          <span className={styles.left} aria-hidden="true" data-cards-left={left}>
            {t.format("player.progress.left", { count: left })}
          </span>
        )}
        <SoundToggle
          on={sound}
          onChange={(on) => {
            setSound(on);
            props.onSoundChange?.(on);
          }}
        />
      </header>

      {/* "Can't listen now" and "Can't speak now" say what they did, for as long as the lesson lasts (P13). */}
      <div className={styles.notices} role="status" data-put-off={[putOff.listening ? "listening" : "", putOff.speaking ? "speaking" : ""].join(" ").trim() || undefined}>
        {putOff.listening && onCantListen !== undefined && <p className={styles.notice}>{t.format("player.put-off.listening")}</p>}
        {putOff.speaking && onCantSpeak !== undefined && <p className={styles.notice}>{t.format("player.put-off.speaking")}</p>}
      </div>

      {/*
        Said before the instruction: earlier material brought back because it is due (ADR 0097), and a
        card of this lesson back after a mistake or a skip (P4).
      */}
      {(ex.review === true || back !== undefined) && (
        <div className={styles.tags}>
          {ex.review === true && (
            <p className={styles.reviewTag} data-review-tag="">
              {t.format("player.review.tag")}
            </p>
          )}
          {back !== undefined && (
            <p className={styles.reviewTag} data-retry-tag={back}>
              {t.format(back === "skipped" ? "player.retry.skipped" : "player.retry.missed")}
            </p>
          )}
        </div>
      )}
      <h2 className={styles.instruction} id={ids.instruction}>
        {instruction}
      </h2>
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
        sound={!quiet}
        outcome={outcome}
        language={language}
        shortcuts={shortcuts}
        ids={ids}
      />

      <div className={styles.feedbackSlot} role="status" aria-live="polite" data-live-region="">
        {active.tag === "feedback" && <Feedback ex={ex} outcome={active.outcome} course={course} ruby={ruby} marks={ex.template === "vocalize" ? "show" : marks} />}
      </div>
      {active.tag === "feedback" && props.feedbackExtra?.(ex, active.outcome, active.response)}

      {/*
        Putting off listening or speaking is its own, quieter action, apart from Skip (P13): a listening
        card can be skipped like any other without losing an hour of listening.
      */}
      {active.tag !== "feedback" && (speaking || listening) && (
        <p className={styles.putOff}>
          <Button
            className={styles.textButton}
            onPress={() => {
              if (speaking) onCantSpeak?.();
              else onCantListen?.();
              setPutOff((p) => (speaking ? { ...p, speaking: true } : { ...p, listening: true }));
              dispatch({ tag: "skip", reason: speaking ? "cant-speak" : "cant-listen" });
            }}
            isDisabled={locked}
            data-action={speaking ? "cant-speak" : "cant-listen"}
          >
            {t.format(speaking ? "player.action.cant-speak" : "player.action.cant-listen")}
          </Button>
        </p>
      )}

      <footer ref={footer} className={styles.footer}>
        {active.tag === "feedback" ? (
          <Button ref={continueButton} className={`${styles.primary} ${isCorrect(active.outcome.verdict) || active.outcome.selfRated === true ? "" : styles.primaryWrong}`} onPress={() => dispatch({ tag: "continue" })} data-action="continue">
            {t.format("player.action.continue")}
            <ArrowForwardIcon />
          </Button>
        ) : (
          <>
            {/* A speaking card is rated, never skipped: "Couldn't say it" is its honest skip. */}
            {!speaking && (
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
            {props.quitCopy?.title ?? t.format("player.quit.title")}
          </Heading>
          <p>{props.quitCopy?.body ?? t.format("player.quit.body")}</p>
          <div className={styles.footer}>
            <Button className={styles.secondary} onPress={() => dispatch({ tag: "quit" })} data-action="quit-confirm">
              {props.quitCopy?.confirm ?? t.format("player.quit.confirm")}
            </Button>
            <Button className={styles.primary} onPress={() => dispatch({ tag: "resume" })} autoFocus data-action="resume">
              {props.quitCopy?.cancel ?? t.format("player.quit.cancel")}
            </Button>
          </div>
        </Dialog>
      </Modal>
    </section>
  );
};

/** Plays one lesson. Provides the course's orthography profiles, and its target ones, to <T>. */
export const LessonPlayer = (props: LessonPlayerProps): JSX.Element => (
  <CourseUiProvider course={props.course}>
    <SpeechProvider value={props.speech}>
      <PlayerBody {...props} profile={props.course.profiles.get(props.course.orthography)?.source} />
    </SpeechProvider>
  </CourseUiProvider>
);
