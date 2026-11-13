/**
 * #/<course>/<orthography>/reports: Your reports (ADR 0115). What this device reported in the course,
 * corrections and claims about answers, newest first, each with what the course on the device makes
 * of it now (@nabu/core/reports `reportsOf`: a correction in the course, an answer graded as the
 * learner said). It reads the device's own log and records nothing; nothing leaves the device, and
 * no server is asked. The course page links here once there is a report, with how many the course
 * took up.
 */
import { createGrader, type CourseView } from "@nabu/core/lesson";
import { reportsOf, takenUp, type ReportEntry } from "@nabu/core/reports";
import { useTranslator } from "@nabu/ui";
import { ReportList } from "@nabu/ui/corrections";
import type { LoadedCourse } from "@nabu/ui/player";
import { useEffect, useMemo, useState, type JSX } from "react";
import styles from "./App.module.css";
import { storedReading } from "./readings.ts";
import { useReportsReach } from "./reports.ts";
import type { EventStore } from "./store.ts";

/** This device's reports in the course, with what came of each; read again whenever `version` changes (undefined while reading). */
const useReports = (store: EventStore, course: CourseView, version: string): readonly ReportEntry[] | undefined => {
  const [entries, setEntries] = useState<{ readonly course: CourseView; readonly entries: readonly ReportEntry[] } | undefined>(undefined);
  const grader = useMemo(() => createGrader(course), [course]);
  useEffect(() => {
    let live = true;
    void store.eventsOf(course.id).then((events) => {
      if (live) setEntries({ course, entries: reportsOf(course, events, grader) });
    });
    return () => {
      live = false;
    };
  }, [store, course, grader, version]);
  return entries?.course === course ? entries.entries : undefined;
};

const REACH = { reviewers: "reports.reach.reviewers", "sign-in": "reports.reach.sign-in", device: "reports.reach.device" } as const;

export interface ReportsProps {
  readonly loaded: LoadedCourse;
  readonly store: EventStore;
  /** Changes when the log does: the reports are read again. */
  readonly version: string;
}

export const ReportsPage = ({ loaded, store, version, back }: ReportsProps & { readonly back: string }): JSX.Element => {
  const t = useTranslator();
  const { course } = loaded;
  const entries = useReports(store, course, version);
  const reach = useReportsReach();
  return (
    <main className={styles.page} data-reports-page={course.id}>
      <p>
        <a className={styles.back} href={back}>
          {t.format("corrections.page.back")}
        </a>
      </p>
      <h1 className={styles.heading}>{t.format("reports.title")}</h1>
      <p className={styles.muted}>{t.format("reports.intro")}</p>
      {reach !== undefined && (
        <p className={styles.notice} role="note" data-reports-reach={reach}>
          {t.format(REACH[reach])}
        </p>
      )}
      {entries !== undefined && <ReportList course={course} entries={entries} reading={storedReading(course.orthography)} />}
    </main>
  );
};

/** The course page's link to Your reports, once the learner made one: with how many the course took up. */
export const ReportsLink = ({ loaded, store, version, href }: ReportsProps & { readonly href: string }): JSX.Element | null => {
  const t = useTranslator();
  const entries = useReports(store, loaded.course, version);
  if (entries === undefined || entries.length === 0) return null;
  const taken = entries.filter(takenUp).length;
  return (
    <a className={styles.link} href={href} data-reports-link="" data-count={taken}>
      {t.format("reports.title")}
      {taken > 0 && <span className={styles.count}>{t.format("reports.taken-up", { count: taken })}</span>}
    </a>
  );
};
