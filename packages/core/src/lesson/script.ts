/**
 * Script tracks (ADR 0088): lessons that teach an orthography's letters to a learner who reads the
 * support language's script, from a course's alphabet nodes. Each node brings in a few letters
 * (grapheme KCs) and words of the course spelled with the letters taught so far, each with its
 * Latin spelling (bundled by the compiler). Its exercises are built here and nowhere else, so no
 * lesson, review or golden file of a course without a track changes.
 */
import type { BundleNode, BundleUnit, ScriptItem, TaggedText, Token } from "@nabu/schema";
import { graphemes } from "../text/graphemes.ts";
import { surfaceOf } from "../text/tagged-text.ts";
import type { CourseView } from "./course.ts";
import type { CharRead, Exercise, MatchPairs, TemplateId, TranslateTap } from "./exercise.ts";
import type { MakeContext } from "./templates.ts";

export interface ScriptNode {
  readonly unit: BundleUnit;
  readonly node: BundleNode & { readonly alphabet: NonNullable<BundleNode["alphabet"]> };
}

/** The course's alphabet nodes for its current orthography, in course order. */
export const scriptNodes = (course: CourseView): readonly ScriptNode[] =>
  course.units.flatMap((unit) =>
    unit.nodes.flatMap((node): ScriptNode[] =>
      node.kind === "script" && node.alphabet !== undefined && node.alphabet.orthography === course.orthography
        ? [{ unit, node: { ...node, alphabet: node.alphabet } }]
        : [],
    ),
  );

/** The templates only a script node makes. */
export const SCRIPT_TEMPLATES: ReadonlySet<TemplateId> = new Set<TemplateId>(["letter-read", "letter-pairs", "word-read", "word-write"]);

const id = (template: TemplateId, item: string): string => `${template}:${item}`;

/** Up to `n` items of `pool` whose `key` differs from `taken`'s and each other's. */
const distinct = (ctx: MakeContext, pool: readonly ScriptItem[], taken: readonly ScriptItem[], key: (i: ScriptItem) => string, n: number): readonly ScriptItem[] => {
  const seen = new Set(taken.map(key));
  const out: ScriptItem[] = [];
  for (const item of ctx.rng.shuffle(pool)) {
    if (out.length === n) break;
    const k = key(item);
    if (k === "" || seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
};

const latinKey = (i: ScriptItem): string => surfaceOf(i.latin).normalize("NFC").toLocaleLowerCase("en");
const textKey = (i: ScriptItem): string => surfaceOf(i.text).normalize("NFC");

const withAnswer = <T>(ctx: MakeContext, answer: T, others: readonly T[]): { readonly options: readonly T[]; readonly answer: number } => {
  const at = ctx.rng.int(others.length + 1);
  return { options: [...others.slice(0, at), answer, ...others.slice(at)], answer: at };
};

/** A letter; choose its Latin value. */
export const makeLetterRead = (ctx: MakeContext, letter: ScriptItem, pool: readonly ScriptItem[]): CharRead | undefined => {
  const others = distinct(ctx, pool, [letter], latinKey, 3);
  if (others.length < 2) return undefined;
  const { options, answer } = withAnswer(ctx, letter.latin, others.map((o) => o.latin));
  return {
    template: "letter-read",
    id: id("letter-read", letter.kc),
    item: letter.kc,
    kcs: letter.letters,
    orthography: letter.latin.orthography,
    prompt: letter.text,
    options,
    answer,
  };
};

/** Up to five letters to match with their Latin values. */
export const makeLetterPairs = (ctx: MakeContext, letters: readonly ScriptItem[]): MatchPairs | undefined => {
  const chosen = distinct(ctx, letters, [], (l) => `${textKey(l)}|${latinKey(l)}`, 5).filter(
    (l, i, all) => all.findIndex((o) => latinKey(o) === latinKey(l)) === i,
  );
  if (chosen.length < 3) return undefined;
  const order = ctx.rng.shuffle(chosen.map((_, i) => i));
  return {
    template: "letter-pairs",
    id: id("letter-pairs", chosen.map((l) => l.kc).join("+")),
    item: (chosen[0] as ScriptItem).kc,
    kcs: chosen.flatMap((l) => l.letters),
    orthography: (chosen[0] as ScriptItem).text.orthography,
    left: chosen.map((l) => l.text),
    right: order.map((i) => (chosen[i] as ScriptItem).latin),
    pairs: chosen.map((_, i) => order.indexOf(i)),
  };
};

/** A word; choose its Latin spelling. */
export const makeWordRead = (ctx: MakeContext, word: ScriptItem, pool: readonly ScriptItem[]): CharRead | undefined => {
  const others = distinct(ctx, pool, [word], latinKey, 3);
  if (others.length < 2) return undefined;
  const { options, answer } = withAnswer(ctx, word.latin, others.map((o) => o.latin));
  return {
    template: "word-read",
    id: id("word-read", word.kc),
    item: word.kc,
    kcs: word.letters,
    orthography: word.latin.orthography,
    prompt: word.text,
    options,
    answer,
  };
};

/** Accept-set notation's special characters, escaped: a word is accepted exactly as written. */
const literal = (s: string): string => s.replace(/[()[\]|\\#@]/gu, (c) => `\\${c}`);

/** The word's Latin spelling; build the word from letter tiles (its own and two or three others). */
export const makeWordWrite = (ctx: MakeContext, word: ScriptItem, letters: readonly ScriptItem[]): TranslateTap | undefined => {
  const surface = surfaceOf(word.text);
  const own = graphemes(surface);
  if (own.length < 2) return undefined;
  const tile = (g: string, group: number): Token => ({ surface: g, kind: "word", tileGroup: group });
  const canonical: TaggedText = { lang: word.text.lang, orthography: word.text.orthography, tokens: own.map((g, i) => tile(g, i)) };
  const tiles = own.map((g): TaggedText => ({ lang: word.text.lang, orthography: word.text.orthography, tokens: [{ surface: g, kind: "word" }] }));
  const inWord = new Set(own.map((g) => g.normalize("NFC")));
  const pool = letters.filter((l) => !inWord.has(textKey(l)));
  const extra = distinct(ctx, pool, [], textKey, Math.min(3, Math.max(2, Math.ceil(own.length / 2)))).map((l) => l.text);
  const all = [...tiles, ...extra];
  const order = ctx.rng.shuffle(all.map((_, i) => i));
  return {
    template: "word-write",
    id: id("word-write", word.kc),
    item: word.kc,
    kcs: word.letters,
    orthography: word.text.orthography,
    prompt: word.latin,
    tiles: order.map((i) => all[i] as TaggedText),
    solution: tiles.map((_, i) => order.indexOf(i)),
    joiner: "",
    accept: literal(surface),
    canonical,
  };
};

/** Every exercise a session at this node may choose from (the planner picks and orders them). */
export const scriptCandidates = (ctx: MakeContext, at: ScriptNode, exclude: ReadonlySet<TemplateId>): readonly Exercise[] => {
  const track = scriptNodes(ctx.course);
  const index = track.findIndex((n) => n.node.id === at.node.id);
  const earlier = track.slice(0, Math.max(0, index));
  const { letters, words } = at.node.alphabet;
  const earlierLetters = earlier.flatMap((n) => n.node.alphabet.letters);
  const earlierWords = earlier.flatMap((n) => n.node.alphabet.words);
  const allLetters = [...earlierLetters, ...letters];
  const allWords = [...earlierWords, ...words];
  const out: Exercise[] = [];
  const add = (ex: Exercise | undefined): void => {
    if (ex !== undefined && !exclude.has(ex.template) && !out.some((e) => e.id === ex.id)) out.push(ex);
  };
  for (const letter of letters) add(makeLetterRead(ctx, letter, allLetters));
  add(makeLetterPairs(ctx, letters.length >= 3 ? letters : allLetters));
  for (const word of words) {
    add(makeWordRead(ctx, word, allWords));
    add(makeWordWrite(ctx, word, allLetters));
  }
  for (const word of ctx.rng.shuffle(earlierWords).slice(0, 3)) add(makeWordRead(ctx, word, allWords));
  return out;
};
