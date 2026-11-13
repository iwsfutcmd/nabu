/**
 * Your reports (ADR 0115): a device's reports in a course, newest first, each with what the course
 * makes of it now (@nabu/core/reports `reportsOf`). A correction says what the learner suggested; a
 * claim, the answer they said should have counted otherwise. Then what came of it: in the course
 * now, changed since some other way, the answer graded as they said, or gone from the course.
 *
 * What a report is about shows as the course has it now, in the learner's orthography (with its
 * ruby readings, as the sentence list shows them) and its translation; what the learner wrote, in
 * the language they wrote it in; all through <T>. A note is free text, in the direction of its
 * first strong character. Nothing here is recorded.
 */
import { correctable, type Correctable } from "@nabu/core/corrections";
import type { CourseView } from "@nabu/core/lesson";
import { takenUp, type ReportEntry } from "@nabu/core/reports";
import { textOfSurface } from "@nabu/core/text";
import type { AnswerReported, SchemeId, SentenceReported, TaggedText } from "@nabu/schema";
import { useMemo, type JSX } from "react";
import { useTranslator } from "../context.tsx";
import { defaultRuby, readingTagIn } from "../player/Readings.tsx";
import { T } from "../T.tsx";
import styles from "./Corrections.module.css";

export interface ReportListProps {
  readonly course: CourseView;
  /** This device's reports in the course, newest first, with what came of each (`reportsOf`). */
  readonly entries: readonly ReportEntry[];
  /** The reading layer the learner chose for the orthography (ADR 0071), if any: ruby as the player shows it. */
  readonly reading?: SchemeId | false | undefined;
}

type Tag = Pick<TaggedText, "lang" | "orthography">;

/** Text in an orthography of the course: tagged as the course tags it there (a form of the item, else its profile). */
const tagIn = (course: CourseView, orthography: string, subject: Correctable | undefined): Tag | undefined => {
  const form = subject?.forms[orthography];
  if (form !== undefined) return form;
  const profile = course.profiles.get(orthography)?.source;
  return profile === undefined ? undefined : { lang: profile.lang, orthography: profile.id };
};

/** What a claim is about, as the course has it now: a sentence, a word, or a story line (a question names "story/step"). */
const claimSubject = (course: CourseView, item: string): Correctable | undefined => {
  const slash = item.lastIndexOf("/");
  const step = slash < 0 ? undefined : Number(item.slice(slash + 1));
  return step !== undefined && Number.isInteger(step) ? correctable(course, item.slice(0, slash), step) : correctable(course, item);
};

/** The item as the course has it now, in the learner's orthography and the translation; as the learner saw it, if gone. */
const Subject = ({ course, subject, gone, ruby }: { course: CourseView; subject: Correctable | undefined; gone: TaggedText | undefined; ruby: SchemeId | false }): JSX.Element | null => {
  const own = subject === undefined ? gone : (subject.forms[course.orthography] ?? Object.values(subject.forms)[0]);
  if (own === undefined) return null;
  return (
    <>
      <T as="p" className={styles.target} text={own} ruby={subject === undefined ? false : ruby} />
      {subject?.translation !== undefined && <T as="p" className={styles.translation} text={subject.translation} />}
    </>
  );
};

/** When the report was made: the learner's local date, in the UI's formatting locale. */
const Made = ({ label, on }: { label: string; on: string }): JSX.Element => {
  const t = useTranslator();
  const date = useMemo(() => new Intl.DateTimeFormat(t.formattingLocale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${on}T00:00:00Z`)), [t.formattingLocale, on]);
  return (
    <p className={styles.made}>
      <span>{label}</span>
      <time className={styles.date} dateTime={on}>
        {date}
      </time>
    </p>
  );
};

const Note = ({ note }: { note: string | undefined }): JSX.Element | null =>
  note === undefined ? null : (
    <p className={styles.note} dir="auto" data-report-note="">
      {note}
    </p>
  );

const STATUS = {
  adopted: "corrections.adopted",
  changed: "corrections.changed",
  accepted: "reports.accepted",
  rejected: "reports.rejected",
  gone: "reports.gone",
} as const;

/** What came of a report, where there is news: nothing while the course grades or reads it as before. */
const Status = ({ status }: { status: ReportEntry["status"] }): JSX.Element | null => {
  const t = useTranslator();
  if (status === "pending" || status === "unchecked") return null;
  return (
    <p className={styles.badge} data-report-badge={status}>
      {t.format(STATUS[status])}
    </p>
  );
};

/** What a correction suggested: each orthography's text and readings it changed, the translation, the note. */
const Suggested = ({ course, report, subject }: { course: CourseView; report: SentenceReported; subject: Correctable | undefined }): JSX.Element => {
  const forms = Object.entries(report.correction.forms ?? {}).sort(([a], [b]) => (a === course.orthography ? -1 : b === course.orthography ? 1 : a < b ? -1 : a > b ? 1 : 0));
  const support = subject?.translation ?? tagIn(course, course.support, undefined);
  return (
    <div className={styles.suggested}>
      {forms.map(([orthography, form]) => {
        const tag = tagIn(course, orthography, subject);
        if (tag === undefined) return null;
        return (
          <div key={orthography} className={styles.suggestedForm}>
            {form.text !== undefined && <T as="p" text={textOfSurface(tag, form.text)} />}
            {(form.readings ?? []).map((r) => (
              <p key={`${String(r.token)}:${r.scheme}`} className={styles.suggestedReading}>
                <T text={textOfSurface(tag, r.surface)} /> <T text={textOfSurface(readingTagIn(course.profiles.get(orthography)?.source, r.scheme, tag), r.reading)} />
              </p>
            ))}
          </div>
        );
      })}
      {report.correction.translation !== undefined && support !== undefined && <T as="p" text={textOfSurface(support, report.correction.translation)} />}
      <Note note={report.note} />
    </div>
  );
};

const CLAIMED = { accept: "reports.claim.accept", reject: "reports.claim.reject" } as const;
/** Speaking cards the device scored: the claim's text is the sentence asked for, not an answer (ADR 0052). */
const SPOKEN: ReadonlySet<string> = new Set(["speak", "listen-speak"]);

/** The answer claimed, in the language it was written in: the support language when translating into it. */
const Answer = ({ course, report, subject }: { course: CourseView; report: AnswerReported; subject: Correctable | undefined }): JSX.Element | null => {
  const tag = report.exercise.template.endsWith("l2-l1") ? (subject?.translation ?? tagIn(course, course.support, undefined)) : tagIn(course, report.orthography, subject);
  return tag === undefined ? null : <T as="p" className={styles.suggested} text={textOfSurface(tag, report.text)} />;
};

const Entry = ({ course, entry, ruby }: { course: CourseView; entry: ReportEntry; ruby: SchemeId | false }): JSX.Element => {
  const t = useTranslator();
  const { report } = entry;
  const subject = entry.kind === "correction" ? correctable(course, entry.report.item, entry.report.step) : claimSubject(course, entry.report.exercise.item);
  // A correction of an item the course no longer has: as the learner saw it.
  const seen = entry.kind === "correction" ? entry.report.shown.forms?.[entry.report.orthography]?.text : undefined;
  const seenTag = tagIn(course, report.orthography, undefined);
  const gone = seen === undefined || seenTag === undefined ? undefined : textOfSurface(seenTag, seen);
  const spoken = entry.kind === "claim" && SPOKEN.has(entry.report.exercise.template);
  return (
    <li className={styles.report} data-report={report.id} data-report-kind={entry.kind} data-report-status={entry.status} data-taken-up={takenUp(entry) || undefined}>
      <div className={styles.texts} data-ink-container={`report:${report.id}`}>
        <Subject course={course} subject={subject} gone={gone} ruby={ruby} />
        {entry.kind === "correction" ? (
          <>
            <Made label={t.format("reports.suggested")} on={report.localDate} />
            <Suggested course={course} report={entry.report} subject={subject} />
          </>
        ) : (
          <>
            <Made label={t.format(spoken ? "reports.claim.spoken" : CLAIMED[entry.report.claim ?? "accept"])} on={report.localDate} />
            {!spoken && <Answer course={course} report={entry.report} subject={subject} />}
            <Note note={entry.report.note} />
          </>
        )}
      </div>
      <Status status={entry.status} />
    </li>
  );
};

export const ReportList = ({ course, entries, reading }: ReportListProps): JSX.Element => {
  const t = useTranslator();
  const ruby = useMemo(() => defaultRuby(course.profiles.get(course.orthography)?.source, reading), [course, reading]);
  return entries.length === 0 ? (
    <p className={styles.muted} data-report-list={course.id} data-empty="">
      {t.format("reports.empty")}
    </p>
  ) : (
    <ol className={styles.reports} data-report-list={course.id}>
      {entries.map((entry) => (
        <Entry key={entry.report.id} course={course} entry={entry} ruby={ruby} />
      ))}
    </ol>
  );
};
