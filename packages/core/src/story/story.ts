/**
 * Stories (gameplan §8.2 `story`, Phase 6) as the reader sees them: a bundle story turned into
 * a script of steps for one orthography and support language. Lines are read one at a time;
 * questions come between them. A line with a question (complete, arrange) is asked first and
 * appears once answered, like the next line of a dialogue being guessed.
 *
 * Pure: options are shuffled with the injected seeded Rng only.
 */
import type { BundleStory, BundleStoryLine, PartId, TaggedText, Token } from "@nabu/schema";
import type { CourseView } from "../lesson/course.ts";
import { allLexemes, lexemesById, profileOf } from "../lesson/course.ts";
import { baseIdOf, lexemeIdsOf, lexemesOf } from "../lesson/lexemes.ts";
import type { Exercise, StoryArrange, StoryChoose, StoryComplete } from "../lesson/exercise.ts";
import type { Rng } from "../lesson/rng.ts";
import { compileGlossary, glossesAt, glossTokens, type CompiledGlossary, type TokenGloss } from "../match/glossary.ts";
import { surfaceOf, textOfSurface } from "../text/tagged-text.ts";
import { tilesOf } from "../lesson/tiles.ts";

export interface StoryLine {
  readonly index: number;
  /** The line's step in the story's source (every step counted): how a correction names it. */
  readonly step: number;
  /** The speaker's id and name in the learner's orthography; none for narration. */
  readonly speaker?: { readonly id: string; readonly name: TaggedText | undefined } | undefined;
  readonly text: TaggedText;
  readonly translation: TaggedText | undefined;
  readonly parts: readonly PartId[];
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

const joinerOf = (text: TaggedText): string => (text.tokens.some((t) => t.kind === "space") ? " " : "");

const slice = (text: TaggedText, from: number, to: number): TaggedText => ({ ...text, tokens: text.tokens.slice(from, to) });

const withAnswer = <T>(rng: Rng, answer: T, others: readonly T[]): { readonly options: readonly T[]; readonly answer: number } => {
  const all = [answer, ...others];
  const order = rng.shuffle(all.map((_, i) => i));
  return { options: order.map((i) => all[i] as T), answer: order.indexOf(0) };
};

/**
 * The wrong options of a `complete` line as the compiler resolved them (ADR 0132): each a word the
 * course writes, in the gap's form (a lexeme question) or the gap's lexeme in another form (a form
 * question). Undefined where the bundle has none for this orthography.
 */
const resolvedOptions = (line: BundleStoryLine, orthography: string): readonly TaggedText[] | undefined => {
  const options = (line.options ?? []).map((o) => o[orthography]);
  return line.asks === undefined || options.length === 0 || options.some((o) => o === undefined) ? undefined : (options as readonly TaggedText[]);
};

const complete = (course: CourseView, story: BundleStory, at: number, line: BundleStoryLine, text: TaggedText, rng: Rng): StoryComplete | undefined => {
  const gap = line.gap;
  if (gap === undefined) return undefined;
  const index = text.tokens.findIndex((t) => isWord(t) && lexemeIdsOf(t).includes(gap));
  const token = text.tokens[index];
  const others = resolvedOptions(line, course.orthography);
  if (token === undefined || others === undefined) return undefined;
  const { options, answer } = withAnswer(rng, { ...text, tokens: [token] }, others);
  return {
    template: "story-complete",
    id: `story-complete:${story.id}/${at}`,
    item: `${story.id}/${at}`,
    parts: line.parts,
    orthography: course.orthography,
    before: slice(text, 0, index),
    after: slice(text, index + 1, text.tokens.length),
    options,
    answer,
    ...(line.asks === undefined ? {} : { asks: line.asks }),
  };
};

const arrange = (course: CourseView, story: BundleStory, at: number, line: BundleStoryLine, text: TaggedText, rng: Rng): StoryArrange | undefined => {
  // In lower case but for words that must be capitalized (ADR 0130): a capital would mark the first tile.
  const tiles = tilesOf(course, text);
  const translation = line.translations[course.supportKey];
  if (tiles.length < 2 || translation === undefined) return undefined;
  const order = rng.shuffle(tiles.map((_, i) => i));
  return {
    template: "story-arrange",
    id: `story-arrange:${story.id}/${at}`,
    item: `${story.id}/${at}`,
    parts: line.parts,
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
        step: at,
        ...(step.line.speaker === undefined ? {} : { speaker: { id: step.line.speaker, name: names.get(step.line.speaker) } }),
        text,
        translation: step.line.translations[key],
        parts: step.line.parts,
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
        parts: [],
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
  /** The spelling behind each entry, as the bundle has it. */
  readonly forms: readonly TaggedText[];
}

/** The course glossary for tap-for-gloss in one orthography: every spelling of every lexeme (§7.5 stage 7); a letter is no entry (ADR 0088). */
export const courseGlossary = (course: CourseView, orthography: string = course.orthography): StoryGlossary => {
  const entries = allLexemes(course).flatMap((lexeme) => (lexeme.forms?.[orthography] ?? []).map((form) => ({ id: lexeme.id, form })));
  return {
    compiled: compileGlossary(
      profileOf(course, orthography),
      entries.map((e) => ({ id: e.id, text: surfaceOf(e.form) })),
    ),
    forms: entries.map((e) => e.form),
  };
};

/** Glossary matches over a line's tokens: longest match, folded and exact passes side by side. */
export const glossLine = (course: CourseView, glossary: StoryGlossary, text: TaggedText): readonly TokenGloss[] =>
  glossTokens(glossary.compiled, profileOf(course, text.orthography), text.tokens);

export interface Gloss {
  /** The lexeme glossed. */
  readonly id: string;
  /**
   * How the entry is written: the matched spelling, or the tapped word itself when no entry reached it;
   * a lexeme of the word as the word writes it, its own spelling (with its readings) where that is alike.
   */
  readonly form: TaggedText;
  /** Its meaning in the support language. */
  readonly meaning: TaggedText | undefined;
  /** The entry covers only part of the tapped token (我 in 我哋), or more than it (唔該). */
  readonly span: "whole" | "part" | "phrase";
  /**
   * A lexeme the word does not spell (ADR 0136: the ezafe, its kasra on the noun's last letter in
   * Persian, nothing at all in Chaghatay): its form is the whole word, and the panel says so.
   */
  readonly unwritten?: true;
  /**
   * A lexeme's dictionary form, where the word writes it otherwise: bor in boraman is bormoq
   * (ADR 0061). Its first spelling in the line's orthography.
   */
  readonly lemma?: TaggedText;
}

/**
 * What a tap on a token shows (ADR 0061).
 * - A phrase entry covering the word and its neighbours comes first: what they mean together.
 * - A word that writes several lexemes (Angliya·dan·mi·siz) is shown lexeme by lexeme, each with
 *   its meaning, and the dictionary form where the word writes it otherwise.
 * - Any other word: the glossary entries covering it, in order; a word no entry reaches falls
 *   back to its own lexeme, so a tap always explains an annotated word.
 */
export const glossAt = (course: CourseView, glossary: StoryGlossary, glosses: readonly TokenGloss[], text: TaggedText, token: number): readonly Gloss[] => {
  const lexemes = lexemesById(course);
  const meaning = (id: string): TaggedText | undefined => lexemes.get(id)?.gloss?.[course.supportKey];
  const own = text.tokens[token];
  const written = own === undefined || !isWord(own) ? [] : lexemesOf(own);
  if (new Set(written.map((l) => l.lexeme)).size > 1) {
    const phrases = glossesAt(glosses, token).flatMap((g): Gloss[] => {
      const form = glossary.forms[g.entry];
      return form === undefined || g.tokenEnd - g.tokenStart < 2 ? [] : [{ id: g.id, form, meaning: meaning(g.id), span: "phrase" }];
    });
    return [
      ...phrases,
      ...written.map((l): Gloss => {
        const id = l.lexeme;
        if (l.surface === "") return { id, form: { ...text, tokens: [own as Token] }, meaning: meaning(id), span: "part", unwritten: true };
        const surface = l.surface ?? (own as Token).surface;
        const lemma = lexemes.get(id)?.forms?.[text.orthography]?.[0];
        const gloss: Gloss = { id, form: textOfSurface(text, surface), meaning: meaning(id), span: "part" };
        if (lemma === undefined) return gloss;
        // A lexeme spelled as its dictionary form is that form, with the readings its entry pins (اشلیغ ašliǧ in اشلیغی).
        return surfaceOf(lemma).normalize("NFC") === surface.normalize("NFC") ? { ...gloss, form: lemma } : { ...gloss, lemma };
      }),
    ];
  }
  // A homograph (知 "know", 知 "wise"; ADR 0071): an entry over this word alone, spelled as the
  // word is, glosses the lexeme the token names rather than whichever entry the glossary met first.
  const named = own !== undefined && isWord(own) ? baseIdOf(own) : undefined;
  const spells = (id: string): boolean => (lexemes.get(id)?.forms?.[text.orthography] ?? []).some((f) => surfaceOf(f).normalize("NFC") === own?.surface.normalize("NFC"));
  const hits = glossesAt(glosses, token).flatMap((g): Gloss[] => {
    const form = glossary.forms[g.entry];
    if (form === undefined) return [];
    const span = g.partial ? "part" : g.tokenEnd - g.tokenStart > 1 ? "phrase" : "whole";
    const id = span === "whole" && named !== undefined && named !== g.id && spells(named) ? named : g.id;
    return [{ id, form, meaning: meaning(id), span }];
  });
  if (hits.length > 0) return hits;
  if (own === undefined || !isWord(own)) return [];
  // No entry reaches the word (an inflected form, a name): its own lexeme, shown as written here.
  const fallback = baseIdOf(own) ?? lexemeIdsOf(own)[0];
  return fallback === undefined ? [] : [{ id: fallback, form: { ...text, tokens: [own] }, meaning: meaning(fallback), span: "whole" as const }];
};
