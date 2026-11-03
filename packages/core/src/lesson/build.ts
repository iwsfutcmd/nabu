/**
 * The Phase 3 lesson builder: a deterministic stand-in for the session planner
 * (§9.4, Phase 4). A lesson is one path node. New words come first (a picture,
 * then matching pairs), then one exercise per sentence, rotating through the
 * templates so a lesson mixes recognition and production, then the reading
 * drills where the orthography has a ruby layer. Same course, node and seed,
 * same lesson.
 */
import type { BundleKc, BundleNode, BundleSentence, BundleUnit } from "@nabu/schema";
import { allKcs, type CourseView } from "./course.ts";
import type { Exercise, TemplateId } from "./exercise.ts";
import { seededRng } from "./rng.ts";
import {
  makeCharRead,
  makeMatchPairs,
  makeReadingDisambiguation,
  makeSelectImage,
  SENTENCE_TEMPLATES,
  type MakeContext,
} from "./templates.ts";

export interface LessonNode {
  readonly unit: BundleUnit;
  readonly node: BundleNode;
}

export const sentencesOf = (course: CourseView, unit: BundleUnit, node: BundleNode): readonly BundleSentence[] =>
  node.sentences.flatMap((id) => unit.sentences.find((s) => s.id === id) ?? []).filter((s) => s.forms[course.orthography] !== undefined);

/** Nodes a lesson can be built from, in path order (script-convert and other node kinds come later). */
export const lessonNodes = (course: CourseView): readonly LessonNode[] =>
  course.units.flatMap((unit) =>
    unit.nodes.filter((node) => (node.kind === "lesson" || node.kind === "practice") && sentencesOf(course, unit, node).length > 0).map((node) => ({ unit, node })),
  );

export interface LessonOptions {
  readonly seed: number;
  /** Templates the learner cannot do right now ("can't speak now" removes speak.tier-0). */
  readonly exclude?: ReadonlySet<TemplateId>;
  readonly maxExercises?: number;
}

/** Sentence templates in rotation order: recognition before production. */
const ROTATION: readonly TemplateId[] = [
  "choose-translation",
  "translate-tap.l2-l1",
  "translate-tap.l1-l2",
  "gap-fill",
  "translate-type.l1-l2",
  "complete-translation",
  "speak.tier-0",
];

export const buildLesson = (course: CourseView, nodeId: string, options: LessonOptions): readonly Exercise[] => {
  const found = lessonNodes(course).find((n) => n.node.id === nodeId);
  if (found === undefined) throw new Error(`no lesson node ${nodeId} in ${course.id}`);
  const { unit, node } = found;
  const rng = seededRng(options.seed);
  const ctx: MakeContext = { course, rng, introduced: node.introduces };
  const allowed = (t: TemplateId): boolean => !(options.exclude?.has(t) ?? false);
  const out: Exercise[] = [];
  const used = new Set<TemplateId>();
  const push = (ex: Exercise | undefined): void => {
    if (ex !== undefined && allowed(ex.template) && !out.some((e) => e.id === ex.id)) {
      out.push(ex);
      used.add(ex.template);
    }
  };

  // New words: a picture, then pairs.
  const fresh = node.introduces.flatMap<BundleKc>((id) => allKcs(course).find((k) => k.id === id) ?? []);
  if (allowed("select-image")) push(fresh.map((kc) => makeSelectImage(ctx, kc)).find((e) => e !== undefined));
  if (allowed("match-pairs")) {
    const pool = fresh.length >= 3 ? fresh : [...fresh, ...unit.kcs.filter((k) => !fresh.includes(k))];
    push(makeMatchPairs(ctx, pool));
  }

  // One exercise per sentence; templates not used yet first.
  const sentences = sentencesOf(course, unit, node);
  const offset = rng.int(ROTATION.length);
  for (const [i, sentence] of sentences.entries()) {
    const rotated = ROTATION.map((_, k) => ROTATION[(offset + i + k) % ROTATION.length] as TemplateId);
    const ordered = [...rotated.filter((t) => !used.has(t)), ...rotated.filter((t) => used.has(t))];
    for (const template of ordered) {
      if (!allowed(template)) continue;
      const ex = SENTENCE_TEMPLATES[template]?.(ctx, sentence);
      if (ex !== undefined && !out.some((e) => e.id === ex.id)) {
        push(ex);
        break;
      }
    }
  }

  // Reading drills where the orthography has a ruby layer (yue: Jyutping).
  if (allowed("char-read")) push(sentences.map((s) => makeCharRead(ctx, s)).find((e) => e !== undefined));
  if (allowed("reading-disambiguation")) push(sentences.map((s) => makeReadingDisambiguation(ctx, s)).find((e) => e !== undefined));

  return out.slice(0, options.maxExercises ?? 14);
};

/**
 * The first exercise of `template` that the course's lessons produce (seeded),
 * for stories, tests and previews. Undefined when no lesson can make one.
 */
export const sampleExercise = (course: CourseView, template: TemplateId, seed = 1): Exercise | undefined => {
  for (const { node } of lessonNodes(course)) {
    const found = buildLesson(course, node.id, { seed }).find((e) => e.template === template);
    if (found !== undefined) return found;
  }
  const rng = seededRng(seed);
  for (const { unit, node } of lessonNodes(course)) {
    const ctx: MakeContext = { course, rng, introduced: node.introduces };
    for (const s of sentencesOf(course, unit, node)) {
      const ex = SENTENCE_TEMPLATES[template]?.(ctx, s);
      if (ex !== undefined) return ex;
    }
  }
  return undefined;
};
