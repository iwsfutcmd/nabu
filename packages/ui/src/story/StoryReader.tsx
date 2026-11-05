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
import { courseGlossary, glossAt, glossLine, storyProgress, type StoryLine, type StoryScript, type StoryState } from "@nabu/core/story";
import type { OrthographyProfile, SchemeId } from "@nabu/schema";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type JSX, type ReactNode } from "react";
import { Button, Dialog, Heading, Modal, ProgressBar, Switch } from "react-aria-components";
import { NabuUiProvider, useTranslator } from "../context.tsx";
import { ArrowForwardIcon, CloseIcon } from "../icons.tsx";
import { AudioButtons, useClipPlayer } from "../player/Audio.tsx";
import { ExerciseView, INSTRUCTIONS } from "../player/ExerciseView.tsx";
import { Feedback } from "../player/Feedback.tsx";
import playerStyles from "../player/Player.module.css";
import { digitIndex, effectiveWritingMode, hasMarksLayer, rubySchemeOf, typingInField, type Shortcuts, type WritingMode } from "../player/shared.ts";
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
  readonly sound?: boolean;
  /** Initial writing mode for the transcript (vertical where allowed). */
  readonly writingMode?: WritingMode;
  /** XP the story earned, shown when it ends. */
  readonly xpEarned?: number | undefined;
  /** For Storybook and tests: lines whose translation starts open, and a token whose gloss starts open. */
  readonly initial?: { readonly translations?: readonly number[]; readonly gloss?: { readonly line: number; readonly token: number } };
  /** For Storybook and tests: start from this state instead of the story's beginning. */
  readonly initialState?: StoryState;
  /** Something the app adds under each line, such as "This line is wrong" (ADR 0051). */
  readonly lineAction?: ((line: StoryLine) => ReactNode) | undefined;
  /** Something the app adds under a question's feedback, such as "My answer should be accepted". */
  readonly feedbackExtra?: ((ex: Exercise, outcome: Outcome, response: Response | null) => ReactNode) | undefined;
}

const Toggle = ({ selected, onChange, label, id }: { selected: boolean; onChange: (v: boolean) => void; label: string; id: string }): JSX.Element => (
  <Switch className={playerStyles.switch} isSelected={selected} onChange={onChange} data-toggle={id}>
    <span className={playerStyles.switchTrack} aria-hidden="true">
      <span className={playerStyles.switchThumb} />
    </span>
    {label}
  </Switch>
);

interface LineProps {
  readonly line: StoryLine;
  readonly ruby: SchemeId | false;
  readonly marks: "show" | "hide";
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
        {...(player.token === undefined ? {} : { highlight: [player.token] })}
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
  const { course, script, grader, imageUrl, language, onEvent, onExit, sound, profile, xpEarned } = props;
  const t = useTranslator();
  const { state, dispatch } = useStoryPlayer({ script, grader, onEvent, sound, initialState: props.initialState });
  const glossary = useMemo(() => courseGlossary(course), [course]);
  const scheme = rubySchemeOf(profile);
  const verticalMode = profile?.layout?.vertical;
  const canVertical = verticalMode !== undefined && verticalMode !== "none" && effectiveWritingMode(profile, verticalMode, "reading") !== "horizontal-tb";
  const [mode, setMode] = useState<WritingMode>(props.writingMode ?? "horizontal-tb");
  const transcriptMode = effectiveWritingMode(profile, mode, "reading");
  // Rotated Latin ruby reads badly in vertical text: off by default there (§11.4).
  const [readings, setReadings] = useState(transcriptMode === "horizontal-tb");
  const [vowels, setVowels] = useState(true);
  const [translations, setTranslations] = useState<ReadonlySet<number>>(new Set(props.initial?.translations ?? []));
  const [selected, setSelected] = useState(props.initial?.gloss);
  const [confirming, setConfirming] = useState(false);
  const ruby = scheme !== undefined && readings ? scheme : false;
  const marks = vowels ? "show" : "hide";
  const continueButton = useRef<HTMLButtonElement>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const shortcuts = useRef<Shortcuts | null>(null);
  const keys = useRef<(e: globalThis.KeyboardEvent) => void>(() => undefined);

  const asking = state.tag === "asking" ? state.player : undefined;
  const active = asking === undefined || asking.tag === "finished" ? undefined : asking.tag === "interrupted" ? asking.resume : asking;

  useEffect(() => {
    if (active?.tag === "presenting") dispatch({ tag: "player", event: { tag: "ready" } });
    if (state.tag === "reading" || active?.tag === "feedback") continueButton.current?.focus({ preventScroll: true });
  });

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
  const glosses = useMemo(
    () => (glossLineAt === undefined || selected === undefined ? [] : glossAt(course, glossary, glossLine(course, glossary, glossLineAt.text), glossLineAt.text, selected.token)),
    [course, glossary, glossLineAt, selected],
  );
  const progress = storyProgress(state);
  const progressLabel = t.format("exercise.progress", { current: progress.done, total: progress.total });

  if (state.tag === "finished") {
    keys.current = () => undefined;
    return (
      <section className={playerStyles.card} data-story-reader="" data-story={script.id} data-state="finished">
        <h2 className={playerStyles.instruction}>{t.format(state.summary.completed ? "story.finished.title" : "story.finished.stopped")}</h2>
        {state.summary.exercises > 0 && <p data-summary="">{t.format("player.finished.score", { correct: state.summary.correctFirstTry, total: state.summary.exercises })}</p>}
        {xpEarned !== undefined && xpEarned > 0 && (
          <p className={playerStyles.xp} data-xp-earned={xpEarned}>
            {t.format("player.finished.xp", { xp: xpEarned })}
          </p>
        )}
        {onExit !== undefined && (
          <Button className={playerStyles.primary} onPress={onExit} autoFocus data-action="exit">
            {t.format("player.action.continue")}
            <ArrowForwardIcon />
          </Button>
        )}
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
    if (confirming || e.isComposing || e.keyCode === 229 || typingInField(e.target)) return;
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
        <Button className={playerStyles.iconButton} aria-label={t.format("exercise.action.quit")} onPress={() => setConfirming(true)} data-action="quit">
          <CloseIcon />
        </Button>
        <ProgressBar className={playerStyles.progress} value={progress.done} minValue={0} maxValue={progress.total} aria-label={progressLabel} valueLabel={progressLabel}>
          {({ percentage }) => (
            <div className={playerStyles.track} data-progress-track="">
              <div className={playerStyles.fill} data-progress-fill="" style={{ "--nabu-progress": `${percentage ?? 0}%` } as CSSProperties} />
            </div>
          )}
        </ProgressBar>
      </header>

      {script.title !== undefined && <T as="div" className={playerStyles.instruction} text={script.title} />}

      {synthetic && (
        <p className={playerStyles.synthetic} data-story-synthetic="">
          {t.format("player.audio.synthetic")}
        </p>
      )}

      {(scheme !== undefined || hasMarksLayer(profile) || canVertical) && (
        <div className={playerStyles.toggles}>
          {scheme !== undefined && <Toggle id="readings" selected={readings} onChange={setReadings} label={t.format("exercise.readings.toggle")} />}
          {hasMarksLayer(profile) && <Toggle id="marks" selected={vowels} onChange={setVowels} label={t.format("player.toggle.marks")} />}
          {canVertical && verticalMode !== undefined && (
            <Toggle
              id="vertical"
              selected={mode !== "horizontal-tb"}
              onChange={(v) => {
                setMode(v ? verticalMode : "horizontal-tb");
                setReadings(!v);
              }}
              label={t.format("player.toggle.vertical")}
            />
          )}
        </div>
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
        {lines.map((line, k) => (
          <Line
            key={line.index}
            line={line}
            ruby={ruby}
            marks={marks}
            latest={k === lines.length - 1}
            audio={lineAudio(line)}
            url={imageUrl}
            autoPlay={k === lines.length - 1 && sound !== false}
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
        ))}
      </div>

      <div className={styles.gloss} role="status" aria-live="polite" aria-label={t.format("story.gloss.label")} data-gloss-panel="" data-gloss-open={selected === undefined ? undefined : ""}>
        {selected === undefined ? (
          <p className={styles.glossHint}>{t.format("story.gloss.hint")}</p>
        ) : glosses.length === 0 ? (
          <p className={styles.glossHint}>{t.format("story.gloss.none")}</p>
        ) : (
          <dl className={styles.glossList}>
            {glosses.map((g, i) => (
              <div key={i} className={styles.glossEntry} data-gloss-kc={g.kc}>
                <dt>
                  <T text={g.form} ruby={scheme ?? false} marks={marks} />
                </dt>
                <dd>
                  {g.meaning !== undefined && <T text={g.meaning} />}
                  {g.span !== "whole" && <span className={styles.glossNote}>{t.format(g.span === "part" ? "story.gloss.part" : "story.gloss.phrase")}</span>}
                  {g.lemma !== undefined && (
                    <span className={styles.glossNote} data-gloss-lemma="">
                      {t.format("story.gloss.lemma")} <T text={g.lemma} ruby={scheme ?? false} marks={marks} />
                    </span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      {asking !== undefined && ex !== undefined && draft !== undefined && (
        <div className={styles.question} data-story-question="" data-state={active?.tag}>
          <h2 className={playerStyles.instruction}>{t.format(INSTRUCTIONS[ex.template], { language })}</h2>
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
            sound={sound !== false}
            outcome={feedback?.outcome}
            language={language}
            shortcuts={shortcuts}
          />
          <div className={playerStyles.feedbackSlot} role="status" aria-live="polite" data-live-region="">
            {feedback !== undefined && <Feedback ex={feedback.ex} outcome={feedback.outcome} course={course} ruby={ruby} marks={marks} />}
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

      <Modal className={playerStyles.modal} isOpen={confirming} isDismissable onOpenChange={setConfirming}>
        <Dialog className={playerStyles.dialog} data-quit-dialog="">
          <Heading slot="title" className={playerStyles.instruction}>
            {t.format("player.quit.title")}
          </Heading>
          <p>{t.format("player.quit.body")}</p>
          <div className={playerStyles.footer}>
            <Button
              className={playerStyles.secondary}
              onPress={() => {
                setConfirming(false);
                dispatch({ tag: "quit" });
              }}
              data-action="quit-confirm"
            >
              {t.format("player.quit.confirm")}
            </Button>
            <Button className={playerStyles.primary} onPress={() => setConfirming(false)} autoFocus data-action="resume">
              {t.format("player.quit.cancel")}
            </Button>
          </div>
        </Dialog>
      </Modal>
    </section>
  );
};

/** Reads one story. Provides the course's orthography profiles to <T> (fonts, marks). */
export const StoryReader = (props: StoryReaderProps): JSX.Element => {
  const translator = useTranslator();
  const orthographies = useMemo(() => new Map([...props.course.profiles].map(([id, p]) => [id, p.source])), [props.course]);
  return (
    <NabuUiProvider translator={translator} orthographies={orthographies}>
      <ReaderBody {...props} profile={orthographies.get(props.course.orthography)} />
    </NabuUiProvider>
  );
};
