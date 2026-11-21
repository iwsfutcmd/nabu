/** Shared helpers for learner tests: courses from the committed bundles, and event builders. */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { AliasTable, BundleManifest, LearnerEvent, PartCredit, PartId, Prediction, TaggedText } from "@nabu/schema";
import { askedParts } from "../src/learner/credit.ts";
import { exerciseRefOf } from "../src/learner/events.ts";
import { asksOf, lexemeIdsOf, lexemesById, readCourse, skillOf, type CourseView, type Exercise } from "../src/lesson/index.ts";

const ROOT = resolve(import.meta.dirname, "../../..");
const BUNDLES = join(ROOT, "apps/web/public/bundles");
const numberingSystems = JSON.parse(readFileSync(join(ROOT, "packages/i18n/src/generated/numbering-systems.json"), "utf8")) as Record<string, string>;

export const manifestOf = (id: string): BundleManifest => JSON.parse(readFileSync(join(BUNDLES, id, "manifest.json"), "utf8")) as BundleManifest;

/** What each KC id of a course became (its bundle's alias table): what `upgrade` reads. */
export const aliasesOf = (id: string): AliasTable => {
  const file = manifestOf(id).files.find((f) => f.role === "aliases");
  if (file === undefined) throw new Error(`the bundle of ${id} has no alias table`);
  return JSON.parse(readFileSync(join(BUNDLES, id, file.path), "utf8")) as AliasTable;
};

/** A course from its committed bundle: every test's one loader. */
export const loadCourse = (id: string, orthography?: string): CourseView => {
  const course = readCourse((path) => JSON.parse(readFileSync(join(BUNDLES, id, path), "utf8")) as unknown, numberingSystems, orthography);
  if (!course.ok) throw new Error(JSON.stringify(course.error));
  return course.value;
};

/** Deterministic UUID-shaped ids for tests (version nibble 7). */
export const idFactory = (prefix = 0): (() => string) => {
  let n = 0;
  return () => {
    n++;
    const hex = (prefix * 1e9 + n).toString(16).padStart(12, "0");
    return `00000000-0000-7000-8000-${hex}`;
  };
};

export interface EventFactory {
  readonly at: (iso: string) => void;
  readonly session: () => string;
  readonly started: (mode: "lesson" | "review" | "mistakes", node: string | undefined, exercises: number) => LearnerEvent;
  readonly answer: (ex: Exercise, correct: boolean, attempt: number, latencyMs?: number, prediction?: Prediction) => LearnerEvent;
  readonly completed: (mode: "lesson" | "review" | "mistakes", node: string | undefined, summary: { exercises: number; correctFirstTry: number; retries: number }) => LearnerEvent;
}

/**
 * The credits the player logs for a whole answer (creditOf): the words asked about, the rest given,
 * each part with the skill the card exercises it by; a part the card cannot show is given. A typed
 * answer typed exactly right also shows each of its words' spelling leftovers (ADR 0148), where the
 * bundle lists one for the orthography: none does yet.
 */
const creditsOf = (course: CourseView, ex: Exercise, correct: boolean): PartCredit[] => {
  const asked = askedParts(ex);
  const status = correct ? "right" : "wrong";
  const credit = (part: PartId, said: PartCredit["status"]): PartCredit => ({ part, skill: skillOf(ex.template, part), status: asksOf(ex.template, part) ? said : "given" });
  if (asked === undefined && correct && (ex.template === "translate-type.l1-l2" || ex.template === "listen-type")) {
    const lexemes = lexemesById(course);
    // Tests hand in cards of their own making, some with no canonical answer.
    const tokens = (ex as { readonly canonical?: TaggedText }).canonical?.tokens ?? [];
    const leftovers = [
      ...new Set(tokens.flatMap((t) => lexemeIdsOf(t)).filter((id) => (lexemes.get(id)?.leftovers?.spelling as readonly string[] | undefined)?.includes(ex.orthography) === true)),
    ];
    return [...ex.parts.map((part) => credit(part, status)), ...leftovers.map((part): PartCredit => ({ part, skill: "write-script", status: "right" }))];
  }
  if (asked === undefined) return ex.parts.map((part) => credit(part, status));
  return [...new Set([...asked, ...ex.parts])].map((part) => credit(part, asked.includes(part) ? status : "given"));
};

/** Builds valid learner events for one course, with a settable clock. */
export const eventFactory = (course: CourseView, bundle: string): EventFactory => {
  const nextId = idFactory();
  let now = "2026-01-01T09:00:00.000Z";
  let session = nextId();
  const base = () => ({
    id: nextId(),
    schema: 2 as const,
    device: "test",
    course: course.id,
    orthography: course.orthography as Exclude<LearnerEvent, { type: "goal_set" }>["orthography"],
    support: course.supportKey,
    bundle,
    session,
    clientTime: now,
    localDate: now.slice(0, 10),
    tz: "UTC",
  });
  return {
    at: (iso) => {
      now = iso;
    },
    session: () => {
      session = nextId();
      return session;
    },
    started: (mode, node, exercises) => ({ ...base(), type: "session_started", mode, ...(node === undefined ? {} : { node }), seed: 1, exercises, planner: "test" }),
    answer: (ex, correct, attempt, latencyMs = 4000, prediction) => ({
      ...base(),
      type: "answer_submitted",
      exercise: exerciseRefOf(ex),
      attempt,
      // Self-rated speaking (tier 0) carries the learner's rating, as the player logs it (ADR 0099).
      input: { method: "choice", latencyMs, ...(ex.template === "speak.tier-0" ? { selfRating: correct ? ("good" as const) : ("again" as const) } : {}) },
      outcome: { kind: correct ? "CORRECT" : "WRONG", notes: [], labels: [], parts: creditsOf(course, ex, correct) },
      ...(prediction === undefined ? {} : { prediction }),
    }),
    completed: (mode, node, summary) => ({
      ...base(),
      type: "session_completed",
      mode,
      ...(node === undefined ? {} : { node }),
      summary: { completed: true, exercises: summary.exercises, correctFirstTry: summary.correctFirstTry, retries: summary.retries, skipped: 0 },
    }),
  };
};
