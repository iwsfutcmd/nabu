/**
 * Explain My Answer (gameplan §13.3): a model's explanation as language-tagged segments, never
 * free markdown. Support-language prose and quoted target-language material each render through
 * <T> with their own lang and direction, isolated, so an English explanation quoting Cantonese
 * reads correctly inside an Arabic UI. `ref` segments quote words of the learner's answer, which
 * is shown above with the same words marked. The model that wrote it is named: it can be wrong.
 */
import { excerpt } from "@nabu/core/ai";
import { directionOf } from "@nabu/i18n";
import type { Explanation } from "@nabu/schema";
import { Fragment, type JSX } from "react";
import { useTranslator } from "../context.tsx";
import { T } from "../T.tsx";
import styles from "./Ai.module.css";

export type Rating = "up" | "down";

export interface ExplanationViewProps {
  readonly explanation: Explanation;
  /** The learner's rating, if they gave one. */
  readonly rating?: Rating | undefined;
  /** Rate the explanation; without it, no rating buttons. */
  readonly onRate?: ((rating: Rating) => void) | undefined;
}

export const ExplanationView = ({ explanation, rating, onRate }: ExplanationViewProps): JSX.Element => {
  const t = useTranslator();
  const marked = [...new Set(explanation.segments.flatMap((s) => (s.kind === "ref" ? (s.answerTokens ?? []) : [])))];
  // The paragraph is in the support language: its base direction is that language's, not the
  // UI's, so an English explanation reads left to right in an Arabic UI, quotes isolated inside.
  const prose = explanation.segments.find((s) => s.kind === "support")?.text?.lang;
  return (
    <section className={styles.explanation} data-explanation="" aria-label={t.format("ai.explain.title")}>
      <h3 className={styles.title}>{t.format("ai.explain.title")}</h3>
      <div className={styles.answer} data-explained-answer="" data-ink-container="explained-answer">
        <span className={styles.label}>{t.format("player.feedback.your-answer")}</span>
        <T as="p" text={explanation.answer} highlight={marked} />
      </div>
      <p className={styles.prose} lang={prose} dir={prose === undefined ? undefined : directionOf(prose)} data-explanation-text="" data-ink-container="explanation">
        {explanation.segments.map((s, i) => (
          <Fragment key={i}>
            {i > 0 && " "}
            {s.kind === "ref" ? (
              <span className={styles.ref} data-segment="ref">
                <T text={excerpt(explanation.answer, s.answerTokens ?? [])} />
              </span>
            ) : s.text === undefined ? null : (
              <span className={s.kind === "target" ? styles.target : undefined} data-segment={s.kind}>
                <T text={s.text} />
              </span>
            )}
          </Fragment>
        ))}
      </p>
      <p className={styles.provenance} data-provenance={explanation.provenance.provider}>
        {t.format("ai.explain.by", { model: explanation.provenance.model })}
      </p>
      {onRate !== undefined && (
        <div className={styles.rating} role="group" aria-label={t.format("ai.explain.rate")}>
          {(["up", "down"] as const).map((r) => (
            <button key={r} type="button" className={styles.rateButton} aria-pressed={rating === r} onClick={() => onRate(r)} data-rate={r}>
              {t.format(r === "up" ? "ai.explain.helpful" : "ai.explain.unhelpful")}
            </button>
          ))}
        </div>
      )}
    </section>
  );
};
