/**
 * The story reader (gameplan §8.2 `story`, Phase 6): the story's lines appear one at a time as
 * a dialogue, each word glossed on tap; questions come between them. The shell is
 * useStoryPlayer(); this component renders state and turns clicks and keys into StoryEvents.
 *
 * - Lines and names are language data rendered through <T>, in the target's direction; the
 *   chrome follows the UI locale (§11.2).
 * - Tap-for-gloss runs the runtime glossary (longest match, exact and folded passes), so a
 *   vocalized كِيفَك finds its unvocalized entry; the meaning appears in a live panel, not a
 *   floating popover, so it reads the same in RTL, LTR and vertical text.
 * - Vertical reading (§11.4): where the profile allows it, the transcript turns into columns
 *   (vertical-rl); the chrome stays horizontal, and ruby is off by default there.
 */
import { draftOf, emptyDraft, isCorrect, responseOf, type AudioRef, type CourseView, type Exercise, type Grader, type LessonEvent, type Outcome, type Response } from "@nabu/core/lesson";
import { storyProgress, type StoryLine, type StoryScript, type StoryState } from "@nabu/core/story";
import type { OrthographyProfile, SchemeId } from "@nabu/schema";
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type JSX, type ReactNode } from "react";
import { Button, Dialog, Heading, Modal, ProgressBar } from "react-aria-components";
import { CourseUiProvider, useTranslator } from "../context.tsx";
import { ArrowForwardIcon, CloseIcon } from "../icons.tsx";
import { WordStatusProvider, type Marks } from "../marks.tsx";
import { chromeClass, useChrome } from "../UiRoot.tsx";
import { AudioButtons, useClipPlayer } from "../player/Audio.tsx";
import { DisplayMenu, hasDisplayChoices, useDisplay, type DisplayChoice } from "../player/Display.tsx";
import { ExerciseView, INSTRUCTIONS } from "../player/ExerciseView.tsx";
import { Feedback } from "../player/Feedback.tsx";
import { GlossPanel, useGlosses } from "../player/Gloss.tsx";
import playerStyles from "../player/Player.module.css";
import { useReadings } from "../player/Readings.tsx";
import { digitIndex, effectiveWritingMode, inDialog, typingInField, type Shortcuts, type WritingMode } from "../player/shared.ts";
import { SoundToggle } from "../player/SoundToggle.tsx";
import { T } from "../T.tsx";
import styles from "./Story.module.css";
import { useStoryPlayer } from "./useStoryPlayer.ts";

export interface StoryReaderProps {
  readonly course: CourseView;
  readonly script: StoryScript;
  readonly grader: Grader;
  /** Maps a bundle path to a URL. */
  readonly imageUrl: (path: string) => string;
  /** The course name, for instructions. */
  readonly language: string;
  readonly onEvent?: (event: LessonEvent) => void;
  readonly onExit?: () => void;
  /** Sound as the story opens (default on). Off, no line is read out and no tone sounds by itself (P6). */
  readonly sound?: boolean;
  /** The learner switched sound on or off in the story's header: the app keeps the choice. */
  readonly onSoundChange?: ((on: boolean) => void) | undefined;
  /** False while the learner is on a listening break ("Can't listen now"): nothing plays by itself then either. */
  readonly listening?: boolean | undefined;
  /** Initial writing mode for the transcript (vertical where allowed). */
  readonly writingMode?: WritingMode;
  /** XP the story earned, shown when it ends. */
  readonly xpEarned?: number | undefined;
  /** The reading layer the learner chose before (false: none), which the app keeps (ADR 0071). */
  readonly reading?: SchemeId | false | undefined;
  /** The learner chose a reading layer, or none. */
  readonly onReadingChange?: ((scheme: SchemeId | false) => void) | undefined;
  /** Vowel marks and vertical text as the learner chose them for this course (P12); else the profile's. */
  readonly display?: DisplayChoice | undefined;
  /** The learner chose vowel marks or vertical text: the app keeps the choice for the course. */
  readonly onDisplayChange?: ((choice: DisplayChoice) => void) | undefined;
  /** The words (KC ids) the learner knows (ADR 0100), for vowel marks on new words only (P12). */
  readonly known?: ReadonlySet<string> | undefined;
  /** For Storybook and tests: lines whose translation starts open, and a token whose gloss starts open. */
  readonly initial?: { readonly translations?: readonly number[]; readonly gloss?: { readonly line: number; readonly token: number } };
  /** For Storybook and tests: start from this state instead of the story's beginning. */
  readonly initialState?: StoryState;
  /** For Storybook and tests: a finished story opens read again (S15). */
  readonly rereading?: boolean | undefined;
  /** A story the learner finished before (ADR 0107): leaving it loses nothing more, and the dialog says so (D13). */
  readonly replay?: boolean | undefined;
  /** Something the app adds under each line, such as "This line is wrong" (ADR 0051). */
  readonly lineAction?: ((line: StoryLine) => ReactNode) | undefined;
  /** Something the app adds under a question's feedback, such as "My answer should be accepted". */
  readonly feedbackExtra?: ((ex: Exercise, outcome: Outcome, response: Response | null) => ReactNode) | undefined;
  /** The app bumps this to ask, as the quit button does, whether to stop reading (S3: Back mid-story). */
  readonly quitRequest?: number | undefined;
}

interface LineProps {
  readonly line: StoryLine;
  readonly ruby: SchemeId | false;
  readonly marks: Marks;
  readonly pressed: number | undefined;
  readonly onToken: (token: number) => void;
  readonly translated: boolean;
  readonly onTranslate: () => void;
  readonly latest: boolean;
  readonly action?: ReactNode;
  /** The line's clip, if it has one. */
  readonly audio: AudioRef | undefined;
  readonly url: (path: string) => string;
  /** Say the line as it appears (the newest line, with sound on). */
  readonly autoPlay: boolean;
}

const Line = ({ line, ruby, marks, pressed, onToken, translated, onTranslate, latest, action, audio, url, autoPlay }: LineProps): JSX.Element => {
  const t = useTranslator();
  const translationId = `story-line-${line.index}-translation`;
  const player = useClipPlayer(audio, url);
  // A line is read out once, when it first appears; its buttons say it again.
  const said = useRef(false);
  useEffect(() => {
    if (!autoPlay || said.current || audio === undefined) return;
    said.current = true;
    player.play();
  }, [autoPlay, audio, player]);
  return (
    <div className={styles.line} data-line={line.index} data-speaker={line.speaker?.id} data-latest={latest || undefined} data-clip={audio?.normal.path}>
      {line.speaker?.name !== undefined ? (
        <T as="div" className={styles.speaker} text={line.speaker.name} />
      ) : (
        <span className={styles.narration} aria-label={t.format("story.narration")} />
      )}
      {audio !== undefined && <AudioButtons player={player} audio={audio} label={false} />}
      <T
        as="p"
        className={styles.lineText}
        text={line.text}
        ruby={ruby}
        marks={marks}
        onTokenPress={onToken}
        pressed={pressed}
        current={player.token}
      />
      {line.translation !== undefined && (
        <>
          <Button className={styles.translate} onPress={onTranslate} aria-expanded={translated} aria-controls={translationId} data-action="translate">
            {t.format(translated ? "story.translation.hide" : "story.translation.show")}
          </Button>
          <div id={translationId} hidden={!translated}>
            {translated && <T as="p" className={styles.translation} text={line.translation} />}
          </div>
        </>
      )}
      {action}
    </div>
  );
};

const ReaderBody = (props: StoryReaderProps & { readonly profile: OrthographyProfile | undefined }): JSX.Element => {
  const { course, script, grader, imageUrl, language, onEvent, onExit, profile, xpEarned } = props;
  const t = useTranslator();
  const chrome = useChrome();
  const [sound, setSound] = useState(props.sound !== false);
  // Nothing plays by itself with sound off or while the learner can't listen (P6).
  const quiet = !sound || props.listening === false;
  const { state, dispatch } = useStoryPlayer({ script, grader, onEvent, sound: !quiet, initialState: props.initialState });
  // Vowel marks and vertical reading: the learner's choice for the course, else the profile's (P12).
  const display = useDisplay(profile, "reading", props.writingMode, props.display, props.onDisplayChange);
  const transcriptMode = effectiveWritingMode(profile, display.mode, "reading");
  // Rotated Latin ruby reads badly in vertical text: off by default there (§11.4).
  const readings = useReadings(profile, transcriptMode, props.reading, props.onReadingChange);
  // A tapped word's gloss shows its reading: the layer shown, or the only one there is (yue).
  const glossRuby = readings.shown !== false ? readings.shown : readings.layers.length === 1 ? (readings.layers[0]?.scheme ?? false) : false;
  const [translations, setTranslations] = useState<ReadonlySet<number>>(new Set(props.initial?.translations ?? []));
  const [selected, setSelected] = useState(props.initial?.gloss);
  const [confirming, setConfirming] = useState(false);
  // Leaving mid-story (S3) asks as the quit button does; not once the story is over.
  const quitAsked = useRef(props.quitRequest);
  useEffect(() => {
    if (props.quitRequest === quitAsked.current) return;
    quitAsked.current = props.quitRequest;
    if (state.tag !== "finished") setConfirming(true);
  }, [props.quitRequest]);
  // After the end, the whole story again, to read at leisure (S15): no questions, nothing recorded.
  const [rereading, setRereading] = useState(props.rereading === true);
  const rereadHeading = useRef<HTMLHeadingElement>(null);
  const ruby = readings.shown;
  const marks = display.marks;
  const continueButton = useRef<HTMLButtonElement>(null);
  // A question's instruction and prompt describe the control it focuses first (P10).
  const base = useId();
  const ids = { instruction: `${base}-instruction`, base };
  const transcript = useRef<HTMLDivElement>(null);
  const shortcuts = useRef<Shortcuts | null>(null);
  const keys = useRef<(e: globalThis.KeyboardEvent) => void>(() => undefined);

  const asking = state.tag === "asking" ? state.player : undefined;
  const active = asking === undefined || asking.tag === "finished" ? undefined : asking.tag === "interrupted" ? asking.resume : asking;

  useEffect(() => {
    if (active?.tag === "presenting") dispatch({ tag: "player", event: { tag: "ready" } });
  });
  // Continue takes the focus once a line is read or a question's feedback opens (P11), never on a
  // later render (every recorded event is one): a correction's form keeps the focus it has.
  const continueOf = state.tag === "reading" ? `line:${state.at}` : active?.tag === "feedback" ? `feedback:${active.ex.id}` : undefined;
  useEffect(() => {
    if (continueOf !== undefined) continueButton.current?.focus({ preventScroll: true });
  }, [continueOf]);

  // The newest line is the last one: the transcript scrolls to its block end (the bottom; the left
  // in vertical-rl), and again whenever the layout settles under it, since web fonts change line
  // heights after the first layout and a question opening below resizes the transcript. Scrolling
  // to the end, not "nearest", gives the same position whatever the scroll was before.
  const shownCount = state.shown.length;
  useEffect(() => {
    const box = transcript.current;
    const reveal = (): void => {
      if (box === null) return;
      const mode = getComputedStyle(box).writingMode;
      if (mode === "vertical-rl") box.scrollLeft = -box.scrollWidth;
      else if (mode === "vertical-lr") box.scrollLeft = box.scrollWidth;
      else box.scrollTop = box.scrollHeight;
    };
    reveal();
    let live = true;
    void document.fonts.ready.then(() => {
      if (live) reveal();
    });
    const resized = typeof ResizeObserver === "undefined" || box === null ? undefined : new ResizeObserver(reveal);
    if (box !== null) resized?.observe(box);
    return () => {
      live = false;
      resized?.disconnect();
    };
  }, [shownCount]);

  // Rereading starts at its heading, so the story is read from its beginning.
  useEffect(() => {
    if (rereading) rereadHeading.current?.focus();
  }, [rereading]);

  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent): void => keys.current(e);
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, []);

  const lines = state.shown.map((i) => script.lines[i]).filter((l) => l !== undefined);
  // A story line's clip is the course's audio of "<story>#<step>" (ADR 0058's audio items).
  const lineAudio = (line: StoryLine): AudioRef | undefined => course.audio[`${script.id}#${String(line.step)}`];
  const synthetic = script.lines.some((line) => lineAudio(line)?.normal.synthetic === true);
  const glossLineAt = selected === undefined ? undefined : script.lines[selected.line];
  const tapped = useMemo(() => (glossLineAt === undefined || selected === undefined ? undefined : { text: glossLineAt.text, token: selected.token }), [glossLineAt, selected]);
  const glosses = useGlosses(course, tapped);
  const progress = storyProgress(state);
  const progressLabel = t.format("exercise.progress", { current: progress.done, total: progress.total });

  /** The story's lines with their translations, buttons and glosses; `live` reads the newest out as it appears. */
  const lineViews = (list: readonly StoryLine[], live: boolean): JSX.Element[] =>
    list.map((line, k) => (
      <Line
        key={line.index}
        line={line}
        ruby={ruby}
        marks={marks}
        latest={live && k === list.length - 1}
        audio={lineAudio(line)}
        url={imageUrl}
        autoPlay={live && k === list.length - 1 && !quiet}
        pressed={selected?.line === line.index ? selected.token : undefined}
        onToken={(token) => setSelected(selected?.line === line.index && selected.token === token ? undefined : { line: line.index, token })}
        translated={translations.has(line.index)}
        action={props.lineAction?.(line)}
        onTranslate={() => {
          const next = new Set(translations);
          if (!next.delete(line.index)) next.add(line.index);
          setTranslations(next);
        }}
      />
    ));

  const glossPanel = <GlossPanel open={selected !== undefined} glosses={glosses} ruby={glossRuby} marks={marks} />;

  const headerTools = (
    <>
      {/* Readings, vowel marks, vertical reading: one button, so they take no room above the story (P12). */}
      {hasDisplayChoices(profile, readings, display) && <DisplayMenu profile={profile} readings={readings} display={display} />}
      <SoundToggle
        on={sound}
        onChange={(on) => {
          setSound(on);
          props.onSoundChange?.(on);
        }}
      />
    </>
  );

  if (state.tag === "finished") {
    keys.current = () => undefined;
    const done = state.summary.completed;
    if (done && rereading) {
      // The whole story, as it was read, to read again (S15): its translations, glosses and clips;
      // no questions, and nothing recorded (the session is over).
      return (
        <section className={`${playerStyles.card} ${styles.reader}`} data-story-reader="" data-story={script.id} data-state="rereading">
          <header className={playerStyles.header}>
            <Button className={playerStyles.iconButton} aria-label={t.format("story.reread.close")} onPress={() => setRereading(false)} data-action="close-reread">
              <CloseIcon />
            </Button>
            <span className={playerStyles.progress} />
            {headerTools}
          </header>
          <h2 ref={rereadHeading} tabIndex={-1} className={playerStyles.instruction} data-reread-heading="">
            {script.title === undefined ? t.format("story.reread.title") : <T text={script.title} />}
          </h2>
          {synthetic && (
            <p className={playerStyles.synthetic} data-story-synthetic="">
              {t.format("player.audio.synthetic")}
            </p>
          )}
          <div className={`${styles.transcript} ${styles.whole}`} role="region" aria-label={t.format("story.reread.label")} data-story-transcript="" data-writing-mode={transcriptMode} data-ink-container="transcript">
            {lineViews(script.lines, false)}
          </div>
          {glossPanel}
          <footer className={playerStyles.footer}>
            {onExit !== undefined ? (
              <Button className={playerStyles.primary} onPress={onExit} data-action="exit">
                {t.format("player.action.continue")}
                <ArrowForwardIcon />
              </Button>
            ) : (
              <Button className={playerStyles.primary} onPress={() => setRereading(false)} data-action="close-reread">
                {t.format("story.reread.done")}
              </Button>
            )}
          </footer>
        </section>
      );
    }
    return (
      <section className={playerStyles.card} data-story-reader="" data-story={script.id} data-state="finished">
        <h2 className={playerStyles.instruction}>{t.format(done ? "story.finished.title" : "story.finished.stopped")}</h2>
        {state.summary.exercises > 0 && <p data-summary="">{t.format("player.finished.score", { correct: state.summary.correctFirstTry, total: state.summary.exercises })}</p>}
        {xpEarned !== undefined && xpEarned > 0 && (
          <p className={playerStyles.xp} data-xp-earned={xpEarned}>
            {t.format("player.finished.xp", { xp: xpEarned })}
          </p>
        )}
        <footer className={playerStyles.footer}>
          {done && (
            <Button className={playerStyles.secondary} onPress={() => setRereading(true)} data-action="reread">
              {t.format("story.reread.action")}
            </Button>
          )}
          {onExit !== undefined && (
            <Button className={playerStyles.primary} onPress={onExit} autoFocus data-action="exit">
              {t.format("player.action.continue")}
              <ArrowForwardIcon />
            </Button>
          )}
        </footer>
      </section>
    );
  }

  const ex = active?.ex;
  const draft = asking === undefined || ex === undefined ? undefined : (draftOf(asking) ?? emptyDraft(ex));
  const locked = active === undefined || (active.tag !== "answering" && active.tag !== "presenting");
  const canCheck = active?.tag === "answering" && !active.composing && responseOf(active.ex, active.draft) !== undefined;
  const feedback = active?.tag === "feedback" ? active : undefined;
  const forward = (): void => {
    if (state.tag === "reading") dispatch({ tag: "continue" });
    else if (feedback !== undefined) dispatch({ tag: "player", event: { tag: "continue" } });
    else if (canCheck) dispatch({ tag: "player", event: { tag: "submit" } });
  };

  keys.current = (e) => {
    // Never during IME composition, in a text field, or in a dialog (a correction's form, P11): its keys are its own.
    if (confirming || e.isComposing || e.keyCode === 229 || typingInField(e.target) || inDialog(e.target)) return;
    const control = e.target instanceof HTMLElement ? e.target.closest("button, a, [role=switch]") : null;
    if (e.key === "Enter") {
      if (control !== null && control !== continueButton.current) return;
      if (state.tag === "reading" || feedback !== undefined || canCheck) {
        e.preventDefault();
        e.stopPropagation();
        forward();
      }
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey || state.tag !== "asking") return;
    const digit = digitIndex(e.key);
    if (digit !== undefined && shortcuts.current?.digit !== undefined) {
      e.preventDefault();
      shortcuts.current.digit(digit);
    } else if (e.key === "Backspace" && shortcuts.current?.backspace !== undefined) {
      e.preventDefault();
      shortcuts.current.backspace();
    }
  };

  return (
    <section className={`${playerStyles.card} ${styles.reader}`} data-story-reader="" data-story={script.id} data-state={state.tag} data-template={ex?.template} data-exercise={ex?.id}>
      <header className={playerStyles.header}>
        <Button className={playerStyles.iconButton} aria-label={t.format("story.action.quit")} onPress={() => setConfirming(true)} data-action="quit">
          <CloseIcon />
        </Button>
        <ProgressBar className={playerStyles.progress} value={progress.done} minValue={0} maxValue={progress.total} aria-label={progressLabel} valueLabel={progressLabel}>
          {({ percentage }) => (
            <div className={playerStyles.track} data-progress-track="">
              <div className={playerStyles.fill} data-progress-fill="" style={{ "--nabu-progress": `${percentage ?? 0}%` } as CSSProperties} />
            </div>
          )}
        </ProgressBar>
        {headerTools}
      </header>

      {script.title !== undefined && <T as="div" className={playerStyles.instruction} text={script.title} />}

      {synthetic && (
        <p className={playerStyles.synthetic} data-story-synthetic="">
          {t.format("player.audio.synthetic")}
        </p>
      )}

      <div
        ref={transcript}
        className={styles.transcript}
        role="log"
        aria-label={t.format("story.transcript.label")}
        data-story-transcript=""
        data-writing-mode={transcriptMode}
        data-ink-container="transcript"
      >
        {lineViews(lines, true)}
      </div>

      {glossPanel}

      {asking !== undefined && ex !== undefined && draft !== undefined && (
        <div className={styles.question} data-story-question="" data-state={active?.tag}>
          <h2 className={playerStyles.instruction} id={ids.instruction}>
            {t.format(INSTRUCTIONS[ex.template], { language })}
          </h2>
          <ExerciseView
            key={ex.id}
            ex={ex}
            draft={draft}
            dispatch={(event) => dispatch({ tag: "player", event })}
            course={course}
            locked={locked}
            ruby={ruby}
            marks={marks}
            writingMode="horizontal-tb"
            imageUrl={imageUrl}
            sound={!quiet}
            outcome={feedback?.outcome}
            language={language}
            shortcuts={shortcuts}
            ids={ids}
          />
          <div className={playerStyles.feedbackSlot} role="status" aria-live="polite" data-live-region="">
            {feedback !== undefined && <Feedback ex={feedback.ex} outcome={feedback.outcome} course={course} ruby={ruby} marks={marks === "hide" ? "hide" : "show"} />}
          </div>
          {feedback !== undefined && props.feedbackExtra?.(feedback.ex, feedback.outcome, feedback.response)}
        </div>
      )}

      <footer className={playerStyles.footer}>
        {state.tag === "reading" || feedback !== undefined ? (
          <Button
            ref={continueButton}
            className={`${playerStyles.primary} ${feedback !== undefined && !isCorrect(feedback.outcome.verdict) ? playerStyles.primaryWrong : ""}`}
            onPress={forward}
            data-action="continue"
          >
            {t.format("player.action.continue")}
            <ArrowForwardIcon />
          </Button>
        ) : (
          <Button className={playerStyles.primary} onPress={forward} isDisabled={!canCheck} data-action="check">
            {t.format("exercise.action.check")}
            <ArrowForwardIcon />
          </Button>
        )}
      </footer>

      {/* In the chrome's lang, dir and font (it is portalled out of the app's root); it says what leaving keeps (P8). */}
      <Modal className={playerStyles.modal} isOpen={confirming} isDismissable onOpenChange={setConfirming}>
        <Dialog className={`${playerStyles.dialog} ${chromeClass}`} style={chrome.style} data-quit-dialog="">
          <div className={playerStyles.dialogBody} lang={chrome.lang} dir={chrome.dir}>
            <Heading slot="title" className={playerStyles.instruction}>
              {t.format("story.quit.title")}
            </Heading>
            <p data-quit-kept="" data-replay={props.replay === true || undefined}>
              {t.format(props.replay === true ? "story.quit.kept.replay" : "story.quit.kept")}
            </p>
            <div className={playerStyles.footer}>
              <Button
                className={playerStyles.secondary}
                onPress={() => {
                  setConfirming(false);
                  dispatch({ tag: "quit" });
                  onExit?.();
                }}
                data-action="quit-confirm"
              >
                {t.format("story.quit.confirm")}
              </Button>
              <Button className={playerStyles.primary} onPress={() => setConfirming(false)} autoFocus data-action="resume">
                {t.format("story.quit.cancel")}
              </Button>
            </div>
          </div>
        </Dialog>
      </Modal>
    </section>
  );
};

/** Reads one story. Provides the course's orthography profiles, and its target ones, to <T>. */
export const StoryReader = (props: StoryReaderProps): JSX.Element => {
  return (
    <CourseUiProvider course={props.course}>
      <WordStatusProvider course={props.course} known={props.known}>
        <ReaderBody {...props} profile={props.course.profiles.get(props.course.orthography)?.source} />
      </WordStatusProvider>
    </CourseUiProvider>
  );
};
