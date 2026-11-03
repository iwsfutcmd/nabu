import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { BundleManifest } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import {
  assembleCourse,
  buildLesson,
  createGrader,
  gradeExercise,
  isCorrect,
  lessonNodes,
  LISTENING,
  MEDIA_ROLES,
  responseOf,
  seededRng,
  start,
  step,
  TEMPLATES,
  type CourseView,
  type Effect,
  type Exercise,
  type PlayerEvent,
  type PlayerState,
  type Response,
  type TemplateId,
} from "../src/lesson/index.ts";
import { surfaceOf } from "../src/text/index.ts";

const ROOT = resolve(import.meta.dirname, "../../..");
const BUNDLES = join(ROOT, "apps/web/public/bundles");
const numberingSystems = JSON.parse(readFileSync(join(ROOT, "packages/i18n/src/generated/numbering-systems.json"), "utf8")) as Record<string, string>;

const loadCourse = (id: string, orthography?: string): CourseView => {
  const manifest = JSON.parse(readFileSync(join(BUNDLES, id, "manifest.json"), "utf8")) as BundleManifest;
  const files = new Map<string, unknown>(
    manifest.files.filter((f) => !MEDIA_ROLES.has(f.role)).map((f) => [f.path, JSON.parse(readFileSync(join(BUNDLES, id, f.path), "utf8")) as unknown]),
  );
  const course = assembleCourse({ manifest, files, numberingSystems }, orthography);
  if (!course.ok) throw new Error(JSON.stringify(course.error));
  return course.value;
};

const VARIANTS: readonly (readonly [string, string | undefined])[] = [
  ["fa", undefined],
  ["yue", undefined],
  ["uz", "uz-Latn/standard"],
  ["uz", "uz-Cyrl/standard"],
  ["apc", "apc-Arab/standard"],
  ["apc", "apc-Latn/arabizi"],
];

/** The response a learner who knows the answer gives. */
const rightAnswer = (ex: Exercise): Response => {
  switch (ex.template) {
    case "select-image":
    case "choose-translation":
    case "gap-fill":
    case "char-read":
    case "reading-disambiguation":
    case "listen-select":
    case "minimal-pair":
      return { tag: "choice", index: ex.answer };
    case "match-pairs":
      return { tag: "pairs", mistakes: 0 };
    case "translate-tap.l2-l1":
    case "translate-tap.l1-l2":
    case "listen-tap":
      return { tag: "tiles", order: ex.solution };
    case "translate-type.l1-l2":
    case "listen-type":
      return { tag: "text", text: surfaceOf(ex.canonical) };
    case "complete-translation":
      return { tag: "text", text: surfaceOf(ex.blank) };
    case "speak.tier-0":
      return { tag: "self-rating", rating: "good" };
  }
};

const wrongAnswer = (ex: Exercise): Response | undefined => {
  switch (ex.template) {
    case "select-image":
    case "choose-translation":
    case "gap-fill":
    case "char-read":
    case "reading-disambiguation":
    case "listen-select":
    case "minimal-pair":
      return { tag: "choice", index: (ex.answer + 1) % ex.options.length };
    case "translate-tap.l2-l1":
    case "translate-tap.l1-l2":
    case "listen-tap":
      return { tag: "tiles", order: [...ex.solution].reverse().length > 1 ? [...ex.solution].reverse() : ex.tiles.map((_, i) => i).filter((i) => !ex.solution.includes(i)) };
    case "translate-type.l1-l2":
    case "complete-translation":
    case "listen-type":
      return { tag: "text", text: "qqqq zzzz" };
    case "speak.tier-0":
      return { tag: "self-rating", rating: "again" };
    case "match-pairs":
      return undefined;
  }
};

describe.each(VARIANTS)("lessons: %s %s", (id, orthography) => {
  const course = loadCourse(id, orthography);
  const grader = createGrader(course);
  const nodes = lessonNodes(course);

  it("has lesson nodes", () => expect(nodes.length).toBeGreaterThan(2));

  for (const { node } of nodes) {
    describe(node.id, () => {
      const lesson = buildLesson(course, node.id, { seed: 7 });

      it("is deterministic and non-empty, with unique exercise ids", () => {
        expect(lesson.length).toBeGreaterThan(1);
        expect(JSON.stringify(buildLesson(course, node.id, { seed: 7 }))).toBe(JSON.stringify(lesson));
        expect(new Set(lesson.map((e) => e.id)).size).toBe(lesson.length);
      });

      it("accepts each exercise's own solution and rejects a wrong answer", () => {
        for (const ex of lesson) {
          const right = gradeExercise(ex, rightAnswer(ex), grader);
          expect(isCorrect(right.verdict), `${ex.id}: ${right.verdict} ${JSON.stringify(right.notes)}`).toBe(true);
          const wrong = wrongAnswer(ex);
          if (wrong !== undefined && !(wrong.tag === "tiles" && wrong.order.length === 0)) {
            const outcome = gradeExercise(ex, wrong, grader);
            if (wrong.tag !== "tiles") expect(isCorrect(outcome.verdict), `${ex.id} accepted a wrong answer`).toBe(false);
          }
        }
      });

      it("never offers two options that look the same", () => {
        for (const ex of lesson) {
          const options =
            ex.template === "select-image" ? ex.options.map((o) => o.text) : "options" in ex ? ex.options : ex.template === "match-pairs" ? ex.left : [];
          const surfaces = options.map((o) => surfaceOf(o));
          expect(new Set(surfaces).size, ex.id).toBe(surfaces.length);
        }
      });
    });
  }
});

describe("template coverage", () => {
  it("every Phase 3 template appears in some fixture lesson", () => {
    const seen = new Set<TemplateId>();
    for (const [id, orthography] of VARIANTS) {
      const course = loadCourse(id, orthography);
      for (const { node } of lessonNodes(course)) for (const ex of buildLesson(course, node.id, { seed: 7 })) seen.add(ex.template);
    }
    // Listening templates need audio and come from the planner (test/listening.test.ts).
    expect([...seen].sort()).toEqual((Object.keys(TEMPLATES) as TemplateId[]).filter((t) => !LISTENING.has(t)).sort());
  });

  it("can leave speaking out", () => {
    const course = loadCourse("fa");
    for (const { node } of lessonNodes(course)) {
      expect(buildLesson(course, node.id, { seed: 1, exclude: new Set(["speak.tier-0"]) }).some((e) => e.template === "speak.tier-0")).toBe(false);
    }
  });
});

describe("rng", () => {
  it("is seeded and uniform-ish", () => {
    const a = seededRng(42);
    const b = seededRng(42);
    const xs = Array.from({ length: 1000 }, () => a.next());
    expect(xs).toEqual(Array.from({ length: 1000 }, () => b.next()));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(Math.abs(xs.reduce((s, x) => s + x, 0) / xs.length - 0.5)).toBeLessThan(0.05);
  });
});

// ------------------------------------------------------------------------------------ player

/** Runs a shell: executes grade effects with the real grader, collects the rest. */
const run = (course: CourseView, state: PlayerState, events: readonly PlayerEvent[]) => {
  const grader = createGrader(course);
  const effects: Effect[] = [];
  let s = state;
  const dispatch = (e: PlayerEvent): void => {
    const [next, fx] = step(s, e);
    s = next;
    for (const f of fx) {
      effects.push(f);
      if (f.tag === "grade") dispatch({ tag: "graded", outcome: gradeExercise(f.ex, f.response, grader) });
    }
  };
  for (const e of events) dispatch(e);
  return { state: s, effects, dispatch, get: () => s };
};

const answer = (ex: Exercise, response: Response): PlayerEvent[] => {
  switch (response.tag) {
    case "choice":
      return [{ tag: "ready" }, { tag: "input", draft: { tag: "choice", index: response.index } }, { tag: "submit" }];
    case "tiles":
      return [{ tag: "ready" }, { tag: "input", draft: { tag: "tiles", order: response.order } }, { tag: "submit" }];
    case "text":
      return [{ tag: "ready" }, { tag: "input", draft: { tag: "text", text: response.text } }, { tag: "submit" }];
    case "pairs":
      return [
        { tag: "ready" },
        { tag: "input", draft: { tag: "pairs", matched: ex.template === "match-pairs" ? ex.left.map((_, i) => i) : [], mistakes: response.mistakes } },
        { tag: "submit" },
      ];
    case "self-rating":
      return [{ tag: "ready" }, { tag: "input", draft: { tag: "self-rating", rating: response.rating } }, { tag: "submit" }];
  }
};

describe("player", () => {
  const course = loadCourse("fa");
  const node = lessonNodes(course)[2]?.node.id as string;
  const lesson = buildLesson(course, node, { seed: 3 });

  it("plays a lesson of right answers to the end", () => {
    const [s0, fx0] = start(node, lesson);
    const shell = run(course, s0, []);
    for (const ex of lesson) {
      for (const e of [...answer(ex, rightAnswer(ex)), { tag: "continue" } as const]) shell.dispatch(e);
    }
    const end = shell.get();
    expect(end.tag).toBe("finished");
    if (end.tag !== "finished") return;
    expect(end.summary).toEqual({ completed: true, exercises: lesson.length, correctFirstTry: lesson.length, retries: 0, skipped: 0 });
    const types = [...fx0, ...shell.effects].flatMap((f) => (f.tag === "emit" ? [f.event.type] : []));
    expect(types[0]).toBe("session_started");
    expect(types.filter((t) => t === "answer_submitted")).toHaveLength(lesson.length);
    expect(types.at(-1)).toBe("session_completed");
  });

  it("brings a mistake back at the end of the lesson", () => {
    const first = lesson.find((e) => e.template !== "speak.tier-0" && e.template !== "match-pairs" && wrongAnswer(e)?.tag === "choice") as Exercise;
    const [s0] = start(node, [first]);
    const shell = run(course, s0, [...answer(first, wrongAnswer(first) as Response), { tag: "continue" }]);
    const s = shell.get();
    expect(s.tag).toBe("presenting");
    if (s.tag !== "presenting") return;
    expect(s.ex.id).toBe(`${first.id}#2`);
    for (const e of [...answer(s.ex, rightAnswer(s.ex)), { tag: "continue" } as const]) shell.dispatch(e);
    const end = shell.get();
    expect(end.tag === "finished" && end.summary).toEqual({ completed: true, exercises: 1, correctFirstTry: 0, retries: 1, skipped: 0 });
  });

  it("asks each question once when retries are off (placement)", () => {
    const first = lesson.find((e) => e.template !== "speak.tier-0" && e.template !== "match-pairs" && wrongAnswer(e)?.tag === "choice") as Exercise;
    const [s0] = start(node, [first], { retries: false });
    const shell = run(course, s0, [...answer(first, wrongAnswer(first) as Response), { tag: "continue" }]);
    const end = shell.get();
    expect(end.tag === "finished" && end.summary).toEqual({ completed: true, exercises: 1, correctFirstTry: 0, retries: 0, skipped: 0 });
  });

  it("never submits during IME composition, and grades the settled text", () => {
    const typed = lesson.find((e) => e.template === "translate-type.l1-l2") ?? buildLesson(course, node, { seed: 3 }).find((e) => TEMPLATES[e.template].modality.input === "text");
    expect(typed).toBeDefined();
    const ex = typed as Exercise;
    const [s0] = start(node, [ex]);
    const shell = run(course, s0, [{ tag: "ready" }, { tag: "compositionstart" }, { tag: "input", draft: { tag: "text", text: "ک" } }, { tag: "submit" }]);
    const mid = shell.get();
    expect(mid.tag).toBe("answering");
    expect(mid.tag === "answering" && mid.composing).toBe(true);
    expect(shell.effects.some((f) => f.tag === "grade")).toBe(false);
    const settled = ex.template === "complete-translation" ? surfaceOf(ex.blank) : ex.template === "translate-type.l1-l2" ? surfaceOf(ex.canonical) : "";
    shell.dispatch({ tag: "compositionend", text: settled });
    shell.dispatch({ tag: "submit" });
    const after = shell.get();
    expect(after.tag).toBe("feedback");
    expect(after.tag === "feedback" && isCorrect(after.outcome.verdict)).toBe(true);
  });

  it("keeps the draft exactly as typed (no normalization while answering)", () => {
    const ex = lesson.find((e) => TEMPLATES[e.template].modality.input === "text") as Exercise;
    const raw = "  كي  "; // Arabic kaf and yeh, extra spaces: the grader folds them, the draft must not
    const [s0] = start(node, [ex]);
    const shell = run(course, s0, [{ tag: "ready" }, { tag: "input", draft: { tag: "text", text: raw } }]);
    const s = shell.get();
    expect(s.tag === "answering" && s.draft).toEqual({ tag: "text", text: raw });
    expect(responseOf(ex, { tag: "text", text: "   " })).toBeUndefined();
  });

  it("drops the rest of the speaking exercises after can't speak now", () => {
    const speaking = lesson.filter((e) => e.template === "speak.tier-0");
    const other = lesson.find((e) => e.template === "choose-translation" || e.template === "gap-fill") as Exercise;
    const exercises = speaking.length > 0 ? [speaking[0] as Exercise, other, { ...(speaking[0] as Exercise), id: "speak-again" }] : [];
    if (exercises.length === 0) return;
    const [s0] = start(node, exercises);
    const shell = run(course, s0, [{ tag: "ready" }, { tag: "skip", reason: "cant-speak" }]);
    const s = shell.get();
    expect(s.tag === "presenting" && s.ex.id).toBe(other.id);
    expect(s.session.queue.map((e) => e.id)).not.toContain("speak-again");
  });

  it("asks before quitting, and can resume", () => {
    const [s0] = start(node, lesson);
    const shell = run(course, s0, [{ tag: "ready" }, { tag: "interrupt", reason: "quit-confirm" }]);
    expect(shell.get().tag).toBe("interrupted");
    shell.dispatch({ tag: "resume" });
    expect(shell.get().tag).toBe("answering");
    shell.dispatch({ tag: "interrupt", reason: "quit-confirm" });
    shell.dispatch({ tag: "quit" });
    const end = shell.get();
    expect(end.tag === "finished" && end.summary.completed).toBe(false);
  });
});
