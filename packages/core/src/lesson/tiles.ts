/**
 * Word-bank tiles (ADR 0130): a sentence's tile groups, every word in lower case unless it must be
 * capitalized. A capital that only marks where a sentence starts would mark that tile as the
 * answer's first, and a distractor's (another sentence's first word) as a distractor, since only
 * one tile can start the answer.
 *
 * A word loses its capital only where both hold:
 * - it starts a sentence: the text's first word, or the first after a sentence terminator (Unicode's
 *   Sentence_Terminal: . ? ! ؟ 。), whatever punctuation stands between (¿Qué);
 * - the course writes it in lower case somewhere in the same orthography (a sentence, a translation,
 *   a word's form or gloss, a story line). A name never is, nor "I", nor a German noun: they keep it.
 *
 * A capital inside a sentence always stays: there it belongs to the word. Lower case is the
 * language's own (toLocaleLowerCase with the text's tag), so Turkish İ becomes i, and a caseless script
 * is left as it is. Grading compares case-folded text (each profile's `match.case`), and the solution
 * shown after an answer keeps its capitals.
 */
import type { TaggedText, Token } from "@nabu/schema";
import { tileGroups } from "../text/tagged-text.ts";
import type { CourseView } from "./course.ts";

const TERMINATOR = /\p{Sentence_Terminal}/u;

type Lower = (lang: string, surface: string) => string;

/** Words as their language lowercases them, remembered per course (a tag with a script makes it slow). */
const lowerer = (): Lower => {
  const byLang = new Map<string, Map<string, string>>();
  return (lang, surface) => {
    let bySurface = byLang.get(lang);
    if (bySurface === undefined) {
      bySurface = new Map();
      byLang.set(lang, bySurface);
    }
    let lowered = bySurface.get(surface);
    if (lowered === undefined) {
      lowered = surface.toLocaleLowerCase(lang);
      bySurface.set(surface, lowered);
    }
    return lowered;
  };
};

const isTaggedText = (value: unknown): value is TaggedText =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { readonly orthography?: unknown }).orthography === "string" &&
  typeof (value as { readonly lang?: unknown }).lang === "string" &&
  Array.isArray((value as { readonly tokens?: unknown }).tokens);

interface Cased {
  /** Every word the course writes in lower case, by orthography. */
  readonly words: ReadonlyMap<string, ReadonlySet<string>>;
  readonly lower: Lower;
}

/** Built once per course. */
const casedCache = new WeakMap<CourseView, Cased>();

const casedOf = (course: CourseView): Cased => {
  const cached = casedCache.get(course);
  if (cached !== undefined) return cached;
  const lower = lowerer();
  const out = new Map<string, Set<string>>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const v of value) visit(v);
      return;
    }
    if (typeof value !== "object" || value === null) return;
    if (isTaggedText(value)) {
      let words = out.get(value.orthography);
      if (words === undefined) {
        words = new Set();
        out.set(value.orthography, words);
      }
      for (const t of value.tokens) if (t.kind === "word" && lower(value.lang, t.surface) === t.surface) words.add(t.surface);
      return;
    }
    for (const v of Object.values(value)) visit(v);
  };
  visit(course.units);
  const cased = { words: out, lower };
  casedCache.set(course, cased);
  return cased;
};

/** The indices of the text's words that start a sentence. */
const sentenceStarts = (text: TaggedText): ReadonlySet<number> => {
  const starts = new Set<number>();
  let start = true;
  text.tokens.forEach((t, i) => {
    if (t.kind === "word" || t.kind === "number") {
      if (start) starts.add(i);
      start = false;
    } else if (t.kind === "punct" && TERMINATOR.test(t.surface)) start = true;
  });
  return starts;
};

/** The token in lower case, its morphs and ruby bases with it (they spell its surface). */
const lowered = (lower: Lower, token: Token, lang: string, surface: string): Token => ({
  ...token,
  surface,
  ...(token.morphs === undefined ? {} : { morphs: token.morphs.map((m) => ({ ...m, surface: lower(lang, m.surface) })) }),
  ...(token.ruby === undefined
    ? {}
    : { ruby: Object.fromEntries(Object.entries(token.ruby).map(([scheme, segments]) => [scheme, segments.map((s) => ({ ...s, base: lower(lang, s.base) }))])) }),
});

/** The text with each sentence's first word in lower case where the course writes that word so. */
export const caseForTiles = (course: CourseView, text: TaggedText): TaggedText => {
  const { words: all, lower } = casedOf(course);
  const words = all.get(text.orthography);
  if (words === undefined) return text;
  const starts = sentenceStarts(text);
  let changed = false;
  const tokens = text.tokens.map((t, i) => {
    if (!starts.has(i) || t.kind !== "word") return t;
    const surface = lower(text.lang, t.surface);
    if (surface === t.surface || !words.has(surface)) return t;
    changed = true;
    return lowered(lower, t, text.lang, surface);
  });
  return changed ? { ...text, tokens } : text;
};

/** A text's word-bank tiles (its tile groups), in lower case but for words that must be capitalized. */
export const tilesOf = (course: CourseView, text: TaggedText): readonly TaggedText[] => tileGroups(caseForTiles(course, text));
