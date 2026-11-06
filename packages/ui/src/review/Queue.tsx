/**
 * The review workspace's queue (ADR 0074): what learners filed about a course, for a reviewer to
 * approve or reject. Answers they say should (or should not) count, each with the sentence it
 * answers; corrections to sentences and story lines, each with what the learner saw and what
 * they changed. Every text renders through <T> in its own language; learners' notes are free text
 * and take the direction of their first strong character.
 */
import { correctable, type Correctable } from "@nabu/core/corrections";
import { READING_TAGS, type CourseView } from "@nabu/core/lesson";
import { textOfSurface } from "@nabu/core/text";
import type { AnswerReport, BundleSentence, CorrectionFields, SentenceCorrection, TaggedText } from "@nabu/schema";
import { useId, type JSX } from "react";
import { Button } from "react-aria-components";
import { useTranslator } from "../context.tsx";
import { T } from "../T.tsx";
import styles from "./Review.module.css";

export type Decision = "approved" | "rejected";

export interface QueueProps {
  readonly course: CourseView;
  readonly reports: readonly AnswerReport[];
  readonly corrections: readonly SentenceCorrection[];
  readonly onDecide: (kind: "report" | "correction", id: string, status: Decision) => void;
}

const sentenceOf = (course: CourseView, id: string): BundleSentence | undefined => course.units.flatMap((u) => u.sentences).find((s) => s.id === id);

/** A support-language answer (translating into it) takes the translation's tag; any other, the form's. */
const answerText = (course: CourseView, r: AnswerReport, sentence: BundleSentence | undefined): TaggedText | undefined => {
  const base = r.template.endsWith("l2-l1") ? sentence?.translations[course.supportKey]?.text : (sentence?.forms[r.orthography]?.text ?? sentence?.forms[course.orthography]?.text);
  return base === undefined ? undefined : textOfSurface(base, r.answer);
};

const Decide = ({ kind, id, status, onDecide, describedBy }: { kind: "report" | "correction"; id: string; status: string; onDecide: QueueProps["onDecide"]; describedBy: string }): JSX.Element => {
  const t = useTranslator();
  return (
    <div className={styles.decide}>
      {(status === "approved" || status === "rejected") && (
        <p className={styles.badge} data-status={status}>
          {t.format(status === "approved" ? "review.queue.approved" : "review.queue.rejected")}
        </p>
      )}
      {status !== "approved" && (
        <Button className={styles.small} onPress={() => onDecide(kind, id, "approved")} aria-describedby={describedBy} data-action="approve">
          {t.format("review.queue.approve")}
        </Button>
      )}
      {status !== "rejected" && (
        <Button className={styles.small} onPress={() => onDecide(kind, id, "rejected")} aria-describedby={describedBy} data-action="reject">
          {t.format("review.queue.reject")}
        </Button>
      )}
    </div>
  );
};

const Notes = ({ notes }: { notes: readonly string[] }): JSX.Element | null =>
  notes.length === 0 ? null : (
    <ul className={styles.notes}>
      {notes.map((n, i) => (
        <li key={i} dir="auto">
          {n}
        </li>
      ))}
    </ul>
  );

const Report = ({ course, report, onDecide }: { course: CourseView; report: AnswerReport; onDecide: QueueProps["onDecide"] }): JSX.Element => {
  const t = useTranslator();
  const id = useId();
  const sentence = sentenceOf(course, report.item);
  const prompt = sentence?.forms[report.orthography]?.text ?? sentence?.forms[course.orthography]?.text;
  const translation = sentence?.translations[course.supportKey]?.text;
  const answer = answerText(course, report, sentence);
  return (
    <li className={styles.entry} data-report={report.id} data-status={report.status}>
      <div id={id} className={styles.texts} data-ink-container={`report:${report.id}`}>
        {prompt !== undefined && <T as="p" className={styles.target} text={prompt} />}
        {translation !== undefined && <T as="p" className={styles.muted} text={translation} />}
        <p className={styles.claim}>
          <span>{t.format(report.claim === "reject" ? "review.queue.claim.reject" : "review.queue.claim.accept")}</span>{" "}
          <span className={styles.muted}>{t.format("review.queue.learners", { count: report.reports })}</span>
        </p>
        {answer !== undefined && <T as="p" className={styles.answer} text={answer} />}
        <Notes notes={report.notes} />
      </div>
      <Decide kind="report" id={report.id} status={report.status} onDecide={onDecide} describedBy={id} />
    </li>
  );
};

/** A reading's tag: the profile's ruby layer names it (ADR 0071), else the scheme's known tag, else the form's. */
const readingTag = (course: CourseView, orthography: string, scheme: string, base: TaggedText): Pick<TaggedText, "lang" | "orthography"> => {
  const layer = course.profiles.get(orthography)?.source.annotations?.find((a) => a.kind === "reading" && a.scheme === scheme);
  if (layer?.lang !== undefined) return { lang: layer.lang, orthography: base.orthography };
  const known = READING_TAGS[scheme];
  return known === undefined ? base : { lang: known.lang as TaggedText["lang"], orthography: known.orthography as TaggedText["orthography"] };
};

/** What a correction changes, field by field, each in its own language. */
const Changes = ({ course, target, fields }: { course: CourseView; target: Correctable; fields: CorrectionFields }): JSX.Element => {
  const t = useTranslator();
  const forms = Object.entries(fields.forms ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return (
    <dl className={styles.changes}>
      {forms.map(([orthography, form]) => {
        const base = target.forms[orthography];
        return base === undefined ? null : (
          <div key={orthography} className={styles.change}>
            <dt className={styles.muted}>{t.format("review.queue.corrected")}</dt>
            {form.text !== undefined && (
              <dd>
                <T text={textOfSurface(base, form.text)} />
              </dd>
            )}
            {(form.readings ?? []).map((r) => (
              <dd key={`${String(r.token)}:${r.scheme}`} className={styles.reading}>
                <T text={textOfSurface(base, r.surface)} /> <T text={textOfSurface(readingTag(course, orthography, r.scheme, base), r.reading)} />
              </dd>
            ))}
          </div>
        );
      })}
      {fields.translation !== undefined && target.translation !== undefined && (
        <div className={styles.change}>
          <dt className={styles.muted}>{t.format("review.queue.corrected")}</dt>
          <dd>
            <T text={textOfSurface(target.translation, fields.translation)} />
          </dd>
        </div>
      )}
    </dl>
  );
};

const Correction = ({ course, correction, onDecide }: { course: CourseView; correction: SentenceCorrection; onDecide: QueueProps["onDecide"] }): JSX.Element | null => {
  const t = useTranslator();
  const id = useId();
  const target = correctable(course, correction.item, correction.step);
  // An item the course no longer has: the CLI reports it; the workspace has nothing to show.
  if (target === undefined) return null;
  const own = target.forms[course.orthography];
  return (
    <li className={styles.entry} data-correction={correction.id} data-status={correction.status}>
      <div id={id} className={styles.texts} data-ink-container={`correction:${correction.id}`}>
        {own !== undefined && <T as="p" className={styles.target} text={own} />}
        {target.translation !== undefined && <T as="p" className={styles.muted} text={target.translation} />}
        <p className={styles.claim}>
          <span className={styles.muted}>{t.format("review.queue.learners", { count: correction.reports })}</span>
        </p>
        <Changes course={course} target={target} fields={correction.correction} />
        <Notes notes={correction.notes} />
      </div>
      <Decide kind="correction" id={correction.id} status={correction.status} onDecide={onDecide} describedBy={id} />
    </li>
  );
};

export const Queue = ({ course, reports, corrections, onDecide }: QueueProps): JSX.Element => {
  const t = useTranslator();
  const answersId = useId();
  const correctionsId = useId();
  return (
    <div className={styles.queue} data-review-queue={course.id}>
      <section aria-labelledby={answersId}>
        <h2 className={styles.heading} id={answersId}>
          {t.format("review.queue.answers")}
        </h2>
        {reports.length === 0 ? (
          <p className={styles.muted}>{t.format("review.queue.empty")}</p>
        ) : (
          <ol className={styles.entries}>
            {reports.map((r) => (
              <Report key={r.id} course={course} report={r} onDecide={onDecide} />
            ))}
          </ol>
        )}
      </section>
      <section aria-labelledby={correctionsId}>
        <h2 className={styles.heading} id={correctionsId}>
          {t.format("review.queue.corrections")}
        </h2>
        {corrections.length === 0 ? (
          <p className={styles.muted}>{t.format("review.queue.empty")}</p>
        ) : (
          <ol className={styles.entries}>
            {corrections.map((c) => (
              <Correction key={c.id} course={course} correction={c} onDecide={onDecide} />
            ))}
          </ol>
        )}
      </section>
    </div>
  );
};
