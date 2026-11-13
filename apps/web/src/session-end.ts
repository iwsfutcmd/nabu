/**
 * What the end of a session says beyond the session itself (P9 in the 2026-11 review, ADR 0113): how
 * it moved the learner's progress, and where to go next.
 *
 * Progress is the log with the session against the log without it: the learner model (words now
 * known, ADR 0100; a unit finished) and the game state (the streak, the week's practice days against
 * the goal, quests, achievements, XP). "Without it" leaves out the session's own events, so a session
 * picked up after a reload counts whole, and nothing is kept beside the log. The next step is the
 * course page's Continue (ADR 0105): the next lesson or story, or practice first, with a new lesson
 * always on offer beside it (D6). Right after practice it is the next lesson or story, whatever
 * Continue says, with more practice beside it (D34).
 */
import { daysThisWeek, type GameConfig, type GameState } from "@nabu/core/game";
import { continueOf, DESIRED_RETENTION, learnedWords, paceOf, pathNodes, pathUnits, replay, type LearnerState, type PaceChoice, type PathNode } from "@nabu/core/learner";
import type { CourseView, Facet } from "@nabu/core/lesson";
import type { LearnerEvent, SessionCompleted } from "@nabu/schema";
import type { useTranslator } from "@nabu/ui";
import type { NextStep, NextTo, SessionProgress } from "@nabu/ui/player";
import { useEffect, useMemo, useState } from "react";
import { localDate } from "./clock.ts";
import { achievementText, firstDayOf, gameOf, gateClosed, questName } from "./game.tsx";
import type { EventStore } from "./store.ts";

type Translator = ReturnType<typeof useTranslator>;

/** The learner model and the game state at one moment: before the session, or as it stands now. */
export interface Standing {
  readonly state: LearnerState;
  readonly game: GameState;
}

/** The words of the course the learner knows, in course order (without the facets turned off for good, D41). */
const knownIn = (course: CourseView, state: LearnerState, now: string, facetsOff: ReadonlySet<Facet>): readonly string[] =>
  learnedWords(course, state, now, DESIRED_RETENTION, facetsOff)
    .filter((w) => w.known)
    .map((w) => w.kc);

/** The units whose every lesson and story is done. */
const unitsDone = (course: CourseView, state: LearnerState): ReadonlySet<string> => {
  const done = new Set(state.completedNodes);
  const open = new Set(pathNodes(course).flatMap((e) => (done.has(e.node.id) ? [] : [e.unit.id])));
  return new Set(pathNodes(course).flatMap((e) => (open.has(e.unit.id) ? [] : [e.unit.id])));
};

export interface ProgressInput {
  readonly course: CourseView;
  readonly before: Standing;
  readonly after: Standing;
  readonly config: GameConfig;
  /** Now, and the learner's local date and first day of the week. */
  readonly now: Date;
  readonly firstDay: number;
  /** A placement test: its result already says what it marked done, unit by unit. */
  readonly placement: boolean;
  /** Facets turned off for good on this device (D41): words are known without them. */
  readonly facetsOff: ReadonlySet<Facet>;
  readonly t: Translator;
}

/**
 * How the session moved the learner's progress: what is new after it that was not before; and
 * whether the deployment's gate keeps the next lesson closed after it (M5).
 */
export const progressOf = ({ course, before, after, config, now, firstDay, placement, facetsOff, t }: ProgressInput): SessionProgress => {
  const iso = now.toISOString();
  const today = localDate(now);
  const knownBefore = new Set(knownIn(course, before.state, iso, facetsOff));
  const knownAfter = knownIn(course, after.state, iso, facetsOff);
  const gained = knownAfter.filter((kc) => !knownBefore.has(kc));
  const unitsBefore = unitsDone(course, before.state);
  const unitsAfter = unitsDone(course, after.state);
  const finished = placement ? undefined : course.units.findLast((u) => unitsAfter.has(u.id) && !unitsBefore.has(u.id));
  const goal = after.game.goal;
  const week = { before: daysThisWeek(before.game.days, today, firstDay), after: daysThisWeek(after.game.days, today, firstDay) };
  const doneBefore = new Set(before.game.quests.filter((q) => q.done).map((q) => q.id));
  // The deployment's gate keeps the next lesson closed after the session (M5): said, with the time.
  const closed = gateClosed(t, after.game, config, now);
  return {
    ...(closed === undefined ? {} : { gate: { text: closed, opensAt: after.game.gate.opensAt } }),
    ...(gained.length > 0 ? { known: { words: gained, total: knownAfter.length } } : {}),
    ...(finished === undefined ? {} : { unit: { number: course.units.indexOf(finished) + 1, title: finished.title?.[course.supportKey] } }),
    // The first session of the day: today joins the streak.
    ...(!before.game.streak.practicedToday && after.game.streak.practicedToday ? { streak: after.game.streak.current } : {}),
    ...(typeof goal === "number" && week.after > week.before ? { week: { done: week.after, goal, met: week.before < goal && week.after >= goal } } : {}),
    quests: after.game.quests.filter((q) => q.done && !doneBefore.has(q.id)).map((q) => ({ id: q.id, label: questName(t, q) })),
    achievements: after.game.achievements.filter((a) => !before.game.achievements.includes(a)).map((id) => ({ id, label: achievementText(t, id, config) })),
  };
};

/** A path node as the next step names it: a lesson by its number on the path, or the unit's story. */
/** The next node as the end screen names it: a lesson by its unit and its number there, as the course page numbers it (S11). */
const nextTo = (course: CourseView, node: PathNode): NextTo => {
  if (node.kind === "story") return { kind: "story" };
  const number = pathNodes(course).filter((e) => e.kind === "lesson").findIndex((e) => e.node.id === node.node) + 1;
  for (const unit of pathUnits(course)) {
    const entry = unit.entries.find((e) => e.node.id === node.node);
    if (entry !== undefined) return unit.number !== undefined && entry.number !== undefined ? { kind: "lesson", number, unit: unit.number, inUnit: entry.number } : { kind: "lesson", number };
  }
  return { kind: "lesson", number };
};

/** Whether a session of this mode is practice: review, mistakes, any mode but a lesson, a story or a placement test (D34). */
export const practises = (mode: SessionCompleted["mode"]): boolean => mode !== "lesson" && mode !== "story" && mode !== "placement";

export interface NextInput {
  readonly course: CourseView;
  readonly state: LearnerState;
  readonly now: Date;
  /** The learner's pace choice for the course (D5). */
  readonly pace: PaceChoice;
  /** Facets turned off for good on this device (D41): never due or slipping, as on the course page. */
  readonly facetsOff: ReadonlySet<Facet>;
  /** Where a node is played, and practice. */
  readonly hrefOf: (node: PathNode) => string;
  readonly review: string;
  /** The session that ended was practice (`practises`): the next lesson comes first (D34). */
  readonly practised: boolean;
  /** A deployment's gate keeps lessons and stories closed now (M5): only practice is open. */
  readonly gated?: boolean | undefined;
  /** Leaves the session's screen for another (navigation.ts). */
  readonly go: (to: string) => void;
  readonly t: Translator;
}

/**
 * The next step: what the course page's Continue has (ADR 0105), but right after practice the next
 * lesson or story on the path, whatever Continue says, with more practice beside it (D34). None once
 * the path is done and nothing is due. `facetsOff`: listening turned off for good (D41). While a
 * deployment's gate keeps lessons closed, practice, and nothing beside it (the end screen says why, M5).
 */
export const nextStepOf = ({ course, state, now, pace: choice, facetsOff, hrefOf, review, practised, gated = false, go, t }: NextInput): NextStep | undefined => {
  const pace = paceOf(course, state, now.toISOString(), choice, facetsOff);
  const next = continueOf(course, state, pace);
  if (next.kind === "done") return undefined;
  const practice = { to: { kind: "practice" }, go: () => go(review) } as const;
  // Why practice comes first, where words are slipping; once the path is done, practice needs no why.
  const why = pace.slipping > 0 ? { why: t.format("app.pace.why.slipping", { count: pace.slipping }) } : {};
  if (gated) return next.kind === "practice" ? { ...practice, ...why } : practice;
  // The next node on the path, whether Continue offers it first or beside practice.
  const node = next.next;
  if (practised && node !== undefined) return { to: nextTo(course, node), go: () => go(hrefOf(node)), beside: practice };
  if (next.kind === "path") return { to: nextTo(course, next.next), go: () => go(hrefOf(next.next)) };
  return {
    ...practice,
    ...why,
    ...(node === undefined ? {} : { beside: { to: nextTo(course, node), go: () => go(hrefOf(node)) } }),
  };
};

export interface SessionEndInput {
  readonly store: EventStore;
  readonly config: GameConfig | null;
  readonly course: CourseView;
  /** The session's id; undefined until it is known (a story's comes with its first event). */
  readonly session: string | undefined;
  /** Whether the session has ended (its session_completed recorded). */
  readonly ended: boolean;
  /** The learner model and the game state as they stand now, the session's events in them. */
  readonly state: LearnerState;
  readonly game: GameState | null;
  readonly placement: boolean;
  /** Facets turned off for good on this device (D41): the words now known are known without them. */
  readonly facetsOff: ReadonlySet<Facet>;
  readonly t: Translator;
}

/**
 * Once the session ends: the standing before it (the log without the session's events), and from
 * it what the session changed and the XP it earned, as the game counts it (quests included). The
 * standing now is the app's, worked out again as each event lands, so these settle a moment after
 * the session's last event.
 */
export const useSessionEnd = ({ store, config, course, session, ended, state, game, placement, facetsOff, t }: SessionEndInput): { readonly progress: SessionProgress | undefined; readonly xp: number | undefined } => {
  const [before, setBefore] = useState<Standing | undefined>(undefined);
  useEffect(() => {
    if (!ended || session === undefined || config === null) return;
    let live = true;
    const others = (e: LearnerEvent): boolean => e.type === "goal_set" || e.session !== session;
    void Promise.all([store.eventsOf(course.id), gameOf(store, config, new Date(), others)]).then(([events, gameBefore]) => {
      if (live) setBefore({ state: replay(events.filter(others)), game: gameBefore });
    });
    return () => {
      live = false;
    };
  }, [ended, session, config, store, course]);
  return useMemo(() => {
    if (before === undefined || game === null || config === null) return { progress: undefined, xp: undefined };
    const after: Standing = { state, game };
    const progress = progressOf({ course, before, after, config, now: new Date(), firstDay: firstDayOf(t.formattingLocale), placement, facetsOff, t });
    return { progress, xp: game.xp.total - before.game.xp.total };
  }, [before, game, config, state, course, placement, facetsOff, t]);
};
