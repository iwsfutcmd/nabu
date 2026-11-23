/**
 * Cards of each kind a course makes, for debug mode's card gallery, stories, tests and previews.
 * They are the cards lessons plan among (`lessonCandidates`, the planner's own enumerator), lesson
 * by lesson in path order, for a learner who has met nothing else: so a kind shows here only where
 * a lesson has it to choose. A script track's kinds come from its alphabet nodes
 * (`scriptCandidates`), as their sessions plan them.
 */
import type { Result } from "../result.ts";
import { allSentences, lexemesById, type CourseView } from "./course.ts";
import { lessonCandidates } from "./candidates.ts";
import type { Exercise, TemplateId } from "./exercise.ts";
import { courseExclusions } from "./exclusions.ts";
import { lexemeIdsOf } from "./lexemes.ts";
import { lessonNodes, sentencesOf } from "./nodes.ts";
import { seededRng, type Rng } from "./rng.ts";
import { SCRIPT_TEMPLATES, scriptCandidates, scriptNodes } from "./script.ts";
import { LEXEME_TEMPLATES, makeMatchPairs, SENTENCE_TEMPLATES, TEMPLATES } from "./templates.ts";

/** One card of a kind, or none where the course cannot make that kind. */
export interface GalleryCard {
  readonly template: TemplateId;
  readonly exercise: Exercise | undefined;
}

const KINDS = Object.keys(TEMPLATES) as TemplateId[];
const NONE_SEEN: ReadonlySet<string> = new Set();

/**
 * The first card of `template` the course's lessons make: each lesson, in path order, makes its
 * cards as a plan that may use only that kind does (its own rng, seeded with `seed`), until one
 * makes one (one that `where` admits, where given: a spelling card of two options). Undefined
 * where the course rules the kind out or cannot make it.
 */
export const sampleExercise = (course: CourseView, template: TemplateId, seed = 1, where: (ex: Exercise) => boolean = () => true): Exercise | undefined => {
  if (courseExclusions(course).has(template)) return undefined;
  const others = new Set(KINDS.filter((t) => t !== template));
  if (SCRIPT_TEMPLATES.has(template)) {
    for (const at of scriptNodes(course)) {
      const found = scriptCandidates({ course, rng: seededRng(seed), introduced: at.node.introduces }, at, others).find(where);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  for (const at of lessonNodes(course)) {
    const found = lessonCandidates({ course, rng: seededRng(seed), introduced: at.node.introduces }, at, NONE_SEEN, others).find(where);
    if (found !== undefined) return found;
  }
  return undefined;
};

/**
 * One card of every kind the course can make, for debug mode: each kind's `sampleExercise`. Story
 * questions belong to stories and are left out, as is every kind the course rules out
 * (`courseExclusions`); a kind the course has no material for comes back without a card.
 */
export const cardGallery = (course: CourseView, seed = 1): readonly GalleryCard[] => {
  const excluded = courseExclusions(course);
  return KINDS.filter((t) => !t.startsWith("story-") && !excluded.has(t)).map((template): GalleryCard => ({ template, exercise: sampleExercise(course, template, seed) }));
};

/**
 * A card's id across the app (debug mode): its course, its orthography as the app's address writes it, and
 * the exercise's own id, so one id names one card whatever course it comes from:
 * tok/tok-Qaap.sitelen-pona/choose-translation:s.u03.17.
 */
export const cardId = (course: Pick<CourseView, "id" | "orthography">, ex: Pick<Exercise, "id">): string => `${course.id}/${course.orthography.replace("/", ".")}/${ex.id}`;

/** A card id's three parts: its course, its orthography (as the course writes it) and the exercise's own id. */
export interface CardIdParts {
  readonly course: string;
  readonly orthography: string;
  readonly exercise: string;
}

/**
 * A pasted card id (`cardId`) taken apart: undefined where it is not one (no course or orthography before
 * the exercise's id, or no kind in it). Space around it is left out, as a paste brings it.
 */
export const parseCardId = (text: string): CardIdParts | undefined => {
  const [course, orthography, ...rest] = text.trim().split("/");
  const exercise = rest.join("/");
  if (course === undefined || course === "" || orthography === undefined || !orthography.includes(".") || !exercise.includes(":")) return undefined;
  return { course, orthography: orthography.replace(".", "/"), exercise };
};

/** Why a card id cannot be made a card of the course. */
export type CardIdError =
  /** Not an exercise's id: no kind before its item. */
  | "unreadable"
  /** No kind of card has that name. */
  | "unknown-kind"
  /** The course rules the kind out (a facet it does not practise, a voice it does not trust). */
  | "excluded"
  /** The course makes no card of that kind with that id now (its sentence or word is gone, or changed). */
  | "not-made";

/** Seeds tried, from the one given, for a card the lessons draw from several items (a script track's letter pairs). */
const SEEDS = 12;

/** A seeded rng whose first shuffle keeps the order given: a pairs card's words in the order its id lists them. */
const inOrder = (seed: number): Rng => {
  const rng = seededRng(seed);
  let first = true;
  return {
    ...rng,
    shuffle: <T>(items: readonly T[]): readonly T[] => {
      if (!first) return rng.shuffle(items);
      first = false;
      return [...items];
    },
  };
};

/**
 * The card an exercise id names, made again as the course makes it (debug mode: a card id pasted in). Its
 * kind, its sentence or lexeme, and the word it asks where its id names one (`char-read:s.1:چای`) are the
 * id's; what the id does not say comes from `seed`, so one id always makes one card: which word a gap-fill
 * leaves out (the lesson's own choice for a learner new to it), and the wrong options and their order. A
 * card's link (card-link.ts) carries the card itself, exactly. A retry's `#n` is left out: it is the same
 * card. A pairs card is made of the words its id lists, in that order, its meanings shuffled by `seed`; a
 * script track's letter pairs are found among the cards its lessons make.
 */
export const cardFromId = (course: CourseView, exercise: string, seed = 1): Result<Exercise, CardIdError> => {
  const planned = exercise.trim().split("#")[0] ?? "";
  const colon = planned.indexOf(":");
  if (colon < 1) return { ok: false, error: "unreadable" };
  const template = planned.slice(0, colon) as TemplateId;
  const item = planned.slice(colon + 1);
  if (!Object.hasOwn(TEMPLATES, template)) return { ok: false, error: "unknown-kind" };
  if (courseExclusions(course).has(template)) return { ok: false, error: "excluded" };
  const found = (ex: Exercise | undefined): ex is Exercise => ex?.id === planned;

  // A sentence's card: the sentence is the item, or the item's first part (a word asked: s.1:چای).
  const makeSentence = SENTENCE_TEMPLATES[template];
  const sentence = makeSentence === undefined ? undefined : allSentences(course).find((s) => s.id === item || item.startsWith(`${s.id}:`));
  if (makeSentence !== undefined && sentence !== undefined) {
    const at = lessonNodes(course).find((n) => sentencesOf(course, n.unit, n.node).some((s) => s.id === sentence.id));
    const introduced = at?.node.introduces ?? [];
    // The lesson's own card first; then each of its words asked, for a card whose id names its word.
    const words = (sentence.forms[course.orthography]?.text.tokens ?? []).map((token) => [...lexemeIdsOf(token)].map(String).sort()).filter((ask) => ask.length > 0);
    for (const ask of [undefined, ...words]) {
      const ex = makeSentence({ course, rng: seededRng(seed), introduced, ...(ask === undefined ? {} : { ask }) }, sentence);
      if (found(ex)) return { ok: true, value: ex };
    }
  }

  // A lexeme's card.
  const makeLexeme = LEXEME_TEMPLATES[template];
  const lexeme = makeLexeme === undefined ? undefined : lexemesById(course).get(item);
  if (makeLexeme !== undefined && lexeme !== undefined) {
    const at = lessonNodes(course).find((n) => n.node.introduces.includes(lexeme.id));
    const ex = makeLexeme({ course, rng: seededRng(seed), introduced: at?.node.introduces ?? [lexeme.id] }, lexeme);
    if (found(ex)) return { ok: true, value: ex };
  }

  // A pairs card: the words its id lists, in that order.
  if (template === "match-pairs") {
    const byId = lexemesById(course);
    const words = item.split("+").map((part) => byId.get(part));
    if (words.every((w) => w !== undefined)) {
      const at = lessonNodes(course).find((n) => words.some((w) => n.node.introduces.includes(w.id)));
      const ex = makeMatchPairs({ course, rng: inOrder(seed), introduced: at?.node.introduces ?? [] }, words);
      if (found(ex)) return { ok: true, value: ex };
    }
  }

  // Otherwise among the cards the lessons make (a script track's cards), as they draw them.
  const others = new Set(KINDS.filter((t) => t !== template));
  for (let n = 0; n < SEEDS; n++) {
    const rng = (): ReturnType<typeof seededRng> => seededRng(seed + n);
    for (const at of SCRIPT_TEMPLATES.has(template) ? [] : lessonNodes(course)) {
      const ex = lessonCandidates({ course, rng: rng(), introduced: at.node.introduces }, at, NONE_SEEN, others).find(found);
      if (ex !== undefined) return { ok: true, value: ex };
    }
    for (const at of SCRIPT_TEMPLATES.has(template) ? scriptNodes(course) : []) {
      const ex = scriptCandidates({ course, rng: rng(), introduced: at.node.introduces }, at, others).find(found);
      if (ex !== undefined) return { ok: true, value: ex };
    }
  }
  return { ok: false, error: "not-made" };
};
