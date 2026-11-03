/**
 * Placement v0 (gameplan §9.5). A short test that probes each lesson node in
 * path order: one recognition item and one production item built from the
 * node's own sentences. Each is asked once (no retries). The learner places
 * through the longest run of nodes, from the start, whose probes were all
 * right the first time; those nodes count as done.
 *
 * v0 is not adaptive: it asks every node's probes, which is fine for a unit
 * of six nodes. An adaptive test (stop after a miss, jump ahead after
 * streaks) driven by the performance model comes with more content.
 */
import { lessonNodes, sentencesOf } from "../lesson/build.ts";
import type { CourseView } from "../lesson/course.ts";
import type { Exercise, TemplateId } from "../lesson/exercise.ts";
import { seededRng } from "../lesson/rng.ts";
import { SENTENCE_TEMPLATES, type MakeContext } from "../lesson/templates.ts";

/** Probe templates, most preferred first. Production is checked with tiles where typing would be slow. */
const RECOGNIZE: readonly TemplateId[] = ["choose-translation", "translate-tap.l2-l1"];
const PRODUCE: readonly TemplateId[] = ["translate-tap.l1-l2", "translate-type.l1-l2", "complete-translation"];

export interface PlacementTest {
  readonly exercises: readonly Exercise[];
  /** The lesson node each exercise probes. */
  readonly probes: readonly string[];
}

export const placementTest = (course: CourseView, seed: number, exclude: ReadonlySet<TemplateId> = new Set()): PlacementTest => {
  const rng = seededRng(seed);
  const exercises: Exercise[] = [];
  const probes: string[] = [];
  for (const { unit, node } of lessonNodes(course)) {
    const ctx: MakeContext = { course, rng, introduced: [] };
    // The sentences that use most of what the node introduces probe it best.
    const sentences = [...sentencesOf(course, unit, node)].sort((a, b) => node.introduces.filter((k) => b.kcs.includes(k)).length - node.introduces.filter((k) => a.kcs.includes(k)).length);
    for (const kind of [RECOGNIZE, PRODUCE]) {
      const probe = kind
        .filter((t) => !exclude.has(t))
        .flatMap((t) => sentences.map((s) => SENTENCE_TEMPLATES[t]?.(ctx, s)))
        .find((ex): ex is Exercise => ex !== undefined && !exercises.some((e) => e.id === ex.id));
      if (probe === undefined) continue;
      exercises.push(probe);
      probes.push(node.id);
    }
  }
  return { exercises, probes };
};

/**
 * The nodes a finished placement test places the learner out of: the longest
 * prefix of probed nodes whose exercises were all right on the first try.
 */
export const placementOf = (test: PlacementTest, firstTry: ReadonlyMap<string, boolean>): readonly string[] => {
  const placed: string[] = [];
  const nodes = [...new Set(test.probes)];
  for (const node of nodes) {
    const ids = test.exercises.filter((_, i) => test.probes[i] === node).map((e) => e.id);
    if (!ids.every((id) => firstTry.get(id) === true)) break;
    placed.push(node);
  }
  return placed;
};
