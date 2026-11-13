/**
 * The placement test around the player (S5 in the 2026-11 review; ADR 0039, 0077): what it does,
 * said before it starts, and what it placed the learner out of, said when it ends. The test itself
 * is the planner's (core placementTest) and its result a projection: a completed placement session
 * marks the nodes it `placed` done, adding to what was done before and never taking any away, so
 * the test can be taken again at any time.
 */
import { pathNodes, type LearnerState, type SessionPlan } from "@nabu/core/learner";
import { runTest, type CourseView } from "@nabu/core/lesson";
import { T, useTranslator } from "@nabu/ui";
import type { JSX, MouseEvent } from "react";
import { Button } from "react-aria-components";
import styles from "./App.module.css";
import { nodeName } from "./screen.tsx";

/** The most questions a placement test can ask: what it asks first, and what may follow (the progress bar's bound). */
export const mostQuestions = (planned: SessionPlan): number =>
  planned.exercises.length + (planned.placement === undefined ? 0 : runTest(planned.placement.test, new Map()).later);

export interface PlacementIntroProps {
  readonly language: string;
  readonly most: number;
  readonly onStart: () => void;
  /** The course page, and how to go back to it (navigation.ts). */
  readonly back: string;
  readonly onBack: (e: MouseEvent<HTMLAnchorElement>) => void;
}

/** Before the test: what it is for, how long it is, what it changes, and that it can be stopped or taken again. */
export const PlacementIntro = ({ language, most, onStart, back, onBack }: PlacementIntroProps): JSX.Element => {
  const t = useTranslator();
  return (
    <main className={styles.page} data-placement-intro="">
      <h1 className={styles.heading}>{t.format("app.placement.title", { language })}</h1>
      <p>{t.format("app.placement.about", { most })}</p>
      <p>{t.format("app.placement.outcome")}</p>
      <p>{t.format("app.placement.stop-anytime")}</p>
      <div className={styles.links}>
        <Button className={styles.button} onPress={onStart} data-action="placement-start">
          {t.format("app.placement.start")}
        </Button>
        <a className={styles.back} href={back} onClick={onBack}>
          {t.format("app.practice.back")}
        </a>
      </div>
    </main>
  );
};

export interface PlacementResultProps {
  readonly course: CourseView;
  /** The learner state now, the test's result folded in. */
  readonly state: LearnerState;
  /** The nodes done before the test. */
  readonly before: ReadonlySet<string>;
  /** What the test placed the learner out of (the session_completed's `placed`); undefined: nothing. */
  readonly placed: readonly string[] | undefined;
}

/** After the test: how many lessons it newly marked done, and where the learner starts now. */
export const PlacementResult = ({ course, state, before, placed }: PlacementResultProps): JSX.Element => {
  const t = useTranslator();
  const path = pathNodes(course);
  const lessons = path.filter((e) => e.kind === "lesson");
  const fresh = new Set((placed ?? []).filter((id) => !before.has(id)));
  const newly = lessons.filter((e) => fresh.has(e.node.id)).length;
  const done = new Set(state.completedNodes);
  const next = path.find((e) => !done.has(e.node.id));
  // As the course path names it: "Unit 3, lesson 2" (S11).
  const step = next === undefined ? "" : (nodeName(t, course, next.node.id) ?? "");
  const title = next?.unit.title?.[course.supportKey];
  return (
    <div data-placement-result="" data-placed={newly} data-next={next?.node.id}>
      <h2 className={styles.resultTitle}>{t.format("app.placement.done")}</h2>
      <p>{newly > 0 ? t.format("app.placement.placed", { count: newly }) : t.format("app.placement.placed-none")}</p>
      {next === undefined ? (
        <p>{t.format("app.placement.all")}</p>
      ) : (
        <>
          <p>{t.format("app.placement.next", { step })}</p>
          {title !== undefined && course.units.length > 1 && (
            <p className={styles.resultUnit}>
              <T text={title} />
            </p>
          )}
        </>
      )}
    </div>
  );
};
