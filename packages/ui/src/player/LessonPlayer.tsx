/**
 * The lesson player (gameplan §11.5): header (quit, progress, the display menu and
 * sound), the current exercise's view, feedback and the footer. The shell is
 * usePlayer(); this component only renders state and turns clicks and keys
 * into PlayerEvents.
 *
 * Three language contexts (§11.2): the chrome follows the UI locale, prompts and
 * answers follow their own TaggedText, and answer regions take the target
 * script's direction, never the UI's.
 */
import { allKcs, cameBack, draftOf, emptyDraft, isCorrect, LISTENING, progressOf, responseOf, SPEAKING, TEMPLATES, type AdaptiveTest, type CourseView, type Effect, type Exercise, type Grader, type LessonEvent, type Outcome, type PlayerState, type Response, type SessionSummary } from "@nabu/core/lesson";
import type { OrthographyProfile, SchemeId } from "@nabu/schema";
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type JSX, type ReactNode } from "react";
import { Button, Dialog, Heading, Modal, ProgressBar } from "react-aria-components";
import type { MessageId } from "@nabu/i18n";
import { CourseUiProvider, useTranslator } from "../context.tsx";
import { ArrowForwardIcon, CloseIcon } from "../icons.tsx";
import { WordStatusProvider } from "../marks.tsx";
import { chromeClass, useChrome } from "../UiRoot.tsx";
import { DisplayMenu, hasDisplayChoices, useDisplay, type DisplayChoice } from "./Display.tsx";
import { Feedback } from "./Feedback.tsx";
import { GlossPanel, useGlosses, type WordTap } from "./Gloss.tsx";
import { lookupIsHint, withHint } from "./hints.ts";
import { NewWordsAnswered, NewWordsTag, newOnCard } from "./NewWords.tsx";
import styles from "./Player.module.css";
import { useReadings } from "./Readings.tsx";
import { digitIndex, focusInReach, inDialog, typingInField, useActionsInReach, type Shortcuts, type WritingMode } from "./shared.ts";
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
  /** What kind of session this is, for what quitting it says (P8): a lesson (default), practice or the placement test. */
  readonly mode?: SessionKind | undefined;
  /**
   * A lesson the learner finished before (ADR 0107: a replay pays its answers only): quitting it
   * loses nothing more, and its dialog says so (D13).
   */
  readonly replay?: boolean | undefined;
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
  /**
   * Vowel marks and vertical text as the learner chose them for this course (P12), which the app
   * keeps; where they have not chosen, the profile's defaults.
   */
  readonly display?: DisplayChoice | undefined;
  /** The learner chose vowel marks or vertical text: the app keeps the choice for the course. */
  readonly onDisplayChange?: ((choice: DisplayChoice) => void) | undefined;
  /**
   * The words (KC ids) the learner knows (ADR 0100), for vowel marks on new words only (P12).
   * Without it every word counts as new.
   */
  readonly known?: ReadonlySet<string> | undefined;
  /** For Storybook and tests: the display menu starts open. */
  readonly displayOpen?: boolean | undefined;
}

/** A session's kind, as the app plans it. */
export type SessionKind = "lesson" | "review" | "mistakes" | "placement";

/** The end of a session, by kind (S15): a review or a placement test is no lesson. */
const FINISHED: Readonly<Record<SessionKind, MessageId>> = {
  lesson: "player.finished.title",
  review: "player.finished.title.review",
  mistakes: "player.finished.title.mistakes",
  placement: "player.finished.title.placement",
};

/**
 * What quitting a session asks, and says it keeps, by kind (P8). A placement test says what the app
 * gives it to say (`quitCopy`, S5: stopping part-way places by the answers so far); without that, as
 * practice does.
 */
const QUIT: Readonly<Record<SessionKind, { readonly title: MessageId; readonly kept: MessageId }>> = {
  lesson: { title: "player.quit.title", kept: "player.quit.kept" },
  review: { title: "player.quit.title.practice", kept: "player.quit.kept.practice" },
  mistakes: { title: "player.quit.title.practice", kept: "player.quit.kept.practice" },
  placement: { title: "player.quit.title.practice", kept: "player.quit.kept.practice" },
};

const PlayerBody = (props: LessonPlayerProps & { readonly profile: OrthographyProfile | undefined }): JSX.Element => {
  const { course, exercises, grader, lessonId, imageUrl, language, onEvent, onExit, profile, xpEarned, retries, adaptive, onCantListen, onCantSpeak } = props;
  const t = useTranslator();
  const chrome = useChrome();
  const kind = props.mode ?? "lesson";
  // What quitting says: a lesson done before loses nothing by it (D13).
  const quit = props.replay === true && kind === "lesson" ? { title: QUIT.lesson.title, kept: "player.quit.kept.replay" as const } : QUIT[kind];
  const [sound, setSound] = useState(props.sound !== false);
  // Listening or speaking put off in this lesson ("Can't listen now"): said once it happens (P13).
  const [putOff, setPutOff] = useState<{ readonly listening: boolean; readonly speaking: boolean }>({ listening: false, speaking: false });
  // Nothing plays by itself with sound off, or while the learner can't listen (P6): no tones, no clips.
  const quiet = !sound || putOff.listening || props.listening === false;
  // The cards whose meanings were looked up before their answer was checked (D16): their answers are hinted.
  const hinted = useRef(new Set<string>());
  const report = onEvent === undefined ? undefined : (event: LessonEvent): void => onEvent(withHint(event, hinted.current));
  const shell = usePlayer({ lesson: lessonId, exercises, grader, onEvent: report, sound: !quiet, retries, adaptive, resumed: props.resumed });
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
  // Vowel marks and vertical text: the learner's choice for the course, else the profile's (P12).
  const display = useDisplay(profile, "wordbank", props.writingMode, props.display, props.onDisplayChange);
  const mode = display.mode;
  // Rotated Latin ruby reads badly in vertical text: off by default there, on request (§11.4).
  const readings = useReadings(profile, mode, props.reading, props.onReadingChange);
  const ruby = readings.shown;
  const marks = display.marks;
  const continueButton = useRef<HTMLButtonElement>(null);
  const checkButton = useRef<HTMLButtonElement>(null);
  // The card's instruction and prompt describe the control it focuses first (P10).
  const base = useId();
  const ids = { instruction: `${base}-instruction`, base };
  const footer = useRef<HTMLElement>(null);
  const card = useRef<HTMLElement>(null);
  useActionsInReach(card, footer, state.tag === "finished" ? "" : (state.tag === "interrupted" ? state.resume : state).ex.id);
  const shortcuts = useRef<Shortcuts | null>(null);
  const keys = useRef<(e: globalThis.KeyboardEvent) => void>(() => undefined);
  // Tap-for-gloss (P1): the word tapped on the card now (a new card starts with none) and its meaning.
  const shown = state.tag === "finished" ? undefined : (state.tag === "interrupted" ? state.resume : state).ex.id;
  const [tap, setTap] = useState<{ readonly card: string; readonly word: WordTap } | undefined>(undefined);
  const tapped = tap !== undefined && tap.card === shown ? tap.word : undefined;
  const glosses = useGlosses(course, tapped);
  // A tapped word's gloss shows its reading: the layer shown, or the only one there is (yue).
  const glossRuby = readings.shown !== false ? readings.shown : readings.layers.length === 1 ? (readings.layers[0]?.scheme ?? false) : false;
  // The words this lesson introduces (P1): the card that first presents one says so.
  const introduces = useMemo(() => new Set<string>(course.units.flatMap((u) => u.nodes).find((n) => n.id === lessonId)?.introduces ?? []), [course, lessonId]);
  const kinds = useMemo(() => new Map(allKcs(course).map((k) => [k.id as string, k.kind])), [course]);

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
            <h2 className={styles.instruction}>{t.format(state.summary.completed ? FINISHED[kind] : "player.finished.stopped")}</h2>
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
  // The lesson's new words this card shows first (P1): none came on a card before it.
  const fresh = newOnCard(ex, state.session.queue.slice(0, state.session.position), introduces, kinds);
  const glossing = {
    tapped,
    onTap: (word: WordTap): void => {
      const closing = tapped !== undefined && tapped.key === word.key && tapped.token === word.token;
      // Opening a meaning before the answer is checked is a hint (D16); after it, it is learning.
      if (!closing && lookupIsHint(state)) hinted.current.add(ex.id);
      setTap(closing ? undefined : { card: ex.id, word });
    },
  };
  // Check takes a press while a keyboard still composes the last word (ADR 0118): the submit then
  // waits for compositionend. Enter never checks mid-composition: an IME's Enter commits its text.
  const canCheck = active.tag === "answering" && responseOf(ex, active.draft) !== undefined;
  const enterChecks = canCheck && active.tag === "answering" && !active.composing;
  const check = (): void => {
    dispatch({ tag: "submit" });
    // Focus on Check ends the composition, as a tap anywhere else does; a press that left focus in the
    // field (an assistive technology's) would otherwise wait until the learner commits the word.
    if (active.tag === "answering" && active.composing) focusInReach(checkButton.current, footer.current);
  };
  const instruction = t.format(INSTRUCTIONS[ex.template], { language });
  // Every speaking card can be put off, as every listening card can: rated or scored alike.
  const speaking = SPEAKING.has(ex.template);
  const listening = LISTENING.has(ex.template);
  const pairs = TEMPLATES[ex.template].modality.input === "pairs";

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
      } else if (enterChecks) {
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
        {/* Readings, vowel marks, vertical text: one button, so they take no room above the card (P12). */}
        {hasDisplayChoices(profile, readings, display) && <DisplayMenu profile={profile} readings={readings} display={display} defaultOpen={props.displayOpen === true} />}
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
      {(ex.review === true || back !== undefined || fresh.length > 0) && (
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
          {/* A first look at the lesson's new words (P1): never more than the card gives away. */}
          <NewWordsTag course={course} template={ex.template} kcs={fresh} ruby={ruby} marks={marks} />
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
        glossing={glossing}
      />

      {/* What a tapped word means (P1): quiet until a word is tapped. */}
      <GlossPanel open={tapped !== undefined} glosses={glosses} ruby={glossRuby} marks={marks} quiet />

      <div className={styles.feedbackSlot} role="status" aria-live="polite" data-live-region="">
        {/* The solution shows its marks unless the learner hid them (a vocalize card's always: they are its answer). */}
        {active.tag === "feedback" && <Feedback ex={ex} outcome={active.outcome} course={course} ruby={ruby} marks={ex.template === "vocalize" || marks !== "hide" ? "show" : "hide"} />}
      </div>
      {active.tag === "feedback" && <NewWordsAnswered course={course} template={ex.template} kcs={fresh} ruby={ruby} marks={marks} />}
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
              <Button ref={checkButton} className={styles.primary} onPress={check} isDisabled={!canCheck} data-action="check">
                {t.format("exercise.action.check")}
                <ArrowForwardIcon />
              </Button>
            )}
          </>
        )}
      </footer>

      {/*
        The dialog is portalled out of the app's root, so it takes the chrome's lang, dir and font itself
        (P8). It says what quitting keeps: every answer, with its XP, its mistakes and its scheduling;
        only finishing (and its bonus) waits. Quitting goes straight back to the path, unless the end
        screen has more to say (a placement test's result).
      */}
      <Modal className={styles.modal} isOpen={state.tag === "interrupted"} isDismissable onOpenChange={(open) => !open && dispatch({ tag: "resume" })}>
        <Dialog className={`${styles.dialog} ${chromeClass}`} style={chrome.style} data-quit-dialog="" data-mode={kind}>
          <div className={styles.dialogBody} lang={chrome.lang} dir={chrome.dir}>
            <Heading slot="title" className={styles.instruction}>
              {props.quitCopy?.title ?? t.format(quit.title)}
            </Heading>
            <p data-quit-kept="" data-replay={props.replay === true || undefined}>
              {props.quitCopy?.body ?? t.format(quit.kept)}
            </p>
            <div className={styles.footer}>
              <Button
                className={styles.secondary}
                onPress={() => {
                  dispatch({ tag: "quit" });
                  // Straight back, unless the end screen has more to say (a placement test's result, S5).
                  if (props.summary === undefined) onExit?.();
                }}
                data-action="quit-confirm"
              >
                {props.quitCopy?.confirm ?? t.format("player.quit.confirm")}
              </Button>
              <Button className={styles.primary} onPress={() => dispatch({ tag: "resume" })} autoFocus data-action="resume">
                {props.quitCopy?.cancel ?? t.format("player.quit.cancel")}
              </Button>
            </div>
          </div>
        </Dialog>
      </Modal>
    </section>
  );
};

/** Plays one lesson. Provides the course's orthography profiles, and its target ones, to <T>. */
export const LessonPlayer = (props: LessonPlayerProps): JSX.Element => (
  <CourseUiProvider course={props.course}>
    <WordStatusProvider course={props.course} known={props.known}>
      <SpeechProvider value={props.speech}>
        <PlayerBody {...props} profile={props.course.profiles.get(props.course.orthography)?.source} />
      </SpeechProvider>
    </WordStatusProvider>
  </CourseUiProvider>
);
