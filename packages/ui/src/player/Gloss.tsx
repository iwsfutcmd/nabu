/**
 * Tap-for-gloss (Phase 6), in stories and lessons (P1). A tapped word runs the course glossary
 * (`glossTokens` through @nabu/core/story's `glossAt`: longest match, exact and folded passes), so a
 * vocalized word finds its unvocalized entry. What it means opens in a dialog (ADR 0157, amending
 * ADR 0043's panel under the text): the word with its reading, each entry, and each entry's forms
 * (core `lexemeForms`: its paradigm's cells, or the forms the course writes), the tapped word's own
 * marked. Matching and forms are core's, never redone here. A meaning's row (GlossEntry) also says,
 * in the feedback on a wrong answer, what a wrong word means (P3).
 */
import { formCellAt, lexemeForms, otherReadingsAt, type CourseView, type LexemeForms } from "@nabu/core/lesson";
import { courseGlossary, glossAt, glossLine, type Gloss } from "@nabu/core/story";
import { wordAt } from "@nabu/core/text";
import { directionOf } from "@nabu/i18n";
import type { SchemeId, TaggedText } from "@nabu/schema";
import { useId, useMemo, type JSX, type ReactNode } from "react";
import { Button, Dialog, Heading, Modal } from "react-aria-components";
import { useTranslator } from "../context.tsx";
import { Headword } from "../Headword.tsx";
import { CloseIcon } from "../icons.tsx";
import { FadeReadings, type Marks } from "../marks.tsx";
import { T } from "../T.tsx";
import { chromeClass, useChrome } from "../UiRoot.tsx";
import styles from "./Gloss.module.css";
import playerStyles from "./Player.module.css";

/** A tapped word: which text of the card (`key`), the text, and the token. */
export interface WordTap {
  readonly key: string;
  readonly text: TaggedText;
  readonly token: number;
}

/** The tapped word as written, one token of its text (the panel's headword), if it is a word. */
export const wordOf = (tap: Pick<WordTap, "text" | "token"> | undefined): TaggedText | undefined => (tap === undefined ? undefined : wordAt(tap.text, tap.token));

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
    <div className={styles.glossEntry} data-gloss-id={g.id}>
      <dt>
        {g.unwritten === true ? (
          <span className={styles.glossNote} data-gloss-unwritten="">
            {t.format("story.gloss.unwritten")}
          </span>
        ) : (
          <Headword text={g.form} parts={g.lemma === undefined ? (g.principalParts ?? []) : []} ruby={ruby} marks={marks} />
        )}
      </dt>
      <dd>
        {g.meaning !== undefined && <T text={g.meaning} />}
        {g.span !== "whole" && <span className={styles.glossNote}>{t.format(g.span === "part" ? "story.gloss.part" : "story.gloss.phrase")}</span>}
        {g.lemma !== undefined && (
          <span className={styles.glossNote} data-gloss-lemma="">
            {t.format("story.gloss.lemma")} <Headword text={g.lemma} parts={g.principalParts ?? []} ruby={ruby} marks={marks} />
          </span>
        )}
        {note}
      </dd>
    </div>
  );
};

/** The list GlossEntry rows go in. */
export const GlossList = ({ children }: { readonly children: ReactNode }): JSX.Element => <dl className={styles.glossList}>{children}</dl>;

/** The form a word is pinned as (ADR 0076), after its meaning: "present tense: you (tú)". */
export const FormNote = ({ id, meaning }: { readonly id: string; readonly meaning: TaggedText }): JSX.Element => (
  <span className={styles.glossNote} data-gloss-form={id}>
    <T text={meaning} />
  </span>
);

/** Another reading of a tapped word's spelling (ADR 0140): the reading as text, and what that word means. */
export interface OtherReading {
  readonly reading: TaggedText;
  readonly meaning: TaggedText | undefined;
}

/**
 * The other readings the course gives a tapped word's spelling in the reading scheme shown (ADR 0140:
 * اوزوم üzüm "grape" is also özüm "myself"). None for a spelling read one way, or without a scheme.
 */
export const useOtherReadings = (course: CourseView, tap: Pick<WordTap, "text" | "token"> | undefined, scheme: SchemeId | false): readonly OtherReading[] =>
  useMemo(() => (tap === undefined || scheme === false ? [] : otherReadingsAt(course, scheme, tap.text, tap.token)), [course, tap, scheme]);

/**
 * Each entry's forms (ADR 0157): an entry for a lexeme the word writes (not a phrase, not a part the
 * script leaves unwritten), with the form the tapped token writes it in; only where it has more than
 * one form, so a word with one form is its entry alone.
 */
export interface EntryForms {
  readonly gloss: Gloss;
  readonly forms: LexemeForms;
  /** The cell the tapped word stands in, among the rows (`formCellAt`). */
  readonly current: string | undefined;
}

/** The forms of what a tapped word writes, by entry (`lexemeForms`), each lexeme once. */
export const useEntryForms = (course: CourseView, tap: Pick<WordTap, "text" | "token"> | undefined, glosses: readonly Gloss[]): readonly EntryForms[] =>
  useMemo(() => {
    if (tap === undefined) return [];
    const seen = new Set<string>();
    return glosses.flatMap((gloss): EntryForms[] => {
      if (gloss.span === "phrase" || gloss.unwritten === true || seen.has(gloss.id)) return [];
      seen.add(gloss.id);
      const forms = lexemeForms(course, gloss.id, tap.text.orthography);
      if (forms === undefined || forms.rows.length < 2) return [];
      return [{ gloss, forms, current: formCellAt(course, tap.text, tap.token, gloss.id) }];
    });
  }, [course, tap, glosses]);

/** One entry's forms, as a table: each form (the ways it is written), and what the language calls it. */
const FormsTable = ({ entry, named, ruby, marks }: { readonly entry: EntryForms; readonly named: boolean; readonly ruby: SchemeId | false; readonly marks: Marks }): JSX.Element => {
  const t = useTranslator();
  const heading = useId();
  const lemma = entry.gloss.lemma ?? entry.gloss.form;
  return (
    <section className={styles.forms} aria-labelledby={heading} data-gloss-forms={entry.gloss.id} data-forms-source={entry.forms.source}>
      <h3 className={styles.formsHeading} id={heading}>
        {t.format("story.gloss.forms")}
        {/* Where the word writes several lexemes with forms, which one's these are. */}
        {named && <T className={styles.formsOf} text={lemma} ruby={ruby} marks={marks} />}
      </h3>
      <table className={styles.formsTable}>
        <tbody>
          {entry.forms.rows.map((row) => {
            const current = row.cell === entry.current;
            return (
              <tr
                key={row.cell}
                className={current ? styles.currentForm : undefined}
                aria-current={current ? "true" : undefined}
                data-form-cell={row.cell}
                data-current={current ? "" : undefined}
                data-attested={row.attested ? "" : undefined}
              >
                <th scope="row" className={styles.form}>
                  {/* The ways a form is written, as one run in the text's own direction (from its script, as
                      Headword sets its parts): each set off by a rule the stylesheet draws between them. */}
                  <span className={styles.formWays} dir={directionOf((row.texts[0] ?? entry.gloss.form).lang)} data-form-ways={row.texts.length}>
                    {row.texts.map((text, i) => (
                      <T key={i} {...(i > 0 && { className: styles.formVariant })} text={text} ruby={ruby} marks={marks} />
                    ))}
                  </span>
                </th>
                <td className={styles.formLabel}>
                  {row.label !== undefined && <T text={row.label} />}
                  {current && (
                    <span className={styles.glossNote} data-form-current="">
                      {t.format("story.gloss.current")}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
};

export interface GlossContentProps {
  readonly course: CourseView;
  /** The word tapped (its text and token), or none: the dialog is closed. */
  readonly tap: Pick<WordTap, "text" | "token"> | undefined;
  readonly glosses: readonly Gloss[];
  /** The reading layer the word and the entries' forms show. */
  readonly ruby: SchemeId | false;
  readonly marks: Marks;
  /** The other readings of the tapped word's spelling (ADR 0140, `useOtherReadings`), each with what it means. */
  readonly also?: readonly OtherReading[] | undefined;
  /** Closing it (its button, Escape, a press outside): the word is no longer tapped. */
  readonly onClose: () => void;
}

/**
 * What the dialog says of a tapped word, in the chrome's lang and dir (the dialog is portalled out
 * of the app's root); each text in it takes its own from its tag (<T>). Its title is the word as
 * tapped, with its reading even where readings fade (ADR 0131: this is where a word is looked up);
 * then each entry, the entries' forms, and the spelling's other readings.
 */
export const GlossContent = ({ course, tap, glosses, ruby, marks, also = [], onClose }: GlossContentProps): JSX.Element => {
  const t = useTranslator();
  const chrome = useChrome();
  const word = wordOf(tap);
  const forms = useEntryForms(course, tap, glosses);
  return (
    <div className={styles.dialogBody} lang={chrome.lang} dir={chrome.dir}>
      <div className={styles.dialogHeader}>
        <Heading slot="title" className={styles.glossWord} data-gloss-word="">
          {word === undefined ? (
            t.format("story.gloss.label")
          ) : (
            <FadeReadings on={false}>
              <T text={word} ruby={ruby} marks={marks} />
            </FadeReadings>
          )}
        </Heading>
        <Button className={playerStyles.iconButton} onPress={onClose} aria-label={t.format("story.gloss.close")} data-action="close-gloss">
          <CloseIcon />
        </Button>
      </div>
      {glosses.length === 0 ? (
        <p className={styles.glossHint}>{t.format("story.gloss.none")}</p>
      ) : (
        // A tapped word's readings show here even where readings fade (ADR 0131): this is where it is looked up.
        <FadeReadings on={false}>
          <GlossList>
            {glosses.map((g, i) => (
              <GlossEntry key={i} gloss={g} ruby={ruby} marks={marks} />
            ))}
          </GlossList>
          {forms.map((entry) => (
            <FormsTable key={entry.gloss.id} entry={entry} named={forms.length > 1} ruby={ruby} marks={marks} />
          ))}
        </FadeReadings>
      )}
      {also.length > 0 && (
        // The same spelling read otherwise elsewhere in the course (ADR 0140).
        <div className={styles.glossAlso} data-gloss-also="">
          <p className={styles.glossNote}>{t.format("story.gloss.also")}</p>
          <GlossList>
            {also.map((r, i) => (
              <div key={i} className={styles.glossEntry} data-gloss-reading="">
                <dt>
                  <T text={r.reading} />
                </dt>
                <dd>{r.meaning !== undefined && <T text={r.meaning} />}</dd>
              </div>
            ))}
          </GlossList>
        </div>
      )}
    </div>
  );
};

/**
 * What a tapped word means, in a modal dialog (ADR 0157, amending ADR 0043's panel under the text):
 * open while a word is tapped; closing it (its button, Escape, a press outside) gives the focus back
 * to the word. It is chrome, horizontal whatever the text's writing mode.
 */
export const GlossDialog = (props: GlossContentProps): JSX.Element => {
  const chrome = useChrome();
  return (
    <Modal
      className={playerStyles.modal}
      isOpen={props.tap !== undefined}
      isDismissable
      onOpenChange={(isOpen) => {
        if (!isOpen) props.onClose();
      }}
    >
      <Dialog className={`${styles.dialog} ${chromeClass}`} style={chrome.style} data-gloss-panel="" data-gloss-open="">
        <GlossContent {...props} />
      </Dialog>
    </Modal>
  );
};

/** A story says its words can be tapped (ADR 0043), where its panel used to wait for one. */
export const GlossHint = (): JSX.Element => {
  const t = useTranslator();
  return (
    <p className={styles.glossHint} data-gloss-hint="">
      {t.format("story.gloss.hint")}
    </p>
  );
};
