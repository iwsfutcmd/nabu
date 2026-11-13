/**
 * The end of a session (P9 in the 2026-11 review, ADR 0113): what it taught and what to go over come
 * before the points, then how the learner's progress moved, and where to go next. The lesson player
 * and the story reader both end with it.
 *
 * - The title says what ended; the score counts first tries, as the session's summary does.
 * - New words: the words the lesson taught, each with its meaning and its clip behind a play button.
 *   Nothing plays by itself, whatever the sound setting (P6, D18).
 * - Missed the first time: each card the score counts wrong, with what it asked, the right answer, and
 *   the learner's answer with the parts that differ marked, as its feedback marked them (where the
 *   session still has the answer: a session picked up after a reload has only typed ones): a gap
 *   where it left something out, and the right answer's words it left out or got wrong (P3). The
 *   app may add its AI help under each (an explanation asked for in the feedback, kept, M10).
 * - Accepted on a second check: answers a language model accepted, said to be a model's (M10).
 * - Your progress: what the app works out from the log (words now known, a unit finished, the streak,
 *   the week's practice days, quests done, achievements), then the XP.
 * - Where a deployment's gate keeps the next lesson closed (M5): that it does, and until when.
 * - Next: what the course page's Continue offers (ADR 0105): the next lesson or story, or practice
 *   first with a new lesson beside it (D6); right after practice, the next lesson or story with more
 *   practice beside it (D34); and back to the course.
 *
 * Focus goes to the next step without scrolling to it, and the screen starts at its title: a screen
 * reader hears the title and the score with the button (its description), and a stray Enter does
 * what Continue did before.
 */
import { allKcs, answerDiff, answerTextOf, gradeExercise, nearMiss, promptOf, solutionMarks, solutionOf, type AnswerDiff, type CourseView, type Exercise, type Grader, type Missed, type Response, type SessionSummary } from "@nabu/core/lesson";
import { textOfSurface } from "@nabu/core/text";
import type { SchemeId, TaggedText } from "@nabu/schema";
import { useEffect, useId, useMemo, useRef, type JSX, type ReactNode } from "react";
import { Button } from "react-aria-components";
import { useTranslator } from "../context.tsx";
import { ArrowForwardIcon } from "../icons.tsx";
import type { Marks } from "../marks.tsx";
import { T } from "../T.tsx";
import { AudioButtons, useClipPlayer } from "./Audio.tsx";
import { MarkedAnswer } from "./Feedback.tsx";
import styles from "./Player.module.css";

/** Where the next step goes: a lesson (its number on the path), the unit's story, or practice first. */
export type NextTo = { readonly kind: "lesson"; readonly number: number } | { readonly kind: "story" } | { readonly kind: "practice" };

/**
 * The next step, as the course page's Continue has it (ADR 0105), or the next lesson right after
 * practice (D34); the app works it out and goes there.
 */
export interface NextStep {
  readonly to: NextTo;
  readonly go: () => void;
  /** With practice first: why (the words slipping). */
  readonly why?: string | undefined;
  /**
   * The other way on, offered beside it: the next lesson where practice comes first (always on
   * offer, D6), or more practice where the next lesson comes first right after practice (D34).
   */
  readonly beside?: { readonly to: NextTo; readonly go: () => void } | undefined;
}

/** A quest or achievement the session completed, as the app names it. */
export interface Earned {
  readonly id: string;
  readonly label: string;
}

/**
 * How the session moved the learner's progress, as the app works it out from the log: the learner
 * model and the game state with the session against without it (ADR 0113).
 */
export interface SessionProgress {
  /** Words the session made known (ADR 0100), in course order, and how many are known in all now. */
  readonly known?: { readonly words: readonly string[]; readonly total: number } | undefined;
  /** A unit the session finished: its number on the path and its title. */
  readonly unit?: { readonly number: number; readonly title: TaggedText | undefined } | undefined;
  /** The streak, where the session made today a practice day: its length now. */
  readonly streak?: number | undefined;
  /** The week's practice days, where the session added one: so far, of the learner's goal; met just now. */
  readonly week?: { readonly done: number; readonly goal: number; readonly met: boolean } | undefined;
  readonly quests?: readonly Earned[] | undefined;
  readonly achievements?: readonly Earned[] | undefined;
  /**
   * Lessons and stories may not start now (a deployment's gate, M5): what the gate says (that it is
   * empty, when a lesson may start again, whether practice refills it), and that time.
   */
  readonly gate?: { readonly text: string; readonly opensAt?: string | undefined } | undefined;
}

export interface SessionEndProps {
  readonly course: CourseView;
  readonly grader: Grader;
  /** Maps a bundle path (a clip) to a URL. */
  readonly imageUrl: (path: string) => string;
  /** What ended: "Lesson complete!", "Review complete!", "Story complete!"… */
  readonly title: string;
  readonly summary: SessionSummary;
  /** Said in place of the title and the score (a placement test's result, S5). */
  readonly result?: ReactNode;
  /** The words the session taught (KC ids), in the order it showed them. */
  readonly words: readonly string[];
  readonly missed: readonly Missed[];
  /**
   * More under each card missed the first time (M10): the app's AI help for it, such as the
   * explanation asked for in its feedback, kept. The end screen only places it.
   */
  readonly missedExtra?: ((missed: Missed) => ReactNode) | undefined;
  /**
   * Answers a language model accepted on a second check (M10), with what they asked and the
   * learner's answer: listed and said to be a model's, also where it answered after Continue.
   */
  readonly accepted?: readonly Missed[] | undefined;
  readonly progress?: SessionProgress | undefined;
  /** XP the session earned, as the game counts it. */
  readonly xp?: number | undefined;
  readonly next?: NextStep | undefined;
  readonly onExit?: (() => void) | undefined;
  /** Actions before the next step in the footer: a story's Read again. */
  readonly actions?: ReactNode;
  /** The reading layer and vowel marks the session showed. */
  readonly ruby: SchemeId | false;
  readonly marks: Marks;
}

interface Word {
  readonly kc: string;
  readonly form: TaggedText;
  readonly gloss: TaggedText | undefined;
}

/** The course's words by KC id: their first form in the orthography being learned, and their meaning. */
const useWords = (course: CourseView, kcs: readonly string[]): readonly Word[] => {
  const byId = useMemo(() => new Map(allKcs(course).map((k) => [k.id as string, k])), [course]);
  return kcs.flatMap((kc) => {
    const k = byId.get(kc);
    const form = k?.forms?.[course.orthography]?.[0];
    return form === undefined ? [] : [{ kc, form, gloss: k?.gloss?.[course.supportKey] }];
  });
};

/** A new word: itself, its meaning, and its clip behind a play button (never played by itself). */
const NewWord = ({ course, word, url, ruby, marks }: { readonly course: CourseView; readonly word: Word; readonly url: (path: string) => string; readonly ruby: SchemeId | false; readonly marks: Marks }): JSX.Element => {
  const audio = course.audio[word.kc];
  const player = useClipPlayer(audio, url);
  return (
    <li className={styles.endWord} data-end-word={word.kc} data-ink-container={`word:${word.kc}`}>
      <T text={word.form} ruby={ruby} marks={marks} className={styles.endWordForm} />
      {word.gloss !== undefined && <T text={word.gloss} className={styles.newWordGloss} />}
      {audio !== undefined && <AudioButtons player={player} audio={audio} label={false} />}
    </li>
  );
};

/** An answer as text with nothing marked: a choice, or one no alignment explains. */
const unmarked = (text: TaggedText): AnswerDiff => ({ text, marked: [], missing: 0, gaps: [] });

/**
 * The learner's answer to a missed card as text, the parts that differ marked and a gap where it left
 * something out, and the words of the right answer it left out or got wrong, as its feedback marked
 * them (P3); undefined where the session does not have the answer.
 */
const yoursOf = (course: CourseView, grader: Grader, ex: Exercise, response: Response | undefined): { readonly answer: AnswerDiff; readonly solutionMarked: readonly number[] } | undefined => {
  if (response === undefined) return undefined;
  if (response.tag === "choice") {
    if (!("options" in ex)) return undefined;
    const option: TaggedText | { readonly text: TaggedText } | undefined = ex.options[response.index];
    if (option === undefined) return undefined;
    return { answer: unmarked("tokens" in option ? option : option.text), solutionMarked: [] };
  }
  if (response.tag !== "text" && response.tag !== "tiles") return undefined;
  const outcome = gradeExercise(ex, response, grader);
  const profile = course.profiles.get(ex.orthography);
  const joiner = profile?.unitKind === "grapheme" ? "" : " ";
  const { alignment, solution } = outcome;
  if (solution !== undefined && alignment !== undefined && alignment.length > 0) {
    const near = outcome.closestIsSolution === true && profile !== undefined && nearMiss(alignment);
    return { answer: answerDiff(alignment, solution, joiner), solutionMarked: near ? solutionMarks(alignment, solution, profile) : [] };
  }
  const raw = answerTextOf(ex, response);
  const base = solution ?? solutionOf(ex);
  return raw === undefined || base === undefined ? undefined : { answer: unmarked(textOfSurface(base, raw)), solutionMarked: [] };
};

interface MissedCardProps {
  readonly course: CourseView;
  readonly grader: Grader;
  readonly missed: Missed;
  readonly ruby: SchemeId | false;
  readonly marks: Marks;
  /** What the app adds under it (M10). */
  readonly extra?: ReactNode;
}

/** One card missed the first time (or accepted on a second check): what it asked, the right answer, and the learner's. */
const MissedCard = ({ course, grader, missed, ruby, marks, extra }: MissedCardProps): JSX.Element => {
  const t = useTranslator();
  const { ex, response } = missed;
  const prompt = promptOf(ex);
  const solution = solutionOf(ex);
  const yours = useMemo(() => yoursOf(course, grader, ex, response), [course, grader, ex, response]);
  const answer = yours?.answer;
  return (
    <li className={styles.missedCard} data-missed={ex.id} data-verdict={missed.verdict} data-ink-container={`missed:${ex.id}`}>
      {prompt !== undefined && <T as="p" text={prompt} ruby={ruby} marks={marks} className={styles.missedPrompt} />}
      {solution !== undefined && (
        <div className={styles.solution} data-solution="">
          <span className={styles.label}>{t.format("player.feedback.solution")}</span>
          {/* Its marks, unless the learner hid them (a vocalize card's always: they are its answer), as the feedback showed it. */}
          <T as="p" text={solution} ruby={ruby} marks={ex.template === "vocalize" || marks !== "hide" ? "show" : "hide"} highlight={yours?.solutionMarked ?? []} />
        </div>
      )}
      {missed.verdict === "SKIPPED" ? (
        <p className={styles.muted}>{t.format("player.end.missed.skipped")}</p>
      ) : (
        answer !== undefined && (
          <div className={styles.solution} data-your-answer="">
            <span className={styles.label}>{t.format("player.feedback.your-answer")}</span>
            <MarkedAnswer diff={answer} />
            {(answer.marked.length > 0 || answer.gaps.length > 0) && <span className={styles.muted}>{t.format("player.feedback.marked")}</span>}
          </div>
        )
      )}
      {extra}
    </li>
  );
};

const nextLabel = (t: ReturnType<typeof useTranslator>, to: NextTo): string =>
  to.kind === "lesson" ? t.format("player.end.next.lesson", { number: to.number }) : to.kind === "story" ? t.format("player.end.next.story") : t.format("player.end.next.practice");

const dataOf = (to: NextTo): string => (to.kind === "lesson" ? `lesson ${String(to.number)}` : to.kind);

export const SessionEnd = (props: SessionEndProps): JSX.Element => {
  const { course, grader, imageUrl, summary, words: kcs, missed, progress, xp, next, onExit, ruby, marks } = props;
  const accepted = props.accepted ?? [];
  const t = useTranslator();
  const base = useId();
  const ids = { title: `${base}-title`, score: `${base}-score`, words: `${base}-words`, missed: `${base}-missed`, accepted: `${base}-accepted`, progress: `${base}-progress` };
  const words = useWords(course, kcs);
  const known = useWords(course, progress?.known?.words ?? []);
  const heading = useRef<HTMLDivElement>(null);
  const primary = useRef<HTMLButtonElement>(null);
  const synthetic = words.some((w) => course.audio[w.kc]?.normal.synthetic === true);
  const scored = props.result === undefined && summary.exercises > 0;

  // The next step takes the focus (described by the title and the score), and the screen shows its
  // title: what ended is read first (P9). A next step the app works out a moment later takes it from
  // Continue, unless the learner has put the focus somewhere else already.
  const primaryKind = next === undefined ? "exit" : "next";
  useEffect(() => {
    const active = document.activeElement;
    const footer = primary.current?.closest("footer");
    if (active !== null && active !== document.body && footer?.contains(active) !== true) return;
    primary.current?.focus({ preventScroll: true });
  }, [primaryKind]);
  useEffect(() => {
    heading.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, []);

  const quests = progress?.quests ?? [];
  const achievements = progress?.achievements ?? [];
  const moved =
    progress?.known !== undefined || progress?.unit !== undefined || progress?.streak !== undefined || progress?.week !== undefined || quests.length > 0 || achievements.length > 0 || (xp !== undefined && xp > 0);
  const describedBy = props.result === undefined ? [ids.title, ...(scored ? [ids.score] : [])].join(" ") : ids.title;

  return (
    <>
      <div ref={heading} className={styles.endHead} id={props.result === undefined ? undefined : ids.title}>
        {props.result ?? (
          <>
            <h2 className={styles.instruction} id={ids.title}>
              {props.title}
            </h2>
            {scored && (
              <p id={ids.score} data-summary="">
                {t.format("player.finished.score", { correct: summary.correctFirstTry, total: summary.exercises })}
              </p>
            )}
          </>
        )}
      </div>

      {words.length > 0 && (
        <section className={styles.endSection} aria-labelledby={ids.words} data-end-words={words.length}>
          <h3 className={styles.endHeading} id={ids.words}>
            {t.format("player.end.words.title")}
          </h3>
          <ul className={styles.endList}>
            {words.map((w) => (
              <NewWord key={w.kc} course={course} word={w} url={imageUrl} ruby={ruby} marks={marks} />
            ))}
          </ul>
          {synthetic && <p className={styles.synthetic}>{t.format("player.audio.synthetic")}</p>}
        </section>
      )}

      {missed.length > 0 && (
        <section className={styles.endSection} aria-labelledby={ids.missed} data-end-missed={missed.length}>
          <h3 className={styles.endHeading} id={ids.missed}>
            {t.format("player.end.missed.title")}
          </h3>
          <ul className={styles.endList}>
            {missed.map((m) => (
              <MissedCard key={m.ex.id} course={course} grader={grader} missed={m} ruby={ruby} marks={marks} extra={props.missedExtra?.(m)} />
            ))}
          </ul>
        </section>
      )}

      {/* A model's second check is said to be one (M10), though it may have come after Continue. */}
      {accepted.length > 0 && (
        <section className={styles.endSection} aria-labelledby={ids.accepted} data-end-accepted={accepted.length}>
          <h3 className={styles.endHeading} id={ids.accepted}>
            {t.format("player.end.accepted.title")}
          </h3>
          <p className={styles.muted} data-ai-notice="">
            {t.format("player.end.accepted.note", { count: accepted.length })}
          </p>
          <ul className={styles.endList}>
            {accepted.map((m) => (
              <MissedCard key={m.ex.id} course={course} grader={grader} missed={m} ruby={ruby} marks={marks} />
            ))}
          </ul>
        </section>
      )}

      {moved && (
        <section className={styles.endSection} aria-labelledby={ids.progress} data-end-progress="">
          <h3 className={styles.endHeading} id={ids.progress}>
            {t.format("player.end.progress.title")}
          </h3>
          <ul className={styles.endProgress}>
            {progress?.known !== undefined && known.length > 0 && (
              <li data-known-now={known.length} data-known-total={progress.known.total}>
                <span>{t.format("player.end.known", { count: known.length })}</span>
                <span className={styles.endKnown} data-ink-container="known">
                  {known.map((w) => (
                    <T key={w.kc} text={w.form} ruby={ruby} marks={marks} />
                  ))}
                </span>
                <span className={styles.muted}>{t.format("player.end.known.total", { total: progress.known.total })}</span>
              </li>
            )}
            {progress?.unit !== undefined && (
              <li data-unit-finished={progress.unit.number}>
                <span>{t.format("player.end.unit", { number: progress.unit.number })}</span>
                {progress.unit.title !== undefined && <T text={progress.unit.title} className={styles.muted} />}
              </li>
            )}
            {progress?.streak !== undefined && <li data-streak-now={progress.streak}>{t.format("player.end.streak", { days: progress.streak })}</li>}
            {progress?.week !== undefined && (
              <li data-week-days={progress.week.done} data-goal={progress.week.goal}>
                <span>{t.format("game.goal.week", { done: progress.week.done, goal: progress.week.goal })}</span>
                {progress.week.met && <span className={styles.muted}>{t.format("game.goal.met")}</span>}
              </li>
            )}
            {quests.map((q) => (
              <li key={q.id} data-quest-done={q.id}>
                {t.format("player.end.quest", { quest: q.label })}
              </li>
            ))}
            {achievements.map((a) => (
              <li key={a.id} data-achievement-new={a.id}>
                {t.format("player.end.achievement", { achievement: a.label })}
              </li>
            ))}
            {xp !== undefined && xp > 0 && (
              <li className={styles.xp} data-xp-earned={xp}>
                {t.format("player.finished.xp", { xp })}
              </li>
            )}
          </ul>
        </section>
      )}

      {/* The next lesson needs practice or time first (M5): said before the next step, which is practice then. */}
      {progress?.gate !== undefined && (
        <p className={styles.notice} role="note" data-end-gate="" data-gate-opens={progress.gate.opensAt}>
          {progress.gate.text}
        </p>
      )}
      {next?.why !== undefined && (
        <p className={styles.muted} data-end-why="">
          {next.why}
        </p>
      )}
      {next?.beside !== undefined && (
        <p className={styles.putOff}>
          {next.beside.to.kind === "practice" ? (
            <Button className={styles.textButton} onPress={next.beside.go} data-action="more-practice" data-next={dataOf(next.beside.to)}>
              {t.format("player.end.next.more-practice")}
            </Button>
          ) : (
            <Button className={styles.textButton} onPress={next.beside.go} data-action="next-anyway" data-next={dataOf(next.beside.to)}>
              {t.format("player.end.next.anyway")}
            </Button>
          )}
        </p>
      )}
      <footer className={`${styles.footer} ${styles.endFooter}`}>
        {props.actions}
        {onExit !== undefined &&
          (next === undefined ? (
            <Button ref={primary} className={styles.primary} onPress={onExit} aria-describedby={describedBy} data-action="exit">
              {t.format("player.action.continue")}
              <ArrowForwardIcon />
            </Button>
          ) : (
            <Button className={styles.secondary} onPress={onExit} data-action="exit">
              {t.format("player.end.back")}
            </Button>
          ))}
        {next !== undefined && (
          <Button ref={primary} className={styles.primary} onPress={next.go} aria-describedby={describedBy} data-action="next" data-next={dataOf(next.to)}>
            {nextLabel(t, next.to)}
            <ArrowForwardIcon />
          </Button>
        )}
      </footer>
    </>
  );
};
