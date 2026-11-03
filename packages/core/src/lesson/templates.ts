/**
 * The Phase 3 template catalog (gameplan §8.1–8.2). Each template is data plus
 * pure functions: `make` instantiates it from a sentence or KC (undefined when
 * not eligible), `grade` turns a response into an outcome. Randomness comes
 * from the injected seeded Rng only.
 */
import type { BundleKc, BundleSentence, KcId, SchemeId, ScriptedLangTag, TaggedText, Token } from "@nabu/schema";
import { glossUnits } from "../match/gloss.ts";
import { surfaceOf, tileGroups } from "../text/tagged-text.ts";
import { allKcs, allSentences, profileOf, type CourseView, type Grader } from "./course.ts";
import type {
  CharRead,
  ChooseTranslation,
  CompleteTranslation,
  Exercise,
  Facet,
  FacetRef,
  GapFill,
  MatchPairs,
  Outcome,
  ReadingDisambiguation,
  Response,
  SelectImage,
  Speak,
  TemplateId,
  TranslateTap,
  TranslateType,
} from "./exercise.ts";
import type { Rng } from "./rng.ts";

export interface TemplateInfo {
  readonly facet: Facet;
  readonly modality: {
    readonly audioOut: boolean;
    readonly mic: boolean;
    readonly input: "choice" | "pairs" | "tiles" | "text" | "voice";
  };
}

export const TEMPLATES: Readonly<Record<TemplateId, TemplateInfo>> = {
  "select-image": { facet: "recognize", modality: { audioOut: false, mic: false, input: "choice" } },
  "match-pairs": { facet: "recognize", modality: { audioOut: false, mic: false, input: "pairs" } },
  "choose-translation": { facet: "recognize", modality: { audioOut: false, mic: false, input: "choice" } },
  "translate-tap.l2-l1": { facet: "recognize", modality: { audioOut: false, mic: false, input: "tiles" } },
  "translate-tap.l1-l2": { facet: "produce", modality: { audioOut: false, mic: false, input: "tiles" } },
  "translate-type.l1-l2": { facet: "produce", modality: { audioOut: false, mic: false, input: "text" } },
  "complete-translation": { facet: "produce", modality: { audioOut: false, mic: false, input: "text" } },
  "gap-fill": { facet: "produce", modality: { audioOut: false, mic: false, input: "choice" } },
  "char-read": { facet: "read", modality: { audioOut: false, mic: false, input: "choice" } },
  "reading-disambiguation": { facet: "read", modality: { audioOut: false, mic: false, input: "choice" } },
  "speak.tier-0": { facet: "speak", modality: { audioOut: false, mic: true, input: "voice" } },
};

/** Which (KC, facet) pairs an instance exercises (§8.5 credit assignment). */
export const facets = (ex: Exercise): readonly FacetRef[] => ex.kcs.map((kc) => ({ kc, facet: TEMPLATES[ex.template].facet }));

// ------------------------------------------------------------------------------------ context

export interface MakeContext {
  readonly course: CourseView;
  readonly rng: Rng;
  /** KCs the current node introduces: new words get the recognition templates first. */
  readonly introduced: readonly KcId[];
}

const id = (template: TemplateId, item: string): string => `${template}:${item}`;

const words = (text: TaggedText): readonly number[] =>
  text.tokens.flatMap((t, i) => (t.kind === "word" || t.kind === "number" ? [i] : []));

/** " " where the text spaces its words, "" where it does not (Han). */
const joinerOf = (text: TaggedText): string => (text.tokens.some((t) => t.kind === "space") ? " " : "");

const slice = (text: TaggedText, from: number, to: number): TaggedText => ({ ...text, tokens: text.tokens.slice(from, to) });

const single = (text: TaggedText, token: Token): TaggedText => {
  const { tileGroup: _tile, ...rest } = token;
  return { ...text, tokens: [rest] };
};

/** Normalized, folded, mark-insensitive comparison key: two options must never collide on it. */
const keyOf = (course: CourseView, text: TaggedText): string => glossUnits(profileOf(course, text.orthography), surfaceOf(text)).join(" ");

const formOf = (course: CourseView, s: BundleSentence): { readonly text: TaggedText; readonly reverse?: string | undefined } | undefined =>
  s.forms[course.orthography];

const translationOf = (course: CourseView, s: BundleSentence): { readonly text: TaggedText; readonly accept: string } | undefined =>
  s.translations[course.supportKey];

const producible = (course: CourseView, s: BundleSentence): string | undefined => (s.production ? formOf(course, s)?.reverse : undefined);

/** Up to `n` distractors from `pool`, none colliding with `taken` or each other (by key). */
const pickDistinct = (ctx: MakeContext, pool: readonly TaggedText[], taken: readonly TaggedText[], n: number): readonly TaggedText[] => {
  const seen = new Set(taken.map((t) => keyOf(ctx.course, t)));
  const out: TaggedText[] = [];
  for (const candidate of ctx.rng.shuffle(pool)) {
    if (out.length === n) break;
    const key = keyOf(ctx.course, candidate);
    if (key === "" || seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }
  return out;
};

/** Places `answer` among `others` at a random position. */
const withAnswer = <T>(ctx: MakeContext, answer: T, others: readonly T[]): { readonly options: readonly T[]; readonly answer: number } => {
  const at = ctx.rng.int(others.length + 1);
  return { options: [...others.slice(0, at), answer, ...others.slice(at)], answer: at };
};

const otherSentences = (ctx: MakeContext, s: BundleSentence): readonly BundleSentence[] =>
  allSentences(ctx.course).filter((o) => o.id !== s.id && !o.id.startsWith("drill.") && formOf(ctx.course, o) !== undefined);

// ------------------------------------------------------------------------------------ KC templates

const pictured = (ctx: MakeContext, kc: BundleKc): boolean =>
  kc.image !== undefined && (kc.forms?.[ctx.course.orthography]?.length ?? 0) > 0 && kc.gloss?.[ctx.course.supportKey] !== undefined;

export const makeSelectImage = (ctx: MakeContext, kc: BundleKc): SelectImage | undefined => {
  if (!pictured(ctx, kc)) return undefined;
  const { orthography, supportKey } = ctx.course;
  const option = (k: BundleKc) => ({ text: k.forms?.[orthography]?.[0] as TaggedText, image: k.image as string });
  const pool = allKcs(ctx.course).filter((k) => k.id !== kc.id && pictured(ctx, k) && k.image !== kc.image);
  const others = pickDistinct(ctx, pool.map((k) => option(k).text), [option(kc).text], 2);
  if (others.length < 2) return undefined;
  const otherOptions = others.map((t) => option(pool.find((k) => k.forms?.[orthography]?.[0] === t) as BundleKc));
  const { options, answer } = withAnswer(ctx, option(kc), otherOptions);
  return {
    template: "select-image",
    id: id("select-image", kc.id),
    item: kc.id,
    kcs: [kc.id],
    orthography,
    prompt: kc.gloss?.[supportKey] as TaggedText,
    options,
    answer,
  };
};

export const makeMatchPairs = (ctx: MakeContext, kcs: readonly BundleKc[]): MatchPairs | undefined => {
  const { orthography, supportKey } = ctx.course;
  const usable = kcs.filter((k) => k.kind === "sense" && (k.forms?.[orthography]?.length ?? 0) > 0 && k.gloss?.[supportKey] !== undefined);
  const chosen = pickDistinct(
    ctx,
    usable.map((k) => k.forms?.[orthography]?.[0] as TaggedText),
    [],
    5,
  );
  if (chosen.length < 3) return undefined;
  const byText = (t: TaggedText) => usable.find((k) => k.forms?.[orthography]?.[0] === t) as BundleKc;
  const glosses = chosen.map((t) => byText(t).gloss?.[supportKey] as TaggedText);
  const order = ctx.rng.shuffle(glosses.map((_, i) => i));
  return {
    template: "match-pairs",
    id: id("match-pairs", chosen.map((t) => byText(t).id).join("+")),
    item: byText(chosen[0] as TaggedText).id,
    kcs: chosen.map((t) => byText(t).id),
    orthography,
    left: chosen,
    right: order.map((i) => glosses[i] as TaggedText),
    pairs: chosen.map((_, i) => order.indexOf(i)),
  };
};

// ------------------------------------------------------------------------------------ sentence templates

export const makeChooseTranslation = (ctx: MakeContext, s: BundleSentence): ChooseTranslation | undefined => {
  const form = formOf(ctx.course, s);
  const translation = translationOf(ctx.course, s);
  if (form === undefined || translation === undefined) return undefined;
  const pool = otherSentences(ctx, s).flatMap((o) => translationOf(ctx.course, o)?.text ?? []);
  const others = pickDistinct(ctx, pool, [translation.text], 2);
  if (others.length < 2) return undefined;
  const { options, answer } = withAnswer(ctx, translation.text, others);
  return {
    template: "choose-translation",
    id: id("choose-translation", s.id),
    item: s.id,
    kcs: s.kcs,
    orthography: ctx.course.support,
    prompt: form.text,
    options,
    answer,
  };
};

const makeTap = (
  ctx: MakeContext,
  s: BundleSentence,
  template: "translate-tap.l2-l1" | "translate-tap.l1-l2",
  prompt: TaggedText,
  answer: TaggedText,
  accept: string,
  pool: readonly TaggedText[],
): TranslateTap | undefined => {
  const tiles = tileGroups(answer);
  if (tiles.length === 0) return undefined;
  const distractors = pickDistinct(ctx, pool.flatMap((t) => tileGroups(t)), tiles, Math.min(3, Math.max(2, tiles.length)));
  const all = [...tiles, ...distractors];
  const order = ctx.rng.shuffle(all.map((_, i) => i));
  return {
    template,
    id: id(template, s.id),
    item: s.id,
    kcs: s.kcs,
    orthography: answer.orthography,
    prompt,
    tiles: order.map((i) => all[i] as TaggedText),
    solution: tiles.map((_, i) => order.indexOf(i)),
    joiner: joinerOf(answer),
    accept,
    canonical: answer,
  };
};

export const makeTapL2L1 = (ctx: MakeContext, s: BundleSentence): TranslateTap | undefined => {
  const form = formOf(ctx.course, s);
  const translation = translationOf(ctx.course, s);
  if (form === undefined || translation === undefined) return undefined;
  const pool = otherSentences(ctx, s).flatMap((o) => translationOf(ctx.course, o)?.text ?? []);
  return makeTap(ctx, s, "translate-tap.l2-l1", form.text, translation.text, translation.accept, pool);
};

export const makeTapL1L2 = (ctx: MakeContext, s: BundleSentence): TranslateTap | undefined => {
  const form = formOf(ctx.course, s);
  const translation = translationOf(ctx.course, s);
  const accept = producible(ctx.course, s);
  if (form === undefined || translation === undefined || accept === undefined) return undefined;
  const pool = otherSentences(ctx, s).flatMap((o) => formOf(ctx.course, o)?.text ?? []);
  return makeTap(ctx, s, "translate-tap.l1-l2", translation.text, form.text, accept, pool);
};

export const makeTranslateType = (ctx: MakeContext, s: BundleSentence): TranslateType | undefined => {
  const form = formOf(ctx.course, s);
  const translation = translationOf(ctx.course, s);
  const accept = producible(ctx.course, s);
  if (form === undefined || translation === undefined || accept === undefined) return undefined;
  return {
    template: "translate-type.l1-l2",
    id: id("translate-type.l1-l2", s.id),
    item: s.id,
    kcs: s.kcs,
    orthography: ctx.course.orthography,
    prompt: translation.text,
    accept,
    canonical: form.text,
  };
};

/** The word to blank out: the one carrying a KC this node introduces, else the last word. */
const blankIndex = (ctx: MakeContext, text: TaggedText): number | undefined => {
  const indexes = words(text);
  if (indexes.length < 2) return undefined;
  const fresh = indexes.find((i) => {
    const t = text.tokens[i] as Token;
    const kcs = [...(t.sense === undefined ? [] : [`sense:${t.sense}`]), ...(t.morphs ?? []).map((m) => m.kc as string)];
    return kcs.some((k) => ctx.introduced.includes(k as KcId));
  });
  return fresh ?? indexes[indexes.length - 1];
};

export const makeCompleteTranslation = (ctx: MakeContext, s: BundleSentence): CompleteTranslation | undefined => {
  const form = formOf(ctx.course, s);
  const translation = translationOf(ctx.course, s);
  const accept = producible(ctx.course, s);
  if (form === undefined || translation === undefined || accept === undefined) return undefined;
  const at = blankIndex(ctx, form.text);
  if (at === undefined) return undefined;
  return {
    template: "complete-translation",
    id: id("complete-translation", s.id),
    item: s.id,
    kcs: s.kcs,
    orthography: ctx.course.orthography,
    prompt: translation.text,
    before: slice(form.text, 0, at),
    after: slice(form.text, at + 1, form.text.tokens.length),
    blank: single(form.text, form.text.tokens[at] as Token),
    accept,
    canonical: form.text,
  };
};

export const makeGapFill = (ctx: MakeContext, s: BundleSentence): GapFill | undefined => {
  const form = formOf(ctx.course, s);
  const translation = translationOf(ctx.course, s);
  if (form === undefined || translation === undefined) return undefined;
  const at = blankIndex(ctx, form.text);
  if (at === undefined) return undefined;
  const target = form.text.tokens[at] as Token;
  const correct = single(form.text, target);
  const candidates = otherSentences(ctx, s).flatMap((o) => {
    const text = formOf(ctx.course, o)?.text;
    return text === undefined ? [] : words(text).map((i) => ({ token: text.tokens[i] as Token, text }));
  });
  // Same lexeme in another form first (هستم / هستی / هستند), then any other word.
  const sameSense = candidates.filter((c) => target.sense !== undefined && c.token.sense === target.sense);
  const preferred = pickDistinct(ctx, sameSense.map((c) => single(c.text, c.token)), [correct], 2);
  const rest = pickDistinct(ctx, candidates.map((c) => single(c.text, c.token)), [correct, ...preferred], 2 - preferred.length);
  const others = [...preferred, ...rest];
  if (others.length < 2) return undefined;
  const { options, answer } = withAnswer(ctx, correct, others);
  return {
    template: "gap-fill",
    id: id("gap-fill", s.id),
    item: s.id,
    kcs: s.kcs,
    orthography: ctx.course.orthography,
    hint: translation.text,
    before: slice(form.text, 0, at),
    after: slice(form.text, at + 1, form.text.tokens.length),
    options,
    answer,
  };
};

// ------------------------------------------------------------------------------------ reading templates

/** How a reading scheme is tagged when its readings are shown as options (Jyutping: yue-Latn-HK-jyutping). */
const READING_TAGS: Readonly<Record<string, { readonly lang: string; readonly orthography: string }>> = {
  jyutping: { lang: "yue-Latn-HK-jyutping", orthography: "yue-Latn/jyutping" },
};

/** The profile's ruby reading scheme (Jyutping for yue), if it is one we can show as options. */
export const rubySchemeOf = (ctx: MakeContext): SchemeId | undefined => {
  const scheme = profileOf(ctx.course, ctx.course.orthography).source.annotations?.find((a) => a.kind === "reading" && a.render === "ruby")?.scheme;
  return scheme !== undefined && READING_TAGS[scheme] !== undefined ? scheme : undefined;
};

const readingText = (scheme: SchemeId, reading: string): TaggedText => {
  const tag = READING_TAGS[scheme] as { readonly lang: string; readonly orthography: string };
  const tokens: Token[] = reading.split(" ").flatMap((syllable, i) => [
    ...(i === 0 ? [] : [{ surface: " ", kind: "space" as const }]),
    { surface: syllable, kind: "word" as const },
  ]);
  return { lang: tag.lang as ScriptedLangTag, orthography: tag.orthography as TaggedText["orthography"], tokens };
};

const stripRuby = (token: Token): Token => {
  const { ruby: _ruby, readings: _readings, tileGroup: _tile, ...rest } = token;
  return rest;
};

export const makeCharRead = (ctx: MakeContext, s: BundleSentence): CharRead | undefined => {
  const scheme = rubySchemeOf(ctx);
  const form = formOf(ctx.course, s);
  if (scheme === undefined || form === undefined) return undefined;
  const readable = (t: Token): boolean => t.kind === "word" && t.readings?.[scheme] !== undefined;
  const target = form.text.tokens.find((t) => readable(t) && ctx.introduced.some((k) => k === `sense:${t.sense}`)) ?? form.text.tokens.find(readable);
  if (target === undefined) return undefined;
  const reading = target.readings?.[scheme] as string;
  const syllables = reading.split(" ").length;
  const pool = otherSentences(ctx, s)
    .flatMap((o) => formOf(ctx.course, o)?.text.tokens ?? [])
    .flatMap((t) => (readable(t) ? [t.readings?.[scheme] as string] : []))
    .filter((r) => r.split(" ").length === syllables && r !== reading);
  const others = [...new Set(ctx.rng.shuffle(pool))].slice(0, 2);
  if (others.length < 2) return undefined;
  const { options, answer } = withAnswer(ctx, readingText(scheme, reading), others.map((r) => readingText(scheme, r)));
  return {
    template: "char-read",
    id: id("char-read", `${s.id}:${target.surface}`),
    item: s.id,
    kcs: target.sense === undefined ? s.kcs : [`sense:${target.sense}` as KcId],
    orthography: options[0]?.orthography ?? ctx.course.orthography,
    prompt: { ...form.text, tokens: [stripRuby(target)] },
    options,
    answer,
  };
};

export const makeReadingDisambiguation = (ctx: MakeContext, s: BundleSentence): ReadingDisambiguation | undefined => {
  const scheme = rubySchemeOf(ctx);
  const form = formOf(ctx.course, s);
  const homophones = profileOf(ctx.course, ctx.course.orthography).homophones;
  if (scheme === undefined || form === undefined || homophones === undefined) return undefined;
  for (const [ti, token] of form.text.tokens.entries()) {
    const segments = token.ruby?.[scheme] ?? [];
    for (const [si, segment] of segments.entries()) {
      const known = [...new Set(homophones.readings(segment.base) ?? [])];
      if (known.length < 2 || !known.includes(segment.text)) continue;
      const others = ctx.rng.shuffle(known.filter((r) => r !== segment.text)).slice(0, 2);
      const { options, answer } = withAnswer(ctx, readingText(scheme, segment.text), others.map((r) => readingText(scheme, r)));
      return {
        template: "reading-disambiguation",
        id: id("reading-disambiguation", `${s.id}:${ti}:${si}`),
        item: s.id,
        kcs: token.sense === undefined ? s.kcs : [`sense:${token.sense}` as KcId],
        orthography: options[0]?.orthography ?? ctx.course.orthography,
        context: { ...form.text, tokens: [token] },
        focus: { token: 0, segment: si },
        options,
        answer,
      };
    }
  }
  return undefined;
};

export const makeSpeak = (ctx: MakeContext, s: BundleSentence): Speak | undefined => {
  const form = formOf(ctx.course, s);
  const translation = translationOf(ctx.course, s);
  if (form === undefined || translation === undefined) return undefined;
  return {
    template: "speak.tier-0",
    id: id("speak.tier-0", s.id),
    item: s.id,
    kcs: s.kcs,
    orthography: ctx.course.orthography,
    prompt: form.text,
    translation: translation.text,
  };
};

export const SENTENCE_TEMPLATES: Readonly<Partial<Record<TemplateId, (ctx: MakeContext, s: BundleSentence) => Exercise | undefined>>> = {
  "choose-translation": makeChooseTranslation,
  "translate-tap.l2-l1": makeTapL2L1,
  "translate-tap.l1-l2": makeTapL1L2,
  "translate-type.l1-l2": makeTranslateType,
  "complete-translation": makeCompleteTranslation,
  "gap-fill": makeGapFill,
  "char-read": makeCharRead,
  "reading-disambiguation": makeReadingDisambiguation,
  "speak.tier-0": makeSpeak,
};

// ------------------------------------------------------------------------------------ grading

const choice = (index: number, answer: number, solution: TaggedText | undefined): Outcome => ({
  verdict: index === answer ? "CORRECT" : "WRONG",
  notes: [],
  solution,
});

const graded = (grader: Grader, ex: { readonly orthography: string; readonly accept: string }, answer: string, solution: TaggedText): Outcome => {
  const g = grader.grade(ex.orthography, ex.accept, answer);
  return { verdict: g.verdict, notes: g.notes, solution, alignment: g.alignment };
};

const mismatch = (ex: Exercise, response: Response): never => {
  throw new Error(`${ex.template} cannot take a ${response.tag} response`);
};

/** Pure: the outcome of a response (§8.3). Grading of typed and tiled answers goes through the grader. */
export const gradeExercise = (ex: Exercise, response: Response, grader: Grader): Outcome => {
  switch (ex.template) {
    case "select-image":
      return response.tag === "choice" ? choice(response.index, ex.answer, ex.options[ex.answer]?.text) : mismatch(ex, response);
    case "choose-translation":
    case "gap-fill":
    case "char-read":
    case "reading-disambiguation":
      return response.tag === "choice" ? choice(response.index, ex.answer, ex.options[ex.answer]) : mismatch(ex, response);
    case "match-pairs":
      return response.tag === "pairs" ? { verdict: "CORRECT", notes: response.mistakes > 0 ? ["pairs-mistakes"] : [] } : mismatch(ex, response);
    case "translate-tap.l2-l1":
    case "translate-tap.l1-l2":
      if (response.tag !== "tiles") return mismatch(ex, response);
      return graded(grader, ex, response.order.map((i) => surfaceOf(ex.tiles[i] as TaggedText)).join(ex.joiner), ex.canonical);
    case "translate-type.l1-l2":
      return response.tag === "text" ? graded(grader, ex, response.text, ex.canonical) : mismatch(ex, response);
    case "complete-translation":
      return response.tag === "text"
        ? graded(grader, ex, `${surfaceOf(ex.before)}${response.text}${surfaceOf(ex.after)}`, ex.canonical)
        : mismatch(ex, response);
    case "speak.tier-0":
      if (response.tag !== "self-rating") return mismatch(ex, response);
      return { verdict: response.rating === "again" ? "WRONG" : "CORRECT", notes: [] };
  }
};

/** The answer to reveal when an exercise is skipped. */
export const solutionOf = (ex: Exercise): TaggedText | undefined => {
  switch (ex.template) {
    case "select-image":
      return ex.options[ex.answer]?.text;
    case "choose-translation":
    case "gap-fill":
    case "char-read":
    case "reading-disambiguation":
      return ex.options[ex.answer];
    case "translate-tap.l2-l1":
    case "translate-tap.l1-l2":
    case "translate-type.l1-l2":
    case "complete-translation":
      return ex.canonical;
    case "speak.tier-0":
      return ex.prompt;
    case "match-pairs":
      return undefined;
  }
};
