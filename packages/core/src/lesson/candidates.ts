/**
 * The cards a session can be made of: every card the templates make of a set of sentences and words.
 * The planner chooses among them, and the card gallery and `sampleExercise` show them: debug mode,
 * stories and tests see cards from what lessons choose among, never cards made their own way.
 */
import type { BundleLexeme, BundleSentence } from "@nabu/schema";
import { lexemesById, lexemesOfUnit } from "./course.ts";
import type { Exercise, TemplateId } from "./exercise.ts";
import { sentencesOf, type LessonNode } from "./nodes.ts";
import { LEXEME_LISTENING, makeMatchPairs, makeSelectImage, SENTENCE_TEMPLATES, type MakeContext } from "./templates.ts";

/**
 * Every card the templates make of these sentences and words, each once, leaving out `exclude`: the
 * words' pictures and clips, matching pairs of them (three or more), then each sentence's cards.
 */
export const candidatesFor = (ctx: MakeContext, sentences: readonly BundleSentence[], lexemes: readonly BundleLexeme[], exclude: ReadonlySet<TemplateId>): Exercise[] => {
  const out: Exercise[] = [];
  const ids = new Set<string>();
  const add = (ex: Exercise | undefined): void => {
    if (ex === undefined || exclude.has(ex.template) || ids.has(ex.id)) return;
    ids.add(ex.id);
    out.push(ex);
  };
  if (!exclude.has("select-image")) for (const lexeme of lexemes) add(makeSelectImage(ctx, lexeme));
  for (const lexeme of lexemes) for (const make of LEXEME_LISTENING) add(make(ctx, lexeme));
  if (!exclude.has("match-pairs") && lexemes.length >= 3) add(makeMatchPairs(ctx, lexemes));
  for (const s of sentences) {
    for (const [template, make] of Object.entries(SENTENCE_TEMPLATES)) {
      if (!exclude.has(template as TemplateId)) add(make(ctx, s));
    }
  }
  return out;
};

/**
 * The cards a lesson makes of its own material, before the review it brings back: its sentences, and
 * its new lexemes, or, where it brings in fewer than three, those and the unit's lexemes the learner
 * has `seen` (so that there are pairs to match).
 */
export const lessonCandidates = (ctx: MakeContext, { unit, node }: LessonNode, seen: ReadonlySet<string>, exclude: ReadonlySet<TemplateId>): Exercise[] => {
  const fresh = node.introduces.flatMap<BundleLexeme>((id) => lexemesById(ctx.course).get(id) ?? []);
  const words = fresh.length >= 3 ? fresh : [...fresh, ...lexemesOfUnit(ctx.course, unit).filter((k) => !fresh.includes(k) && seen.has(k.id))];
  return candidatesFor(ctx, sentencesOf(ctx.course, unit, node), words, exclude);
};
