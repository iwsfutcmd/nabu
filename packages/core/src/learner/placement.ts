/**
 * Placement (gameplan §9.5; ADR 0039, adaptive since ADR 0076). A test that finds how far into
 * the path a learner already is, in a few dozen questions however long the course.
 *
 * - **A block per unit**: up to four probes from the unit's lesson nodes, later nodes first,
 *   alternating production and recognition, each built from the node's own sentences. A block
 *   is passed with three of four right the first time.
 * - **The search** (lesson/adaptive.ts): units 1, 2, 4, 8, 16, … until one is not passed, then
 *   bisection between the last passed and the first not passed. Every unit up to the last one
 *   passed counts as known: its lessons and its story.
 * - **Inside the first unit not passed**, one production probe per lesson node, in order, until
 *   one is missed: the learner also places out of the nodes before it.
 *
 * Each question is asked once. Production is checked with word tiles by default; a course whose
 * learners most need spelling checked (heritage speakers) asks for it typed
 * (`placement: {production: typed}`).
 */
import type { BundleSentence } from "@nabu/schema";
import { placedBy, type AdaptiveTest, type TestBlock } from "../lesson/adaptive.ts";
import { lessonNodes, sentencesOf, type LessonNode } from "../lesson/build.ts";
import type { CourseView } from "../lesson/course.ts";
import type { Exercise, TemplateId } from "../lesson/exercise.ts";
import { seededRng } from "../lesson/rng.ts";
import { SENTENCE_TEMPLATES, type MakeContext } from "../lesson/templates.ts";
import { pathNodes } from "./path.ts";

/** Probe templates, most preferred first. */
const RECOGNIZE: readonly TemplateId[] = ["choose-translation", "translate-tap.l2-l1"];
const PRODUCE_TILES: readonly TemplateId[] = ["translate-tap.l1-l2", "translate-type.l1-l2", "complete-translation"];
const PRODUCE_TYPED: readonly TemplateId[] = ["translate-type.l1-l2", "complete-translation", "translate-tap.l1-l2"];

/** Probes a block asks at most, and the share it needs right. */
export const BLOCK_SIZE = 4;
export const PASS_SHARE = 0.75;

export interface PlacementTest {
  readonly test: AdaptiveTest;
}

/** Up to `k` of `n` indices, evenly spread and ending on the last: 6 → 1, 2, 4, 5. */
const spread = (n: number, k: number): readonly number[] =>
  n <= k ? Array.from({ length: n }, (_, i) => i) : Array.from({ length: k }, (_, i) => Math.round(((i + 1) * n) / k) - 1);

export const placementTest = (course: CourseView, seed: number, exclude: ReadonlySet<TemplateId> = new Set()): PlacementTest => {
  const rng = seededRng(seed);
  const produce = course.placement?.production === "typed" ? PRODUCE_TYPED : PRODUCE_TILES;
  const used = new Set<string>();
  // The sentences that use most of what a node introduces probe it best.
  const ranked = ({ unit, node }: LessonNode): readonly BundleSentence[] =>
    [...sentencesOf(course, unit, node)].sort((a, b) => node.introduces.filter((k) => b.kcs.includes(k)).length - node.introduces.filter((k) => a.kcs.includes(k)).length);
  const probe = (n: LessonNode, templates: readonly TemplateId[], fresh: boolean): Exercise | undefined => {
    const ctx: MakeContext = { course, rng, introduced: [] };
    const sentences = ranked(n);
    return templates
      .filter((t) => !exclude.has(t))
      .flatMap((t) => sentences.map((s) => SENTENCE_TEMPLATES[t]?.(ctx, s)))
      .find((ex): ex is Exercise => ex !== undefined && (!fresh || !used.has(ex.id)));
  };

  const byUnit = new Map<string, LessonNode[]>();
  for (const n of lessonNodes(course)) byUnit.set(n.unit.id, [...(byUnit.get(n.unit.id) ?? []), n]);
  const blocks: TestBlock[] = [];
  for (const [unit, nodes] of byUnit) {
    const chosen = spread(nodes.length, BLOCK_SIZE).map((i) => nodes[i] as LessonNode);
    const exercises: Exercise[] = [];
    const produced = new Map<string, Exercise>();
    for (let slot = 0; slot < BLOCK_SIZE && chosen.length > 0; slot++) {
      // Later nodes first; production, then recognition, then production…
      const n = chosen[chosen.length - 1 - (slot % chosen.length)] as LessonNode;
      const wanted = slot % 2 === 0 ? produce : RECOGNIZE;
      const ex = probe(n, wanted, true) ?? probe(n, slot % 2 === 0 ? RECOGNIZE : produce, true);
      if (ex === undefined) continue;
      used.add(ex.id);
      exercises.push(ex);
      if (produce.includes(ex.template) && !produced.has(n.node.id)) produced.set(n.node.id, ex);
    }
    // One production probe per node, in order: the block's own where it has one, so its answer counts.
    const steps = nodes.flatMap((n) => {
      const ex = produced.get(n.node.id) ?? probe(n, produce, true);
      if (ex === undefined) return [];
      used.add(ex.id);
      return [{ id: n.node.id, exercise: ex }];
    });
    // A unit passed places out of its whole path: its lessons and its story, so the next unit opens.
    const places = pathNodes(course).filter((p) => p.unit.id === unit).map((p) => p.node.id);
    if (exercises.length > 0) blocks.push({ id: unit, exercises, places, steps });
  }
  return { test: { blocks, pass: PASS_SHARE } };
};

/** The lesson nodes a placement test's first-try answers (exercise id → right) place the learner out of. */
export const placementOf = (test: PlacementTest, firstTry: ReadonlyMap<string, boolean>): readonly string[] => placedBy(test.test, firstTry);
