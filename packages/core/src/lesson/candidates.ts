/**
 * The cards a session can be made of: every card the templates make of a set of sentences and words.
 * The planner chooses among them, and the card gallery and `sampleExercise` show them: debug mode,
 * stories and tests see cards from what lessons choose among, never cards made their own way.
 */
import type { BundleKc, BundleSentence } from "@nabu/schema";
import { allKcs } from "./course.ts";
import type { Exercise, TemplateId } from "./exercise.ts";
import { sentencesOf, type LessonNode } from "./nodes.ts";
import { KC_LISTENING, makeMatchPairs, makeSelectImage, SENTENCE_TEMPLATES, type MakeContext } from "./templates.ts";

/**
 * Every card the templates make of these sentences and words, each once, leaving out `exclude`: the
 * words' pictures and clips, matching pairs of them (three or more), then each sentence's cards.
 */
export const candidatesFor = (ctx: MakeContext, sentences: readonly BundleSentence[], kcs: readonly BundleKc[], exclude: ReadonlySet<TemplateId>): Exercise[] => {
  const out: Exercise[] = [];
  const ids = new Set<string>();
  const add = (ex: Exercise | undefined): void => {
    if (ex === undefined || exclude.has(ex.template) || ids.has(ex.id)) return;
    ids.add(ex.id);
    out.push(ex);
  };
  if (!exclude.has("select-image")) for (const kc of kcs) add(makeSelectImage(ctx, kc));
  for (const kc of kcs) for (const make of KC_LISTENING) add(make(ctx, kc));
  if (!exclude.has("match-pairs") && kcs.length >= 3) add(makeMatchPairs(ctx, kcs));
  for (const s of sentences) {
    for (const [template, make] of Object.entries(SENTENCE_TEMPLATES)) {
      if (!exclude.has(template as TemplateId)) add(make(ctx, s));
    }
  }
  return out;
};

/**
 * The cards a lesson makes of its own material, before the review it brings back: its sentences, and
 * its new words, or, where it brings in fewer than three, those and the unit's words the learner has
 * `seen` (so that there are pairs to match).
 */
export const lessonCandidates = (ctx: MakeContext, { unit, node }: LessonNode, seen: ReadonlySet<string>, exclude: ReadonlySet<TemplateId>): Exercise[] => {
  const fresh = node.introduces.flatMap<BundleKc>((id) => allKcs(ctx.course).find((k) => k.id === id) ?? []);
  const words = fresh.length >= 3 ? fresh : [...fresh, ...unit.kcs.filter((k) => !fresh.includes(k) && seen.has(k.id))];
  return candidatesFor(ctx, sentencesOf(ctx.course, unit, node), words, exclude);
};
