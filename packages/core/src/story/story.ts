/**
 * Stories (gameplan §8.2 `story`, Phase 6) as the reader sees them: a bundle story turned into
 * a script of steps for one orthography and support language. Lines are read one at a time;
 * questions come between them. A line with a question (complete, arrange) is asked first and
 * appears once answered, like the next line of a dialogue being guessed.
 *
 * Pure: options are shuffled with the injected seeded Rng only.
 */
import type { BundleStory, BundleStoryLine, KcId, TaggedText, Token } from "@nabu/schema";
import type { CourseView } from "../lesson/course.ts";
import { allKcs, profileOf } from "../lesson/course.ts";
import type { Exercise, StoryArrange, StoryChoose, StoryComplete } from "../lesson/exercise.ts";
import type { Rng } from "../lesson/rng.ts";
import { compileGlossary, glossesAt, glossTokens, type CompiledGlossary, type TokenGloss } from "../match/glossary.ts";
import { surfaceOf, tileGroups } from "../text/tagged-text.ts";

export interface StoryLine {
  readonly index: number;
  /** The speaker's id and name in the learner's orthography; none for narration. */
  readonly speaker?: { readonly id: string; readonly name: TaggedText | undefined } | undefined;
  readonly text: TaggedText;
  readonly translation: TaggedText | undefined;
  readonly kcs: readonly KcId[];
}

export type StoryStep =
  | { readonly tag: "line"; readonly line: number }
  /** A question; `reveals` is the line that appears once it is answered (complete, arrange). */
  | { readonly tag: "question"; readonly ex: Exercise; readonly reveals?: number | undefined };

export interface StoryScript {
  readonly id: string;
  readonly node: string;
  readonly title: TaggedText | undefined;
  readonly lines: readonly StoryLine[];
  readonly steps: readonly StoryStep[];
}

export const allStories = (course: CourseView): readonly BundleStory[] => course.units.flatMap((u) => u.stories ?? []);

export const storyAt = (course: CourseView, node: string): BundleStory | undefined => allStories(course).find((s) => s.node === node);

const isWord = (t: Token): boolean => t.kind === "word" || t.kind === "number";

const tokenKcs = (t: Token): readonly KcId[] => [...(t.sense === undefined ? [] : [`sense:${t.sense}` as KcId]), ...(t.morphs ?? []).map((m) => m.kc)];

const joinerOf = (text: TaggedText): string => (text.tokens.some((t) => t.kind === "space") ? " " : "");

const slice = (text: TaggedText, from: number, to: number): TaggedText => ({ ...text, tokens: text.tokens.slice(from, to) });

const withAnswer = <T>(rng: Rng, answer: T, others: readonly T[]): { readonly options: readonly T[]; readonly answer: number } => {
  const all = [answer, ...others];
  const order = rng.shuffle(all.map((_, i) => i));
  return { options: order.map((i) => all[i] as T), answer: order.indexOf(0) };
};

const complete = (course: CourseView, story: BundleStory, at: number, line: BundleStoryLine, text: TaggedText, rng: Rng): StoryComplete | undefined => {
  const gap = line.gap;
  if (gap === undefined) return undefined;
  const index = text.tokens.findIndex((t) => isWord(t) && tokenKcs(t).includes(gap));
  const token = text.tokens[index];
  if (token === undefined) return undefined;
  const kcs = new Map(allKcs(course).map((k) => [k.id, k]));
  const others = (line.distractors ?? []).flatMap((kc) => kcs.get(kc)?.forms?.[course.orthography]?.[0] ?? []);
  const { options, answer } = withAnswer(rng, { ...text, tokens: [token] }, others);
  return {
    template: "story-complete",
    id: `story-complete:${story.id}/${at}`,
    item: `${story.id}/${at}`,
    kcs: line.kcs,
    orthography: course.orthography,
    before: slice(text, 0, index),
    after: slice(text, index + 1, text.tokens.length),
    options,
    answer,
  };
};

const arrange = (course: CourseView, story: BundleStory, at: number, line: BundleStoryLine, text: TaggedText, rng: Rng): StoryArrange | undefined => {
  const tiles = tileGroups(text);
  const translation = line.translations[course.supportKey];
  if (tiles.length < 2 || translation === undefined) return undefined;
  const order = rng.shuffle(tiles.map((_, i) => i));
  return {
    template: "story-arrange",
    id: `story-arrange:${story.id}/${at}`,
    item: `${story.id}/${at}`,
    kcs: line.kcs,
    orthography: course.orthography,
    prompt: translation,
    tiles: order.map((i) => tiles[i] as TaggedText),
    solution: tiles.map((_, i) => order.indexOf(i)),
    joiner: joinerOf(text),
    canonical: text,
  };
};

/** The story as a script for the course's orthography and support language. */
export const storyScript = (course: CourseView, story: BundleStory, rng: Rng): StoryScript => {
  const key = course.supportKey;
  const names = new Map(story.characters.map((c) => [c.id, c.name[course.orthography]]));
  const lines: StoryLine[] = [];
  const steps: StoryStep[] = [];
  for (const [at, step] of story.steps.entries()) {
    if (step.line !== undefined) {
      const text = step.line.forms[course.orthography];
      if (text === undefined) continue;
      const index = lines.length;
      lines.push({
        index,
        ...(step.line.speaker === undefined ? {} : { speaker: { id: step.line.speaker, name: names.get(step.line.speaker) } }),
        text,
        translation: step.line.translations[key],
        kcs: step.line.kcs,
      });
      const ex = step.line.ask === "complete" ? complete(course, story, at, step.line, text, rng) : step.line.ask === "arrange" ? arrange(course, story, at, step.line, text, rng) : undefined;
      steps.push(ex === undefined ? { tag: "line", line: index } : { tag: "question", ex, reveals: index });
    } else if (step.choose !== undefined) {
      const prompt = step.choose.prompt[key];
      const options = step.choose.options.map((o) => o[key]);
      const right = options[step.choose.answer];
      if (prompt === undefined || right === undefined || options.some((o) => o === undefined)) continue;
      const shuffled = withAnswer(
        rng,
        right,
        options.filter((_, i) => i !== step.choose?.answer),
      );
      const ex: StoryChoose = {
        template: "story-choose",
        id: `story-choose:${story.id}/${at}`,
        item: `${story.id}/${at}`,
        kcs: [],
        orthography: course.support,
        prompt,
        options: shuffled.options as readonly TaggedText[],
        answer: shuffled.answer,
      };
      steps.push({ tag: "question", ex });
    }
  }
  return { id: story.id, node: story.node, title: story.title[key], lines, steps };
};

export interface StoryGlossary {
  readonly compiled: CompiledGlossary;
  /** The KC form behind each entry, as the bundle has it. */
  readonly forms: readonly TaggedText[];
}

/** The course glossary for tap-for-gloss in one orthography: every KC form (§7.5 stage 7). */
export const courseGlossary = (course: CourseView, orthography: string = course.orthography): StoryGlossary => {
  const entries = allKcs(course).flatMap((kc) => (kc.forms?.[orthography] ?? []).map((form) => ({ kc: kc.id, form })));
  return {
    compiled: compileGlossary(
      profileOf(course, orthography),
      entries.map((e) => ({ kc: e.kc, text: surfaceOf(e.form) })),
    ),
    forms: entries.map((e) => e.form),
  };
};

/** Glossary matches over a line's tokens: longest match, folded and exact passes side by side. */
export const glossLine = (course: CourseView, glossary: StoryGlossary, text: TaggedText): readonly TokenGloss[] =>
  glossTokens(glossary.compiled, profileOf(course, text.orthography), text.tokens);

export interface Gloss {
  readonly kc: KcId;
  /** How the entry is written: the matched KC form, or the tapped word itself when no entry reached it. */
  readonly form: TaggedText;
  /** Its meaning in the support language. */
  readonly meaning: TaggedText | undefined;
  /** The entry covers only part of the tapped token (我 in 我哋), or more than it (唔該). */
  readonly span: "whole" | "part" | "phrase";
}

/**
 * What a tap on a token shows: the glossary entries covering it, in order. A word no entry
 * reaches falls back to its own sense, so a tap always explains an annotated word.
 */
export const glossAt = (course: CourseView, glossary: StoryGlossary, glosses: readonly TokenGloss[], text: TaggedText, token: number): readonly Gloss[] => {
  const meaning = new Map(allKcs(course).map((k) => [k.id, k.gloss?.[course.supportKey]]));
  const hits = glossesAt(glosses, token).flatMap((g): Gloss[] => {
    const form = glossary.forms[g.entry];
    if (form === undefined) return [];
    const span = g.partial ? "part" : g.tokenEnd - g.tokenStart > 1 ? "phrase" : "whole";
    return [{ kc: g.kc, form, meaning: meaning.get(g.kc), span }];
  });
  if (hits.length > 0) return hits;
  const own = text.tokens[token];
  if (own === undefined || !isWord(own)) return [];
  // No entry reaches the word (an ezafe form, a name): its own sense, shown as written here.
  return tokenKcs(own)
    .slice(0, 1)
    .map((kc) => ({ kc, form: { ...text, tokens: [own] }, meaning: meaning.get(kc), span: "whole" as const }));
};
