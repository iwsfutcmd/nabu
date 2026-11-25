/**
 * Placement (gameplan §9.5; ADR 0039, adaptive since ADR 0077, stricter since ADR 0158). A test
 * that finds how far into the path a learner already is, in a few dozen questions however long
 * the course.
 *
 * - **A block per unit**: up to four probes from the unit's lesson nodes, later nodes first, each
 *   built from the node's own sentences. Every probe is production (into the target), typed unless
 *   the course asks for tiles: recognizing a sentence among a few, or guessing one, never places a
 *   learner. Only a node that can make no production probe is probed by recognition, and then by
 *   the word bank, never by a multiple choice. A block is passed with three of four right the
 *   first time.
 * - **The search** (lesson/adaptive.ts): units 1, 2, 4, 8, 16, … until one is not passed, then
 *   bisection between the last passed and the first not passed; then up to two units the search
 *   skipped over are asked, to check them. Every unit up to the last one passed counts as known:
 *   its lessons and its story.
 * - **Inside the first unit not passed**, two production probes per lesson node, in order, until
 *   one is missed: the learner also places out of the nodes whose probes were all right.
 *
 * Each question is asked once. A course whose learners cannot be asked to type (no keyboard for
 * the script yet) may ask for word tiles instead (`placement: {production: tiles}`).
 */
import type { BundleSentence } from "@nabu/schema";
import { placedBy, type AdaptiveTest, type TestBlock } from "../lesson/adaptive.ts";
import { lessonNodes, sentencesOf, type LessonNode } from "../lesson/nodes.ts";
import type { CourseView } from "../lesson/course.ts";
import type { Exercise, TemplateId } from "../lesson/exercise.ts";
import { seededRng } from "../lesson/rng.ts";
import { SENTENCE_TEMPLATES, type MakeContext } from "../lesson/templates.ts";
import { pathNodes } from "./path.ts";

/** Probe templates, most preferred first. Recognition only where a node can make no production probe. */
const RECOGNIZE: readonly TemplateId[] = ["translate-tap.l2-l1"];
const PRODUCE_TILES: readonly TemplateId[] = ["translate-tap.l1-l2", "translate-type.l1-l2", "complete-translation"];
const PRODUCE_TYPED: readonly TemplateId[] = ["translate-type.l1-l2", "complete-translation", "translate-tap.l1-l2"];

/** Probes a block asks at most, and the share it needs right. */
export const BLOCK_SIZE = 4;
export const PASS_SHARE = 0.75;
/** Probes a lesson node's step asks, all to be right, inside the first unit not passed. */
export const STEP_SIZE = 2;
/** Units the search skipped over that it asks afterwards, to check them. */
export const CHECKS = 2;

export interface PlacementTest {
  readonly test: AdaptiveTest;
}

/** Up to `k` of `n` indices, evenly spread and ending on the last: 6 → 1, 2, 4, 5. */
const spread = (n: number, k: number): readonly number[] =>
  n <= k ? Array.from({ length: n }, (_, i) => i) : Array.from({ length: k }, (_, i) => Math.round(((i + 1) * n) / k) - 1);

export const placementTest = (course: CourseView, seed: number, exclude: ReadonlySet<TemplateId> = new Set()): PlacementTest => {
  const rng = seededRng(seed);
  const produce = course.placement?.production === "tiles" ? PRODUCE_TILES : PRODUCE_TYPED;
  const used = new Set<string>();
  const usedItems = new Set<string>();
  // The sentences that use most of what a node introduces probe it best; a sentence not asked yet first.
  const ranked = ({ unit, node }: LessonNode): readonly BundleSentence[] => {
    const score = (s: BundleSentence): number => node.introduces.filter((k) => s.parts.includes(k)).length;
    const all = [...sentencesOf(course, unit, node)].sort((a, b) => score(b) - score(a));
    return [...all.filter((s) => !usedItems.has(s.id)), ...all.filter((s) => usedItems.has(s.id))];
  };
  const probe = (n: LessonNode, templates: readonly TemplateId[]): Exercise | undefined => {
    const ctx: MakeContext = { course, rng, introduced: [] };
    const sentences = ranked(n);
    const ex = templates
      .filter((t) => !exclude.has(t))
      .flatMap((t) => sentences.map((s) => SENTENCE_TEMPLATES[t]?.(ctx, s)))
      .find((e): e is Exercise => e !== undefined && !used.has(e.id));
    if (ex !== undefined) {
      used.add(ex.id);
      usedItems.add(ex.item);
    }
    return ex;
  };

  const byUnit = new Map<string, LessonNode[]>();
  for (const n of lessonNodes(course)) byUnit.set(n.unit.id, [...(byUnit.get(n.unit.id) ?? []), n]);
  const blocks: TestBlock[] = [];
  for (const [unit, nodes] of byUnit) {
    const chosen = spread(nodes.length, BLOCK_SIZE).map((i) => nodes[i] as LessonNode);
    const exercises: Exercise[] = [];
    const produced = new Map<string, Exercise[]>();
    for (let slot = 0; slot < BLOCK_SIZE && chosen.length > 0; slot++) {
      // Later nodes first.
      const n = chosen[chosen.length - 1 - (slot % chosen.length)] as LessonNode;
      const ex = probe(n, produce) ?? probe(n, RECOGNIZE);
      if (ex === undefined) continue;
      exercises.push(ex);
      if (produce.includes(ex.template)) produced.set(n.node.id, [...(produced.get(n.node.id) ?? []), ex]);
    }
    // Production probes per node, in order: the block's own first, so their answers count.
    const steps = nodes.flatMap((n) => {
      const own = (produced.get(n.node.id) ?? []).slice(0, STEP_SIZE);
      const more: Exercise[] = [];
      while (own.length + more.length < STEP_SIZE) {
        const ex = probe(n, produce);
        if (ex === undefined) break;
        more.push(ex);
      }
      const all = [...own, ...more];
      return all.length === 0 ? [] : [{ id: n.node.id, exercises: all }];
    });
    // A unit passed places out of its whole path: its lessons and its story, so the next unit opens.
    const places = pathNodes(course).filter((p) => p.unit.id === unit).map((p) => p.node.id);
    if (exercises.length > 0) blocks.push({ id: unit, exercises, places, steps });
  }
  return { test: { blocks, pass: PASS_SHARE, confirm: CHECKS } };
};

/** The lesson nodes a placement test's first-try answers (exercise id → right) place the learner out of. */
export const placementOf = (test: PlacementTest, firstTry: ReadonlyMap<string, boolean>): readonly string[] => placedBy(test.test, firstTry);
