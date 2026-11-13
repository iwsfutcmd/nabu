/**
 * Feedback for one answer (gameplan §8.6, §11.6, §11.7): an icon and a headline
 * per verdict category, the profile's notes, the solution, and for typed or
 * tiled answers the learner's answer with the differing parts marked. It is a
 * live region, and never relies on colour alone.
 */
import { answerDiff, closestAnswer, isCorrect, nearMiss, type CourseView, type Exercise, type Outcome } from "@nabu/core/lesson";
import type { Verdict } from "@nabu/core";
import { textOfSurface } from "@nabu/core/text";
import type { MessageId } from "@nabu/i18n";
import type { SchemeId, TaggedText } from "@nabu/schema";
import { Fragment, type JSX } from "react";
import { useTranslator } from "../context.tsx";
import { CorrectIcon, WrongIcon } from "../icons.tsx";
import { T } from "../T.tsx";
import styles from "./Player.module.css";

/** Marks where a word goes in a message: a private-use character no message holds. */
const SLOT = "";

/**
 * A message with words of the answer's language in it (cómo and como): each word through <T>, with
 * its own lang, dir and fonts, the rest as the UI's text. The words reach the message as
 * placeholders, so a translation puts them where its grammar wants them.
 */
const WithWords = ({ id, words }: { readonly id: MessageId; readonly words: Readonly<Record<string, TaggedText>> }): JSX.Element => {
  const t = useTranslator();
  const names = Object.keys(words);
  const slot = (i: number): string => `${SLOT}${i}${SLOT}`;
  const parts = t.formatToParts(id, Object.fromEntries(names.map((name, i) => [name, slot(i)])));
  return (
    <>
      {parts.map((part, i) => {
        // <T> isolates its word itself.
        if (part.type === "bidiIsolation") return null;
        const value = "value" in part && typeof part.value === "string" ? part.value : "";
        const name = names.find((_, k) => slot(k) === value);
        const word = name === undefined ? undefined : words[name];
        return word === undefined ? <Fragment key={i}>{value}</Fragment> : <T key={i} text={word} />;
      })}
    </>
  );
};

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
  // A self-rating checked nothing (P5): neither right nor wrong, and no solution to compare with.
  const neutral = outcome.selfRated === true;
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
  // A near miss of another accepted wording than the solution: after the solution (with its
  // readings), that wording as the nearest correct version, what the learner left out or got wrong
  // marked. An answer far from every wording gets the solution alone.
  const closest =
    !right && outcome.closestIsSolution === false && outcome.alignment !== undefined && outcome.solution !== undefined && nearMiss(outcome.alignment)
      ? closestAnswer(outcome.alignment, outcome.solution, joiner)
      : undefined;
  // A note a unit of the answer raised names the words it is about where the catalog has a message
  // for them (feedback.note.<id>-pair): cómo and como, not a canned example (W4). One item a pair.
  const pairsOf = (note: string): readonly (readonly [string, string])[] => {
    const seen = new Set<string>();
    return (outcome.alignment ?? []).flatMap((op) => {
      if (op.op === "insert" || op.op === "delete" || op.note !== note || op.expected === op.actual) return [];
      const key = `${op.expected}\u0000${op.actual}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [[op.expected, op.actual] as const];
    });
  };
  const base = outcome.solution;
  return (
    <div className={styles.feedback} data-feedback="" data-verdict={neutral ? "SELF_RATED" : outcome.verdict} data-right={(right && !neutral) || undefined}>
      <p className={styles.feedbackHeadline}>
        {!neutral && <span className={right ? styles.correctIcon : styles.wrongIcon}>{right ? <CorrectIcon /> : <WrongIcon />}</span>}
        {t.format(neutral ? "feedback.verdict.self-rated" : outcome.verdict === "PARTIAL" && (ex.template === "speak" || ex.template === "listen-speak") ? "feedback.verdict.speech-close" : HEADLINES[outcome.verdict])}
      </p>
      {notes.length > 0 && (
        <ul className={styles.notes}>
          {notes.flatMap((id) => {
            const note = id.slice("feedback.note.".length);
            const paired = `${id}-pair`;
            const pairs = base !== undefined && t.has(paired) ? pairsOf(note) : [];
            if (base === undefined || !t.has(paired) || pairs.length === 0) {
              return [
                <li key={id} data-note={note}>
                  {t.format(id)}
                </li>,
              ];
            }
            return pairs.map(([expected, answer]) => (
              <li key={`${id}\u0000${expected}\u0000${answer}`} data-note={note}>
                <WithWords id={paired} words={{ expected: textOfSurface(base, expected), answer: textOfSurface(base, answer) }} />
              </li>
            ));
          })}
        </ul>
      )}
      {showSolution && outcome.solution !== undefined && (
        <div className={styles.solution} data-solution="" data-ink-container="solution">
          {solutionLabel !== undefined && <span className={styles.label}>{solutionLabel}</span>}
          <T as="p" text={outcome.solution} ruby={ruby} marks={marks} />
        </div>
      )}
      {closest !== undefined && (
        <div className={styles.solution} data-closest="">
          <span className={styles.label}>{t.format("player.feedback.closest")}</span>
          <T as="p" text={closest.text} highlight={closest.marked} marks={marks} />
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
