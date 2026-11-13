/**
 * The sessions plan() gives a learner who walks a course's path, for tests that check what lessons
 * are (C5 in the 2026-11 review): learners see what the planner plans, so that is what the lesson
 * tests check, never a builder of their own. The learner takes each lesson in path order, two a day,
 * and after every fourth a review session and, once they have mistakes, a mistakes session. They
 * answer every card right the first time, but every seventh, which they get right the second time.
 */
import type { LearnerEvent } from "@nabu/schema";
import { applyEvents, emptyLearnerState, plan, type LearnerState, type PlanOptions, type SessionPlan, type SessionRequest } from "../src/learner/index.ts";
import { lessonNodes, type CourseView, type Exercise } from "../src/lesson/index.ts";
import { eventFactory, manifestOf } from "./learner-fixtures.ts";

export interface PlannedSession {
  /** What it is: "lesson fa.greetings", "review after fa.greetings", "mistakes after …". */
  readonly label: string;
  readonly request: SessionRequest;
  readonly options: PlanOptions;
  /** The learner's state it was planned in. */
  readonly state: LearnerState;
  readonly plan: SessionPlan;
}

export interface WalkOptions {
  /** Each session's seed is `seed * 1000` plus its number on the walk. */
  readonly seed?: number;
  /** What the app can do with speech, and what the learner turned off, for every session. */
  readonly speech?: PlanOptions["speech"];
  readonly exclude?: PlanOptions["exclude"];
  /** Stop after this many lessons (the whole path where unset). */
  readonly lessons?: number;
}

const HOUR = 3_600_000;
const START = Date.parse("2026-01-05T00:00:00.000Z");
/** Every seventh card is missed the first time. */
const MISS_EVERY = 7;

/** The sessions a learner who walks the course's path is planned, in order. */
export const walkPath = (course: CourseView, options: WalkOptions = {}): readonly PlannedSession[] => {
  const seed = options.seed ?? 7;
  const events = eventFactory(course, manifestOf(course.id).id);
  const out: PlannedSession[] = [];
  let state = emptyLearnerState();
  let answered = 0;
  const run = (request: Exclude<SessionRequest, { mode: "placement" }>, label: string, at: number): void => {
    const now = new Date(at).toISOString();
    const planOptions: PlanOptions = { now, today: now.slice(0, 10), seed: seed * 1000 + out.length, speech: options.speech, ...(options.exclude === undefined ? {} : { exclude: options.exclude }) };
    const planned = plan(course, state, request, planOptions);
    out.push({ label, request, options: planOptions, state, plan: planned });
    if (planned.exercises.length === 0) return;
    // The session as the device logs it, folded once at its end.
    let clock = at;
    const tick = (ms: number): void => {
      clock += ms;
      events.at(new Date(clock).toISOString());
    };
    const node = request.mode === "lesson" ? request.node : undefined;
    const log: LearnerEvent[] = [];
    events.at(now);
    events.session();
    log.push(events.started(request.mode, node, planned.exercises.length));
    let right = 0;
    for (const ex of planned.exercises) {
      tick(20_000);
      answered += 1;
      if (answered % MISS_EVERY === 0) {
        log.push(events.answer(ex, false, 1));
        tick(20_000);
        log.push(events.answer(ex, true, 2));
      } else {
        log.push(events.answer(ex, true, 1));
        right += 1;
      }
    }
    tick(5_000);
    log.push(events.completed(request.mode, node, { exercises: planned.exercises.length, correctFirstTry: right, retries: planned.exercises.length - right }));
    state = applyEvents(state, log);
  };
  for (const [i, { node }] of lessonNodes(course).slice(0, options.lessons).entries()) {
    const at = START + Math.floor(i / 2) * 24 * HOUR + (i % 2 === 0 ? 9 : 19) * HOUR;
    run({ mode: "lesson", node: node.id }, `lesson ${node.id}`, at);
    if (i % 4 === 3) {
      run({ mode: "review" }, `review after ${node.id}`, at + 2 * HOUR);
      if (state.mistakes.length > 0) run({ mode: "mistakes" }, `mistakes after ${node.id}`, at + 3 * HOUR);
    }
  }
  return out;
};

/** The lesson the walk planned at a node. */
export const lessonAt = (sessions: readonly PlannedSession[], node: string): readonly Exercise[] => {
  const found = sessions.find((s) => s.request.mode === "lesson" && s.request.node === node);
  if (found === undefined) throw new Error(`no lesson ${node} on the walk`);
  return found.plan.exercises;
};

/** Every card the walk's sessions planned, each with its session. */
export const plannedCards = (sessions: readonly PlannedSession[]): readonly { readonly session: PlannedSession; readonly ex: Exercise }[] =>
  sessions.flatMap((session) => session.plan.exercises.map((ex) => ({ session, ex })));
