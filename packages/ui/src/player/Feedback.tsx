/**
 * Feedback for one answer (gameplan §8.6, §11.6, §11.7): an icon and a headline
 * per verdict category, the profile's notes, the solution, and for typed or
 * tiled answers the learner's answer with the differing parts marked. It is a
 * live region, and never relies on colour alone.
 */
import { answerDiff, closestAnswer, isCorrect, type CourseView, type Exercise, type Outcome } from "@nabu/core/lesson";
import type { Verdict } from "@nabu/core";
import type { MessageId } from "@nabu/i18n";
import type { SchemeId } from "@nabu/schema";
import type { JSX } from "react";
import { useTranslator } from "../context.tsx";
import { CorrectIcon, WrongIcon } from "../icons.tsx";
import { T } from "../T.tsx";
import styles from "./Player.module.css";

const HEADLINES: Readonly<Record<Verdict, MessageId>> = {
  CORRECT: "feedback.verdict.correct",
  CORRECT_ALT: "feedback.verdict.correct-alt",
  CORRECT_MARKS: "feedback.verdict.correct-marks",
  CORRECT_VARIANT: "feedback.verdict.correct-variant",
  CORRECT_WITH_TYPO: "feedback.verdict.correct-with-typo",
  CORRECT_PROVISIONAL: "feedback.verdict.correct-provisional",
  PARTIAL: "feedback.verdict.partial",
  WRONG_WORD: "feedback.verdict.wrong-word",
  WRONG: "feedback.verdict.wrong",
  SKIPPED: "feedback.verdict.skipped",
};

export interface FeedbackProps {
  readonly ex: Exercise;
  readonly outcome: Outcome;
  readonly course: CourseView;
  readonly ruby: SchemeId | false;
  readonly marks: "show" | "hide";
}

export const Feedback = ({ ex, outcome, course, ruby, marks }: FeedbackProps): JSX.Element => {
  const t = useTranslator();
  const right = isCorrect(outcome.verdict);
  const notes = outcome.notes.map((id) => `feedback.note.${id}`).filter((id): id is MessageId => t.has(id));
  const showSolution = outcome.solution !== undefined && outcome.verdict !== "CORRECT";
  const solutionLabel = right ? undefined : t.format("player.feedback.solution");
  const unitKind = course.profiles.get(ex.orthography)?.unitKind;
  const joiner = unitKind === "grapheme" ? "" : " ";
  const diff =
    outcome.verdict !== "CORRECT" && outcome.alignment !== undefined && outcome.solution !== undefined && outcome.alignment.length > 0
      ? answerDiff(outcome.alignment, outcome.solution, joiner)
      : undefined;
  // A wrong answer nearer another accepted wording than the solution: that wording first, what the
  // learner left out or got wrong marked, then the solution (with its readings).
  const closest =
    !right && outcome.closestIsSolution === false && outcome.alignment !== undefined && outcome.solution !== undefined && outcome.alignment.length > 0
      ? closestAnswer(outcome.alignment, outcome.solution, joiner)
      : undefined;
  return (
    <div className={styles.feedback} data-feedback="" data-verdict={outcome.verdict} data-right={right || undefined}>
      <p className={styles.feedbackHeadline}>
        <span className={right ? styles.correctIcon : styles.wrongIcon}>{right ? <CorrectIcon /> : <WrongIcon />}</span>
        {t.format(outcome.verdict === "PARTIAL" && (ex.template === "speak" || ex.template === "listen-speak") ? "feedback.verdict.speech-close" : HEADLINES[outcome.verdict])}
      </p>
      {notes.length > 0 && (
        <ul className={styles.notes}>
          {notes.map((id) => (
            <li key={id} data-note={id.slice("feedback.note.".length)}>
              {t.format(id)}
            </li>
          ))}
        </ul>
      )}
      {showSolution && outcome.solution !== undefined && (
        <div className={styles.solution} data-solution="" data-ink-container="solution">
          {solutionLabel !== undefined && <span className={styles.label}>{solutionLabel}</span>}
          {closest !== undefined && (
            <div data-closest="">
              <T as="p" text={closest.text} highlight={closest.marked} marks={marks} />
            </div>
          )}
          <T as="p" text={outcome.solution} ruby={ruby} marks={marks} />
        </div>
      )}
      {diff !== undefined && diff.marked.length > 0 && (
        <div className={styles.solution} data-answer-diff="">
          <span className={styles.label}>{t.format("player.feedback.your-answer")}</span>
          <T as="p" text={diff.text} highlight={diff.marked} />
          <span className={styles.muted}>{t.format("player.feedback.marked")}</span>
        </div>
      )}
    </div>
  );
};
