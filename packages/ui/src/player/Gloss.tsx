/**
 * Tap-for-gloss (Phase 6), in stories and lessons (P1). A tapped word runs the course glossary
 * (`glossTokens` through @nabu/core/story's `glossAt`: longest match, exact and folded passes), so a
 * vocalized word finds its unvocalized entry; the meaning appears in a live panel under the text.
 * Matching is core's, never redone here. A meaning's row (GlossEntry) also says, in the feedback on
 * a wrong answer, what a wrong word means (P3).
 */
import type { CourseView } from "@nabu/core/lesson";
import { courseGlossary, glossAt, glossLine, type Gloss } from "@nabu/core/story";
import type { SchemeId, TaggedText } from "@nabu/schema";
import { useMemo, type JSX, type ReactNode } from "react";
import { useTranslator } from "../context.tsx";
import type { Marks } from "../marks.tsx";
import { T } from "../T.tsx";
import styles from "./Gloss.module.css";

/** A tapped word: which text of the card (`key`), the text, and the token. */
export interface WordTap {
  readonly key: string;
  readonly text: TaggedText;
  readonly token: number;
}

/** What a tapped word means, by the course glossary. */
export const useGlosses = (course: CourseView, tap: Pick<WordTap, "text" | "token"> | undefined): readonly Gloss[] => {
  const glossary = useMemo(() => courseGlossary(course), [course]);
  return useMemo(() => (tap === undefined ? [] : glossAt(course, glossary, glossLine(course, glossary, tap.text), tap.text, tap.token)), [course, glossary, tap]);
};

export interface GlossEntryProps {
  readonly gloss: Gloss;
  /** The reading layer the entry's form shows. */
  readonly ruby: SchemeId | false;
  readonly marks: Marks;
  /** More to say of the entry, after its meaning (feedback: the form a word is pinned as, P3). */
  readonly note?: ReactNode;
}

/** One meaning, in a GlossList: the entry's form, then what it means and how much of the word it covers. */
export const GlossEntry = ({ gloss: g, ruby, marks, note }: GlossEntryProps): JSX.Element => {
  const t = useTranslator();
  return (
    <div className={styles.glossEntry} data-gloss-kc={g.kc}>
      <dt>
        <T text={g.form} ruby={ruby} marks={marks} />
      </dt>
      <dd>
        {g.meaning !== undefined && <T text={g.meaning} />}
        {g.span !== "whole" && <span className={styles.glossNote}>{t.format(g.span === "part" ? "story.gloss.part" : "story.gloss.phrase")}</span>}
        {g.lemma !== undefined && (
          <span className={styles.glossNote} data-gloss-lemma="">
            {t.format("story.gloss.lemma")} <T text={g.lemma} ruby={ruby} marks={marks} />
          </span>
        )}
        {note}
      </dd>
    </div>
  );
};

/** The list GlossEntry rows go in. */
export const GlossList = ({ children }: { readonly children: ReactNode }): JSX.Element => <dl className={styles.glossList}>{children}</dl>;

/** The form a word is pinned as (form:pres-2s, ADR 0076), after its meaning: "present tense: you (tú)". */
export const FormNote = ({ kc, meaning }: { readonly kc: string; readonly meaning: TaggedText }): JSX.Element => (
  <span className={styles.glossNote} data-gloss-form={kc}>
    <T text={meaning} />
  </span>
);

export interface GlossPanelProps {
  /** Whether a word is tapped. */
  readonly open: boolean;
  readonly glosses: readonly Gloss[];
  /** The reading layer the entries' forms show. */
  readonly ruby: SchemeId | false;
  readonly marks: Marks;
  /**
   * A story's panel always shows, with a hint before any word is tapped; a lesson's is quiet (empty,
   * out of sight) until a word is tapped.
   */
  readonly quiet?: boolean;
}

export const GlossPanel = ({ open, glosses, ruby, marks, quiet = false }: GlossPanelProps): JSX.Element => {
  const t = useTranslator();
  return (
    <div
      className={styles.gloss}
      role="status"
      aria-live="polite"
      aria-label={t.format("story.gloss.label")}
      data-gloss-panel=""
      data-gloss-open={open ? "" : undefined}
      data-quiet={quiet ? "" : undefined}
    >
      {!open ? (
        quiet ? null : (
          <p className={styles.glossHint}>{t.format("story.gloss.hint")}</p>
        )
      ) : glosses.length === 0 ? (
        <p className={styles.glossHint}>{t.format("story.gloss.none")}</p>
      ) : (
        <GlossList>
          {glosses.map((g, i) => (
            <GlossEntry key={i} gloss={g} ruby={ruby} marks={marks} />
          ))}
        </GlossList>
      )}
    </div>
  );
};
