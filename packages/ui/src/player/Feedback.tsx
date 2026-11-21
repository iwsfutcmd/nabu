/**
 * Feedback for one answer (gameplan §8.6, §11.6, §11.7): an icon and a headline
 * per verdict category, the profile's notes, the solution, and for typed or
 * tiled answers the learner's answer with the differing parts marked. It is a
 * live region, and never relies on colour alone.
 *
 * What was wrong, and why (P3, ADR 0121): a gap where the answer left something out, the solution's
 * words the answer left out or got wrong marked, and for a wrong word of the course (an option
 * chosen, a word put in place of another, a slip that made another word) what that word means.
 */
import { answerDiff, chosenWordOf, closestAnswer, diffParts, isCorrect, nearMiss, otherWordsOf, solutionMarks, type AnswerDiff, type CourseView, type Exercise, type Outcome, type Response } from "@nabu/core/lesson";
import type { Verdict } from "@nabu/core";
import { formMeanings, wordMeanings, writtenMeanings, type FormMeanings, type WordMeaning } from "@nabu/core/story";
import { textOfSurface } from "@nabu/core/text";
import { directionOf, type MessageId } from "@nabu/i18n";
import type { SchemeId, TaggedText } from "@nabu/schema";
import { Fragment, useMemo, type JSX } from "react";
import { useIsTarget, useTranslator } from "../context.tsx";
import { CorrectIcon, WrongIcon } from "../icons.tsx";
import { T, useShowsRuby, type TProps } from "../T.tsx";
import { FormNote, GlossEntry, GlossList } from "./Gloss.tsx";
import { PartsList } from "./Parts.tsx";
import type { Glossing } from "./shared.ts";
import styles from "./Player.module.css";

/** Marks where a word goes in a message: a private-use character no message holds. */
const SLOT = "\uE000";

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

/**
 * An answer with the parts that differ marked (§11.6), and a gap where it left something out (P3):
 * its runs through <T>, a gap of its own between each two, in the answer's direction. The end of a
 * session shows a missed card's answer with it, as its feedback did.
 */
export const MarkedAnswer = ({ diff }: { readonly diff: AnswerDiff }): JSX.Element => {
  const t = useTranslator();
  if (diff.gaps.length === 0) return <T as="p" text={diff.text} highlight={diff.marked} />;
  return (
    <p dir={directionOf(diff.text.lang)} data-marked-answer="">
      {diffParts(diff).map((part, i) =>
        part.tag === "gap" ? (
          <span key={i} className={styles.answerGap} role="img" aria-label={t.format("player.feedback.gap")} data-answer-gap="" />
        ) : (
          <T key={i} text={part.text} highlight={part.marked} />
        ),
      )}
    </p>
  );
};

/** A wrong word of the course, and its readings (P3). */
interface Meant {
  readonly word: TaggedText;
  readonly meanings: readonly WordMeaning[];
}

/**
 * What a wrong word means (P3): the option a wrong choice chose, or the words of a typed or tiled
 * answer that stand where the solution has others and are words of the course (hablas for hablo,
 * esta for está). Nothing for a right answer, or a word the course gives no meaning.
 */
const useMeant = (course: CourseView, outcome: Outcome, chosen: TaggedText | undefined, wrong: boolean): readonly Meant[] =>
  useMemo(() => {
    if (!wrong) return [];
    const meant = (word: TaggedText, meanings: readonly WordMeaning[]): readonly Meant[] => (meanings.length === 0 ? [] : [{ word, meanings }]);
    if (chosen !== undefined) return meant(chosen, wordMeanings(course, chosen));
    const base = outcome.solution;
    if (base === undefined || outcome.alignment === undefined) return [];
    return otherWordsOf(outcome.alignment).flatMap((other) => {
      const word = textOfSurface(base, other);
      return meant(word, writtenMeanings(course, word));
    });
  }, [course, outcome, chosen, wrong]);

/**
 * What the right word means, where a wrong word was chosen in its place (gap-fill, choose the word):
 * the missed word's meanings beside the chosen one's. The right option carries its sense, as the
 * chosen one does.
 */
const useMissed = (course: CourseView, outcome: Outcome, chosen: TaggedText | undefined): readonly Meant[] =>
  useMemo(() => {
    const right = outcome.solution;
    if (chosen === undefined || right === undefined) return [];
    const meanings = wordMeanings(course, right);
    return meanings.length === 0 ? [] : [{ word: right, meanings }];
  }, [course, outcome, chosen]);

/** A form question (ADR 0132): its options are one word in several forms; the feedback says what each form is. */
const asksForm = (ex: Exercise): boolean => (ex.template === "gap-fill" || ex.template === "story-complete") && ex.asks === "form";

interface FormShown {
  readonly word: TaggedText;
  readonly meanings: FormMeanings;
}

/**
 * What the right form and the chosen one say, where a form question was answered wrong (ADR 0132):
 * the word's meaning is the same in both, so its form is what feedback explains ("-dim: I (past)").
 */
const useForms = (course: CourseView, outcome: Outcome, chosen: TaggedText | undefined): readonly FormShown[] =>
  useMemo(() => {
    const right = outcome.solution;
    if (chosen === undefined || right === undefined) return [];
    return [right, chosen].map((word) => ({ word, meanings: formMeanings(course, word) }));
  }, [course, outcome, chosen]);

/** Each form as written, then what each part of its form means; a bare form shows alone. */
const Forms = ({ forms, label, ruby, marks }: { readonly forms: readonly FormShown[]; readonly label: string; readonly ruby: SchemeId | false; readonly marks: "show" | "hide" }): JSX.Element => (
  <div className={styles.solution} data-meanings="forms">
    <span className={styles.label}>{label}</span>
    <GlossList>
      {forms.flatMap(({ word, meanings }, i) =>
        meanings.lexeme === undefined
          ? []
          : [
              <GlossEntry
                key={i}
                gloss={{ id: meanings.lexeme, form: word, meaning: undefined, span: "whole" }}
                ruby={ruby}
                marks={marks}
                note={meanings.forms.map((f) => (
                  <FormNote key={f.id} id={f.id} meaning={f.meaning} />
                ))}
              />,
            ],
      )}
    </GlossList>
  </div>
);

/** Each reading of each word, as tap-for-gloss shows a meaning, the form it is pinned as after it. */
const Meanings = ({ meant, label, ruby, marks, data }: { readonly meant: readonly Meant[]; readonly label: string; readonly ruby: SchemeId | false; readonly marks: "show" | "hide"; readonly data: string }): JSX.Element => {
  return (
    <div className={styles.solution} data-meanings={data}>
      <span className={styles.label}>{label}</span>
      <GlossList>
        {meant.flatMap(({ word, meanings }, w) =>
          meanings.flatMap((m, r) => {
            const form = m.form === undefined ? undefined : <FormNote id={m.form.id} meaning={m.form.meaning} />;
            // A reading known only by its form: the word itself, then what the form says.
            if (m.glosses.length === 0) {
              return m.form === undefined ? [] : [<GlossEntry key={`${w}:${r}`} gloss={{ id: m.form.id, form: word, meaning: undefined, span: "whole" }} ruby={ruby} marks={marks} note={form} />];
            }
            return m.glosses.map((g, i) => <GlossEntry key={`${w}:${r}:${i}`} gloss={g} ruby={ruby} marks={marks} note={i === m.glosses.length - 1 ? form : undefined} />);
          }),
        )}
      </GlossList>
    </div>
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
  /** What the learner answered: a wrong choice among words of the course says what the chosen one means (P3). */
  readonly response?: Response | null | undefined;
  readonly course: CourseView;
  readonly ruby: SchemeId | false;
  readonly marks: "show" | "hide";
  /**
   * Tap-for-gloss (P1): the right answer's words, and the nearest correct version's, are tappable where
   * they are in a language the course teaches. The card is answered: a meaning gives nothing away.
   */
  readonly glossing?: Glossing | undefined;
}

/** <T>'s tap props for a text of the feedback (`key`), where it is the language being learned. */
const useTaps = (glossing: Glossing | undefined, key: string, text: TaggedText | undefined): Pick<TProps, "onTokenPress" | "pressed"> => {
  const target = useIsTarget(text?.orthography ?? "");
  if (glossing === undefined || text === undefined || !target) return {};
  return { onTokenPress: (token) => glossing.onTap({ key, text, token }), pressed: glossing.tapped?.key === key ? glossing.tapped.token : undefined };
};

export const Feedback = ({ ex, outcome, response, course, ruby, marks, glossing }: FeedbackProps): JSX.Element => {
  const t = useTranslator();
  const showsRuby = useShowsRuby();
  // A self-rating checked nothing (P5): neither right nor wrong, and no solution to compare with.
  const neutral = outcome.selfRated === true;
  const right = isCorrect(outcome.verdict);
  const notes = outcome.notes.map((id) => `feedback.note.${id}`).filter((id): id is MessageId => t.has(id));
  // A right answer typed where a reading layer is shown (a transliteration, Jyutping): the field shows only
  // what was typed, so the sentence comes again with its readings. CORRECT is the shown wording itself;
  // another wording (CORRECT_ALT) gets the solution with its readings anyway.
  // Only where a word of it still shows its reading: readings on new words only leave off those the
  // learner has shown (ADR 0131), and the sentence again without any would say nothing new.
  const solution = outcome.solution;
  const withReadings =
    outcome.verdict === "CORRECT" &&
    response?.tag === "text" &&
    ruby !== false &&
    solution !== undefined &&
    showsRuby(solution, ruby);
  // A right sentence typed whole, in the language being learned (translate-type, listen-type): the field
  // holds only letters, so the sentence comes again for its words to be looked up (P1), in a lesson that
  // glosses them. Cards that show their sentence already (a gap, a word in its sentence) need no second.
  const solutionIsTarget = useIsTarget(solution?.orthography ?? "");
  const toLookUp =
    outcome.verdict === "CORRECT" &&
    response?.tag === "text" &&
    (ex.template === "translate-type.l1-l2" || ex.template === "listen-type") &&
    glossing !== undefined &&
    solutionIsTarget;
  const showSolution = outcome.solution !== undefined && (outcome.verdict !== "CORRECT" || withReadings || toLookUp);
  const solutionLabel = right ? undefined : t.format("player.feedback.solution");
  const profile = course.profiles.get(ex.orthography);
  const joiner = profile?.unitKind === "grapheme" ? "" : " ";
  const diff =
    outcome.verdict !== "CORRECT" && outcome.alignment !== undefined && outcome.solution !== undefined && outcome.alignment.length > 0
      ? answerDiff(outcome.alignment, outcome.solution, joiner)
      : undefined;
  // The solution's words the answer left out or got wrong (P3), where it lines up with the solution's
  // own wording: a word left out is seen where it goes.
  const solutionMarked =
    showSolution && outcome.closestIsSolution === true && outcome.alignment !== undefined && outcome.solution !== undefined && profile !== undefined
      ? solutionMarks(outcome.alignment, outcome.solution, profile)
      : [];
  // A near miss of another accepted wording than the solution: after the solution (with its
  // readings), that wording as the nearest correct version, what the learner left out or got wrong
  // marked. An answer far from every wording gets the solution alone.
  const closest =
    !right && outcome.closestIsSolution === false && outcome.alignment !== undefined && outcome.solution !== undefined && nearMiss(outcome.alignment)
      ? closestAnswer(outcome.alignment, outcome.solution, joiner)
      : undefined;
  const wrong = !right && !neutral;
  const chosen = wrong ? chosenWordOf(ex, response) : undefined;
  // A form question's options mean the same word: what differs is the form (ADR 0132).
  const formQuestion = asksForm(ex);
  const meant = useMeant(course, outcome, formQuestion ? undefined : chosen, wrong && !formQuestion);
  const missed = useMissed(course, outcome, formQuestion ? undefined : chosen);
  const forms = useForms(course, outcome, formQuestion ? chosen : undefined);
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
  const solutionTaps = useTaps(glossing, "feedback-solution", showSolution ? outcome.solution : undefined);
  const closestTaps = useTaps(glossing, "feedback-closest", closest?.text);
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
        <div className={styles.solution} data-solution="">
          {solutionLabel !== undefined && <span className={styles.label}>{solutionLabel}</span>}
          <T as="p" text={outcome.solution} ruby={ruby} marks={marks} highlight={solutionMarked} {...solutionTaps} />
        </div>
      )}
      {/* A word taken apart wrongly (ADR 0152): its parts, in the word's order. The tiles mark them by
          colour; this says them, to a screen reader too. */}
      {ex.template === "whole-parts" && !right && (
        <div className={styles.solution} data-solution="">
          <span className={styles.label}>{t.format("player.feedback.solution")}</span>
          <PartsList parts={ex.solution.flatMap((i) => ex.options[i] ?? [])} lang={ex.prompt.lang} label={t.format("player.parts.label")} ruby={ruby} marks={marks} />
        </div>
      )}
      {missed.length > 0 && <Meanings meant={missed} label={t.format("player.feedback.right-meaning")} ruby={ruby} marks={marks} data="right" />}
      {forms.length > 0 && <Forms forms={forms} label={t.format("player.feedback.form-meanings")} ruby={ruby} marks={marks} />}
      {closest !== undefined && (
        <div className={styles.solution} data-closest="">
          <span className={styles.label}>{t.format("player.feedback.closest")}</span>
          <T as="p" text={closest.text} highlight={closest.marked} marks={marks} {...closestTaps} />
        </div>
      )}
      {diff !== undefined && (diff.marked.length > 0 || diff.gaps.length > 0) && (
        <div className={styles.solution} data-answer-diff="">
          <span className={styles.label}>{t.format("player.feedback.your-answer")}</span>
          <MarkedAnswer diff={diff} />
          <span className={styles.muted}>{t.format("player.feedback.marked")}</span>
        </div>
      )}
      {meant.length > 0 && (
        <Meanings
          meant={meant}
          label={chosen !== undefined ? t.format("player.feedback.chosen-meaning") : t.format("player.feedback.marked-meaning", { count: meant.length })}
          ruby={ruby}
          marks={marks}
          data={chosen !== undefined ? "chosen" : "marked"}
        />
      )}
    </div>
  );
};
