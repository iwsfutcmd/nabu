/**
 * Words met in passages (ADR 0144). A passage may introduce words no lesson taught: the learner
 * meets them glossed in the passage, then drills them, a few a session, at the drill node the
 * compiler puts after its story node. The bundle lists the words most used across the course's
 * passages first; this module splits them into sessions, each a lesson for its words: every one
 * presented, then recognized, then written (in the passage's own lines, and out of any line with
 * `write-word`).
 *
 * A drill session is planned and logged as a lesson of its own node (`DrillSession.id`): the fold
 * marks it done, pays its XP once and lets it be practised again as any lesson, so no new event
 * data is needed. Drills never hold back the path (D6).
 */
import type { BundleKc, BundleNode, BundleSentence, BundleStory, BundleUnit, KcId } from "@nabu/schema";
import { allKcs, type CourseView } from "./course.ts";
import type { Exercise, TemplateId } from "./exercise.ts";
import { KC_LISTENING, LINE_TEMPLATES, lineSentences, makeMatchPairs, makeSelectImage, makeWriteWord, matchKeys, writable, type MakeContext } from "./templates.ts";

/**
 * The new words a drill session brings in, at most: as many as a match-pairs card shows, so that
 * one card presents them all (ADR 0050's hard constraint). The ADR's "the same as lessons at first";
 * tune against the simulation (test/simulation.test.ts).
 */
export const DRILL_WORDS = 5;

export interface DrillSession {
  /** The node id a lesson request and the log name it by: the drill node's, then its number. */
  readonly id: string;
  /** Its number among its drill node's sessions, from 1. */
  readonly number: number;
  /** The words it brings in, in the drill node's order. */
  readonly words: readonly BundleKc[];
}

export interface DrillNode {
  readonly unit: BundleUnit;
  /** The bundle's drill node. */
  readonly node: BundleNode & { readonly drill: NonNullable<BundleNode["drill"]> };
  /** The passage its words were met in. */
  readonly story: BundleStory | undefined;
  /** The words drilled in this orthography (written in it and glossed), in sessions. */
  readonly sessions: readonly DrillSession[];
}

/** A drill session's node id. */
export const drillSessionId = (node: string, number: number): string => `${node}.${String(number)}`;

/**
 * The words in sessions of at most DRILL_WORDS, in order, but that two words alike in a match-pairs
 * card (spelled alike, or glossed alike) never share a session: the later one goes to the next
 * session it fits in.
 */
const sessionsOf = (course: CourseView, node: string, words: readonly BundleKc[]): readonly DrillSession[] => {
  const out: DrillSession[] = [];
  let left = words;
  while (left.length > 0) {
    const taken: BundleKc[] = [];
    const keys = new Set<string>();
    const rest: BundleKc[] = [];
    for (const kc of left) {
      const { word, meaning } = matchKeys(course, kc);
      if (taken.length < DRILL_WORDS && !keys.has(`w ${word}`) && !keys.has(`m ${meaning}`)) {
        taken.push(kc);
        keys.add(`w ${word}`);
        keys.add(`m ${meaning}`);
      } else rest.push(kc);
    }
    out.push({ id: drillSessionId(node, out.length + 1), number: out.length + 1, words: taken });
    left = rest;
  }
  return out;
};

const drillLists = new WeakMap<CourseView, readonly DrillNode[]>();

/** The course's drill nodes with words to drill in its orthography, in course order (built once per course). */
export const drillNodes = (course: CourseView): readonly DrillNode[] => {
  let list = drillLists.get(course);
  if (list === undefined) {
    const kcs = new Map(allKcs(course).map((k) => [k.id as string, k]));
    list = course.units.flatMap((unit) =>
      unit.nodes.flatMap((node): DrillNode[] => {
        if (node.kind !== "drill" || node.drill === undefined) return [];
        const drill = node.drill;
        const words = drill.words.flatMap((id) => {
          const kc = kcs.get(id);
          return kc !== undefined && writable(course, kc) ? [kc] : [];
        });
        if (words.length === 0) return [];
        const story = (unit.stories ?? []).find((s) => s.node === drill.story);
        return [{ unit, node: { ...node, drill }, story, sessions: sessionsOf(course, node.id, words) }];
      }),
    );
    drillLists.set(course, list);
  }
  return list;
};

/** The drill session a node id names, with its drill node; undefined for any other node. */
export const drillSessionAt = (course: CourseView, id: string): { readonly drill: DrillNode; readonly session: DrillSession } | undefined => {
  for (const drill of drillNodes(course)) {
    const session = drill.sessions.find((s) => s.id === id);
    if (session !== undefined) return { drill, session };
  }
  return undefined;
};

/** The passage's lines (as sentences) that use one of these words. */
const linesWith = (ctx: MakeContext, drill: DrillNode, words: ReadonlySet<string>): readonly BundleSentence[] =>
  drill.story === undefined ? [] : lineSentences(ctx.course, drill.story).filter((s) => s.kcs.some((kc) => words.has(kc)));

/**
 * The cards a drill session makes (ADR 0144): its words' pictures and clips; one match-pairs card
 * that presents them all (with fewer than three, the passage's words the learner has `seen` too);
 * each word typed from its gloss; and, from the passage's lines that use them, which word fits a gap
 * and the word typed into it.
 */
export const drillCandidates = (ctx: MakeContext, drill: DrillNode, session: DrillSession, seen: ReadonlySet<string>, exclude: ReadonlySet<TemplateId>): Exercise[] => {
  const out: Exercise[] = [];
  const ids = new Set<string>();
  const add = (ex: Exercise | undefined): void => {
    if (ex === undefined || exclude.has(ex.template) || ids.has(ex.id)) return;
    ids.add(ex.id);
    out.push(ex);
  };
  const words = session.words;
  if (!exclude.has("select-image")) for (const kc of words) add(makeSelectImage(ctx, kc));
  for (const kc of words) for (const make of KC_LISTENING) add(make(ctx, kc));
  if (!exclude.has("match-pairs")) {
    // Fillers alike to none of the session's words, so that the card keeps them all.
    const keys = new Set(words.flatMap((kc) => Object.values(matchKeys(ctx.course, kc))));
    const fill: BundleKc[] = [];
    for (const other of drillNodes(ctx.course).flatMap((d) => d.sessions.flatMap((s) => s.words))) {
      if (words.length + fill.length >= 3) break;
      if (!seen.has(other.id) || words.includes(other)) continue;
      const k = matchKeys(ctx.course, other);
      if (keys.has(k.word) || keys.has(k.meaning)) continue;
      keys.add(k.word);
      keys.add(k.meaning);
      fill.push(other);
    }
    add(makeMatchPairs(ctx, [...words, ...fill]));
  }
  if (!exclude.has("write-word")) for (const kc of words) add(makeWriteWord(ctx, kc));
  // Each word in each line of the passage that uses it: which word fits its gap, and the word typed
  // into it. A line with two of the session's words makes cards for each.
  for (const s of linesWith(ctx, drill, new Set(words.map((k) => k.id as string)))) {
    const own = words.filter((kc) => s.kcs.includes(kc.id));
    for (const kc of own) {
      const at: MakeContext = { ...ctx, introduced: [kc.id], focus: undefined };
      for (const [template, make] of Object.entries(LINE_TEMPLATES)) {
        if (exclude.has(template as TemplateId)) continue;
        const ex = make(at, s);
        if (ex === undefined || askedSense(ex) !== kc.id) continue;
        add(own.length > 1 ? { ...ex, id: `${ex.id}~${kc.id}` } : ex);
      }
    }
  }
  return out;
};

/** The word a line card asks: the sense of its gap's right option, or of its typed blank. */
const askedSense = (ex: Exercise): string | undefined => {
  const token = ex.template === "gap-fill" ? ex.options[ex.answer]?.tokens[0] : ex.template === "complete-translation" ? ex.blank.tokens[0] : undefined;
  return token?.sense === undefined ? undefined : `sense:${token.sense}`;
};

/** Every KC a passage's lines use: what a drill's line cards may hold as context (ADR 0144). */
export const passageKcs = (drill: DrillNode): ReadonlySet<KcId> => new Set(drill.story?.kcs ?? []);
