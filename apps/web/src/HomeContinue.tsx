/**
 * Where the learner left off (S1 in the 2026-11 review). Home leads with a card that continues the
 * course studied last, in the writing system it was studied in, with its next step as the course
 * page's Continue has it (ADR 0105): the next lesson or story, or practice first with a new lesson
 * beside it (D6). The courses studied come first in the list, the latest first, each saying when it
 * was last practised (left-off.ts). A reminder opens Home, so it opens this card.
 *
 * It is read from the log (each course's latest start, @nabu/core `studiedCourses`), so a session on
 * another device counts once it syncs; nothing is kept beside the log.
 */
import { studiedCourses, type LearnerState, type PathNode, type Studied } from "@nabu/core/learner";
import type { CourseView } from "@nabu/core/lesson";
import { courseName, orthographyName } from "@nabu/i18n";
import { useTranslator } from "@nabu/ui";
import type { CourseIndexEntry } from "@nabu/ui/player";
import { useEffect, useMemo, useState, type JSX } from "react";
import styles from "./App.module.css";
import { facetsOffOf, offNow } from "./breaks.ts";
import { stepLine, stepOf } from "./left-off.ts";
import { paceChoiceOf } from "./pace.ts";
import type { EventStore } from "./store.ts";

/**
 * The courses studied, the latest first: read while `store` is given (on Home), and again whenever
 * `version` changes (events recorded, pulled or restored), the last reading standing meanwhile.
 * Undefined until read: away from Home it is let go, so Home never shows the course it left for
 * before the one the learner just studied.
 */
export const useStudied = (store: EventStore | null, version: string): readonly Studied[] | undefined => {
  const [studied, setStudied] = useState<readonly Studied[] | undefined>(undefined);
  useEffect(() => {
    if (store === null) {
      setStudied(undefined);
      return undefined;
    }
    let live = true;
    void store.latestStarts().then((starts) => {
      if (live) setStudied(studiedCourses(starts));
    });
    return () => {
      live = false;
    };
  }, [store, version]);
  return store === null ? undefined : studied;
};

export interface ContinueLinks {
  /** The course's page, in the writing system continued. */
  readonly page: string;
  /** A practice session (review). */
  readonly review: string;
  /** Where a node on the path is played. */
  readonly node: (node: PathNode) => string;
}

interface ContinueCardProps {
  readonly entry: CourseIndexEntry;
  readonly orthography: string;
  /** The course and the learner's state in it, once loaded: until then Continue opens the course's page. */
  readonly course: CourseView | undefined;
  readonly state: LearnerState | undefined;
  readonly links: ContinueLinks;
}

/** The card at the top of Home: the course studied last, and its next step one press away. */
export const ContinueCard = ({ entry, orthography, course, state, links }: ContinueCardProps): JSX.Element => {
  const t = useTranslator();
  // At the learner's pace, with what they turned off for good left out (D41), as on the course page.
  const step = useMemo(() => (course === undefined || state === undefined ? undefined : stepOf(course, state, new Date(), paceChoiceOf(course.id), facetsOffOf(offNow()))), [course, state]);
  // The writing system is named where the course has several: it is the one continued.
  const name = entry.orthographies.length > 1 ? `${courseName(t, entry)} · ${orthographyName(t, entry, orthography)}` : courseName(t, entry);
  const line = step === undefined || course === undefined ? undefined : stepLine(t, course, step);
  const primary =
    step?.kind === "practice"
      ? { href: links.review, label: t.format("app.continue.practice") }
      : step?.kind === "path"
        ? { href: links.node(step.node), label: t.format("app.continue.lesson") }
        : step === undefined
          ? { href: links.page, label: t.format("app.continue.lesson") }
          : undefined;
  return (
    <section className={`${styles.course} ${styles.continueCard}`} aria-labelledby="continue-title" data-home-continue={entry.id} data-continue-orthography={orthography} data-step={step?.kind ?? "loading"}>
      <h2 className={styles.courseName} id="continue-title">
        {t.format("app.home.continue.title")}
      </h2>
      <p className={styles.courseLine}>
        <a className={styles.back} href={links.page} data-continue-course="">
          {name}
        </a>
      </p>
      <p className={`${styles.muted} ${styles.continueStep}`} id="continue-step" data-continue-step="">
        {line}
      </p>
      {primary !== undefined && (
        <div className={styles.continueActions}>
          <a className={styles.primary} href={primary.href} aria-describedby={line === undefined ? undefined : "continue-step"} data-action="continue">
            {primary.label}
          </a>
          {/* A new lesson is always on offer beside practice (D6). */}
          {step?.kind === "practice" && step.node !== undefined && (
            <a className={styles.link} href={links.node(step.node)} data-action="new-lesson">
              {t.format("app.continue.new-lesson")}
            </a>
          )}
        </div>
      )}
    </section>
  );
};
