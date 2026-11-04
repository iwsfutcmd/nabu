/**
 * The Phase 3 lesson builder: a deterministic stand-in for the session planner
 * (§9.4, Phase 4). A lesson is one path node. New words come first (a picture,
 * then matching pairs), then one exercise per sentence, rotating through the
 * templates so a lesson mixes recognition and production, then the reading
 * drills where the orthography has a ruby layer. Same course, node and seed,
 * same lesson.
 */
import type {
  BundleKc,
  BundleNode,
  BundleSentence,
  BundleUnit,
} from "@nabu/schema";
import { allKcs, type CourseView } from "./course.ts";
import type { Exercise, TemplateId } from "./exercise.ts";
import { toneSystemOf } from "../speech/score.ts";
import { seededRng } from "./rng.ts";
import {
  KC_TEMPLATES,
  makeCharRead,
  makeMatchPairs,
  makeReadingDisambiguation,
  makeSelectImage,
  makeSpeakScored,
  makeToneIdentify,
  SENTENCE_TEMPLATES,
  TEMPLATES,
  type MakeContext,
} from "./templates.ts";

/**
 * What the app can do with speech (§10.4): score it (tones on the device for tonal courses, words
 * and phones on a speech server), and offer tone listening. Without it, speaking is tier 0.
 */
export interface SpeechSupport {
  /** Speaking is scored: `speak` and `listen-speak` replace self-rated `speak.tier-0`. */
  readonly scored: boolean;
  /** Tone exercises (tone-identify) for courses whose readings carry tones. */
  readonly tones: boolean;
}

/**
 * What the app can do with speech for a course: score it when the course's readings carry tones
 * (tier 3 on the device) or the server scores the orthography (tiers 1–2); tone exercises always.
 */
export const speechSupportOf = (
  course: CourseView,
  serverTiers: number,
): SpeechSupport => ({
  scored:
    serverTiers > 0 ||
    course.units.some((u) =>
      u.sentences.some((s) => {
        const text = s.forms[course.orthography]?.text;
        return text !== undefined && toneSystemOf(text) !== undefined;
      }),
    ),
  tones: true,
});

/** The templates a speech support rules out. */
export const speechExclusions = (
  speech: SpeechSupport | undefined,
): ReadonlySet<TemplateId> =>
  new Set<TemplateId>([
    ...(speech?.scored === true
      ? (["speak.tier-0"] as const)
      : (["speak", "listen-speak"] as const)),
    ...(speech?.tones === true ? [] : (["tone-identify"] as const)),
  ]);

export interface LessonNode {
  readonly unit: BundleUnit;
  readonly node: BundleNode;
}

export const sentencesOf = (
  course: CourseView,
  unit: BundleUnit,
  node: BundleNode,
): readonly BundleSentence[] =>
  node.sentences
    .flatMap((id) => unit.sentences.find((s) => s.id === id) ?? [])
    .filter((s) => s.forms[course.orthography] !== undefined);

/** Nodes a lesson can be built from, in path order (script-convert and other node kinds come later). */
export const lessonNodes = (course: CourseView): readonly LessonNode[] =>
  course.units.flatMap((unit) =>
    unit.nodes
      .filter(
        (node) =>
          (node.kind === "lesson" || node.kind === "practice") &&
          sentencesOf(course, unit, node).length > 0,
      )
      .map((node) => ({ unit, node })),
  );

export interface LessonOptions {
  readonly seed: number;
  /** Templates the learner cannot do right now ("can't speak now" removes speaking). */
  readonly exclude?: ReadonlySet<TemplateId>;
  readonly maxExercises?: number;
  /** What the app can do with speech; without it, speaking is self-rated (tier 0). */
  readonly speech?: SpeechSupport | undefined;
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

export const buildLesson = (
  course: CourseView,
  nodeId: string,
  options: LessonOptions,
): readonly Exercise[] => {
  const found = lessonNodes(course).find((n) => n.node.id === nodeId);
  if (found === undefined)
    throw new Error(`no lesson node ${nodeId} in ${course.id}`);
  const { unit, node } = found;
  const rng = seededRng(options.seed);
  const ctx: MakeContext = { course, rng, introduced: node.introduces };
  const excluded = new Set([
    ...(options.exclude ?? []),
    ...speechExclusions(options.speech),
  ]);
  const allowed = (t: TemplateId): boolean => !excluded.has(t);
  const out: Exercise[] = [];
  const used = new Set<TemplateId>();
  const push = (ex: Exercise | undefined): void => {
    if (
      ex !== undefined &&
      allowed(ex.template) &&
      !out.some((e) => e.id === ex.id)
    ) {
      out.push(ex);
      used.add(ex.template);
    }
  };

  // New words: a picture, then pairs.
  const fresh = node.introduces.flatMap<BundleKc>(
    (id) => allKcs(course).find((k) => k.id === id) ?? [],
  );
  if (allowed("select-image"))
    push(
      fresh.map((kc) => makeSelectImage(ctx, kc)).find((e) => e !== undefined),
    );
  if (allowed("match-pairs")) {
    const pool =
      fresh.length >= 3
        ? fresh
        : [...fresh, ...unit.kcs.filter((k) => !fresh.includes(k))];
    push(makeMatchPairs(ctx, pool));
  }

  // One exercise per sentence; templates not used yet first.
  const sentences = sentencesOf(course, unit, node);
  const offset = rng.int(ROTATION.length);
  for (const [i, sentence] of sentences.entries()) {
    const rotated = ROTATION.map(
      (_, k) => ROTATION[(offset + i + k) % ROTATION.length] as TemplateId,
    );
    const ordered = [
      ...rotated.filter((t) => !used.has(t)),
      ...rotated.filter((t) => used.has(t)),
    ];
    for (const slot of ordered) {
      // The rotation keeps its length (it seeds the order); scored speaking takes tier 0's slot.
      const template: TemplateId =
        slot === "speak.tier-0" && options.speech?.scored === true
          ? "speak"
          : slot;
      if (!allowed(template)) continue;
      const ex =
        template === "speak"
          ? makeSpeakScored(ctx, sentence)
          : SENTENCE_TEMPLATES[template]?.(ctx, sentence);
      if (ex !== undefined && !out.some((e) => e.id === ex.id)) {
        push(ex);
        used.add(slot); // the rotation slot, so a substituted template counts as its slot
        break;
      }
    }
  }

  // Reading drills where the orthography has a ruby layer (yue: Jyutping).
  if (allowed("char-read"))
    push(
      sentences.map((s) => makeCharRead(ctx, s)).find((e) => e !== undefined),
    );
  if (allowed("reading-disambiguation"))
    push(
      sentences
        .map((s) => makeReadingDisambiguation(ctx, s))
        .find((e) => e !== undefined),
    );
  // Hearing tones, where the course's readings carry them and a one-syllable clip exists.
  if (allowed("tone-identify"))
    push(
      sentences
        .map((s) => makeToneIdentify(ctx, s))
        .find((e) => e !== undefined),
    );

  return out.slice(0, options.maxExercises ?? 14);
};

/** One card of a kind, or none where the course cannot make that kind. */
export interface GalleryCard {
  readonly template: TemplateId;
  readonly exercise: Exercise | undefined;
}

/**
 * One card of every kind the course can make, for debug mode: each template's first instance
 * (what a lesson builds, else the first sentence or word that makes one). Story questions belong
 * to stories and are left out; a kind the course has no material for comes back without a card.
 */
export const cardGallery = (course: CourseView, seed = 1): readonly GalleryCard[] => {
  const rng = seededRng(seed);
  const nodes = lessonNodes(course);
  const ctxOf = (node: string | undefined): MakeContext => ({ course, rng, introduced: nodes.find((n) => n.node.id === node)?.node.introduces ?? [] });
  const sentences = nodes.flatMap(({ unit, node }) => sentencesOf(course, unit, node).map((s) => ({ s, node: node.id })));
  const kcs = allKcs(course);
  const introducedIn = (kc: BundleKc): string | undefined => nodes.find((n) => n.node.introduces.includes(kc.id))?.node.id;
  const first = <T,>(items: readonly T[], make: (item: T) => Exercise | undefined): Exercise | undefined => {
    for (const item of items) {
      const ex = make(item);
      if (ex !== undefined) return ex;
    }
    return undefined;
  };
  return (Object.keys(TEMPLATES) as TemplateId[])
    .filter((t) => !t.startsWith("story-"))
    .map((template): GalleryCard => {
      const sentence = SENTENCE_TEMPLATES[template];
      const word = KC_TEMPLATES[template];
      const exercise =
        template === "match-pairs"
          ? makeMatchPairs(ctxOf(nodes[0]?.node.id), kcs.filter((k) => (k.forms?.[course.orthography]?.length ?? 0) > 0).slice(0, 5))
          : sentence !== undefined
            ? first(sentences, ({ s, node }) => sentence(ctxOf(node), s))
            : word !== undefined
              ? first(kcs, (k) => word(ctxOf(introducedIn(k)), k))
              : undefined;
      return { template, exercise };
    });
};

/**
 * The first exercise of `template` that the course's lessons produce (seeded),
 * for stories, tests and previews. Undefined when no lesson can make one.
 */
export const sampleExercise = (
  course: CourseView,
  template: TemplateId,
  seed = 1,
): Exercise | undefined => {
  for (const { node } of lessonNodes(course)) {
    const found = buildLesson(course, node.id, { seed }).find(
      (e) => e.template === template,
    );
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
