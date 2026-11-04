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
  ListenSelect,
  ListenSpeak,
  ListenTap,
  ListenType,
  MatchPairs,
  MinimalPair,
  Outcome,
  ReadingDisambiguation,
  Response,
  SelectImage,
  Speak,
  SpeakScored,
  TemplateId,
  ToneIdentify,
  TranslateTap,
  TranslateType,
} from "./exercise.ts";
import type { Rng } from "./rng.ts";
import { gradeSpeech, toneSystemOf } from "../speech/score.ts";
import { expectedSyllables } from "../speech/tone.ts";

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
  // The tiles are handed to the learner, so no production credit (§8.5).
  "translate-tap.l1-l2": { facet: "recognize", modality: { audioOut: false, mic: false, input: "tiles" } },
  "translate-type.l1-l2": { facet: "produce", modality: { audioOut: false, mic: false, input: "text" } },
  "complete-translation": { facet: "produce", modality: { audioOut: false, mic: false, input: "text" } },
  "gap-fill": { facet: "produce", modality: { audioOut: false, mic: false, input: "choice" } },
  "char-read": { facet: "read-script", modality: { audioOut: false, mic: false, input: "choice" } },
  "reading-disambiguation": { facet: "read-script", modality: { audioOut: false, mic: false, input: "choice" } },
  "speak.tier-0": { facet: "speak", modality: { audioOut: false, mic: true, input: "voice" } },
  // Phase 9: scored speaking (tiers 1–3) and hearing tones.
  speak: { facet: "speak", modality: { audioOut: false, mic: true, input: "voice" } },
  "listen-speak": { facet: "speak", modality: { audioOut: true, mic: true, input: "voice" } },
  "tone-identify": { facet: "listen", modality: { audioOut: true, mic: false, input: "choice" } },
  "listen-tap": { facet: "listen", modality: { audioOut: true, mic: false, input: "tiles" } },
  "listen-type": { facet: "listen", modality: { audioOut: true, mic: false, input: "text" } },
  "listen-select": { facet: "listen", modality: { audioOut: true, mic: false, input: "choice" } },
  "minimal-pair": { facet: "listen", modality: { audioOut: true, mic: false, input: "choice" } },
  // Stories (Phase 6): reading comprehension exercises recognition of the line's words.
  "story-choose": { facet: "recognize", modality: { audioOut: false, mic: false, input: "choice" } },
  "story-complete": { facet: "recognize", modality: { audioOut: false, mic: false, input: "choice" } },
  "story-arrange": { facet: "recognize", modality: { audioOut: false, mic: false, input: "tiles" } },
};

/** Templates that play audio: "can't listen now" leaves them out (§10, §11.5). */
export const LISTENING: ReadonlySet<TemplateId> = new Set(
  (Object.keys(TEMPLATES) as TemplateId[]).filter((t) => TEMPLATES[t].modality.audioOut),
);

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

/** Each sentence's and KC's unit, by position in the course (built once per course). */
const unitIndex = new WeakMap<CourseView, ReadonlyMap<string, number>>();

const unitOf = (course: CourseView, id: string): number => {
  let index = unitIndex.get(course);
  if (index === undefined) {
    const built = new Map<string, number>();
    for (const [i, u] of course.units.entries()) {
      for (const s of u.sentences) if (!built.has(s.id)) built.set(s.id, i);
      for (const k of u.kcs) if (!built.has(k.id)) built.set(k.id, i);
    }
    index = built;
    unitIndex.set(course, index);
  }
  return index.get(id) ?? course.units.length;
};

/**
 * Distractors come from the item's own unit or an earlier one, so a word bank in the first lesson
 * never offers a word from the tenth unit (until the confusion log of §8.1 can choose them).
 */
const known = (course: CourseView, item: string): ((other: string) => boolean) => {
  const at = unitOf(course, item);
  return (other) => unitOf(course, other) <= at;
};

const otherSentences = (ctx: MakeContext, s: BundleSentence): readonly BundleSentence[] => {
  const before = known(ctx.course, s.id);
  return allSentences(ctx.course).filter((o) => o.id !== s.id && !o.id.startsWith("drill.") && before(o.id) && formOf(ctx.course, o) !== undefined);
};

const otherKcs = (ctx: MakeContext, kc: BundleKc): readonly BundleKc[] => {
  const before = known(ctx.course, kc.id);
  return allKcs(ctx.course).filter((k) => k.id !== kc.id && before(k.id));
};

// ------------------------------------------------------------------------------------ KC templates

const pictured = (ctx: MakeContext, kc: BundleKc): boolean =>
  kc.image !== undefined && (kc.forms?.[ctx.course.orthography]?.length ?? 0) > 0 && kc.gloss?.[ctx.course.supportKey] !== undefined;

export const makeSelectImage = (ctx: MakeContext, kc: BundleKc): SelectImage | undefined => {
  if (!pictured(ctx, kc)) return undefined;
  const { orthography, supportKey } = ctx.course;
  const option = (k: BundleKc) => ({ text: k.forms?.[orthography]?.[0] as TaggedText, image: k.image as string });
  const pool = otherKcs(ctx, kc).filter((k) => pictured(ctx, k) && k.image !== kc.image);
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

// ------------------------------------------------------------------------------------ listening templates

const audioOf = (ctx: MakeContext, item: string) => ctx.course.audio[item];

/** Speak, scored (§10.4 tiers 1–3): any sentence; its clip, when there is one, to compare with. */
export const makeSpeakScored = (ctx: MakeContext, s: BundleSentence): SpeakScored | undefined => {
  const tier0 = makeSpeak(ctx, s);
  if (tier0 === undefined) return undefined;
  const audio = audioOf(ctx, s.id);
  return { ...tier0, template: "speak", id: id("speak", s.id), ...(audio === undefined ? {} : { audio }) };
};

/** Listen, then say it: needs the sentence's clip. */
export const makeListenSpeak = (ctx: MakeContext, s: BundleSentence): ListenSpeak | undefined => {
  const audio = audioOf(ctx, s.id);
  const tier0 = makeSpeak(ctx, s);
  if (audio === undefined || tier0 === undefined) return undefined;
  return { ...tier0, template: "listen-speak", id: id("listen-speak", s.id), audio };
};

/** Which tone? A sentence of one syllable in a tonal reading scheme, with a clip (number drills, one-word answers). */
export const makeToneIdentify = (ctx: MakeContext, s: BundleSentence): ToneIdentify | undefined => {
  const audio = audioOf(ctx, s.id);
  const form = formOf(ctx.course, s);
  if (audio === undefined || form === undefined) return undefined;
  const system = toneSystemOf(form.text);
  if (system === undefined) return undefined;
  const syllables = expectedSyllables(form.text, system);
  const only = syllables[0];
  if (syllables.length !== 1 || only === undefined) return undefined;
  const tones = Object.keys(system.tones);
  const answer = tones.indexOf(only.tone);
  if (answer < 0) return undefined;
  return {
    template: "tone-identify",
    id: id("tone-identify", s.id),
    item: s.id,
    kcs: s.kcs,
    orthography: ctx.course.orthography,
    audio,
    syllable: form.text,
    system: system.id,
    tones,
    answer,
  };
};

export const makeListenTap = (ctx: MakeContext, s: BundleSentence): ListenTap | undefined => {
  const audio = audioOf(ctx, s.id);
  const form = formOf(ctx.course, s);
  const translation = translationOf(ctx.course, s);
  if (audio === undefined || form?.reverse === undefined || translation === undefined) return undefined;
  const tap = makeTap(
    ctx,
    s,
    "translate-tap.l1-l2",
    translation.text,
    form.text,
    form.reverse,
    otherSentences(ctx, s).flatMap((o) => formOf(ctx.course, o)?.text ?? []),
  );
  if (tap === undefined) return undefined;
  const { prompt: _prompt, template: _template, id: _id, ...rest } = tap;
  return { ...rest, template: "listen-tap", id: id("listen-tap", s.id), audio, translation: translation.text };
};

export const makeListenType = (ctx: MakeContext, s: BundleSentence): ListenType | undefined => {
  const audio = audioOf(ctx, s.id);
  const form = formOf(ctx.course, s);
  const translation = translationOf(ctx.course, s);
  if (audio === undefined || form?.reverse === undefined || translation === undefined) return undefined;
  return {
    template: "listen-type",
    id: id("listen-type", s.id),
    item: s.id,
    kcs: s.kcs,
    orthography: ctx.course.orthography,
    audio,
    accept: form.reverse,
    canonical: form.text,
    translation: translation.text,
  };
};

const writtenForm = (ctx: MakeContext, kc: BundleKc): TaggedText | undefined => kc.forms?.[ctx.course.orthography]?.[0];

export const makeListenSelect = (ctx: MakeContext, kc: BundleKc): ListenSelect | undefined => {
  const audio = audioOf(ctx, kc.id);
  const word = writtenForm(ctx, kc);
  if (audio === undefined || word === undefined) return undefined;
  const pool = otherKcs(ctx, kc).flatMap((k) => writtenForm(ctx, k) ?? []);
  const others = pickDistinct(ctx, pool, [word], 2);
  if (others.length < 2) return undefined;
  const { options, answer } = withAnswer(ctx, word, others);
  return { template: "listen-select", id: id("listen-select", kc.id), item: kc.id, kcs: [kc.id], orthography: ctx.course.orthography, audio, options, answer };
};

const distance = <T>(a: readonly T[], b: readonly T[]): number => {
  let row = b.map((_, j) => j + 1);
  for (const [i, x] of a.entries()) {
    const next = [i + 1];
    for (const [j, y] of b.entries()) next.push(Math.min((row[j] ?? 0) + 1, (next[j] ?? 0) + 1, (j === 0 ? i : (row[j - 1] ?? 0)) + (x === y ? 0 : 1)));
    row = next.slice(1);
  }
  return row[b.length - 1] ?? a.length;
};

/**
 * Pinned readings by surface, per course view and scheme: the first sentence token (in course
 * order) that spells the word gives its reading. Indexed once, as a course has hundreds of
 * sentences and minimal pairs compare every word with every other.
 */
const readingIndex = new WeakMap<CourseView, Map<SchemeId, ReadonlyMap<string, string>>>();

/** The pinned reading of a written word, from any sentence token that spells it. */
const readingOf = (ctx: MakeContext, scheme: SchemeId, surface: string): string | undefined => {
  let byScheme = readingIndex.get(ctx.course);
  if (byScheme === undefined) {
    byScheme = new Map();
    readingIndex.set(ctx.course, byScheme);
  }
  let index = byScheme.get(scheme);
  if (index === undefined) {
    const built = new Map<string, string>();
    for (const s of allSentences(ctx.course)) {
      for (const t of formOf(ctx.course, s)?.text.tokens ?? []) {
        const reading = t.readings?.[scheme];
        if (reading !== undefined && !built.has(t.surface)) built.set(t.surface, reading);
      }
    }
    index = built;
    byScheme.set(scheme, index);
  }
  return index.get(surface);
};

/**
 * Two words a learner must hear apart: with pinned readings (Jyutping), the same number of
 * syllables and one syllable one sound or tone off (maa1 / maa5); otherwise one letter apart
 * in writing (the profile's letters: Uzbek oʻ is one).
 */
const minimallyApart = (ctx: MakeContext, a: TaggedText, b: TaggedText): boolean => {
  const scheme = rubySchemeOf(ctx);
  if (scheme !== undefined) {
    const ra = readingOf(ctx, scheme, surfaceOf(a))?.split(" ");
    const rb = readingOf(ctx, scheme, surfaceOf(b))?.split(" ");
    if (ra === undefined || rb === undefined || ra.length !== rb.length) return false;
    const differing = ra.flatMap((syllable, i) => (syllable === rb[i] ? [] : [[[...syllable], [...(rb[i] ?? "")]] as const]));
    const [only] = differing;
    return differing.length === 1 && only !== undefined && distance(only[0], only[1]) === 1;
  }
  const profile = profileOf(ctx.course, ctx.course.orthography);
  const la = profile.letters(surfaceOf(a));
  const lb = profile.letters(surfaceOf(b));
  return la.length >= 2 && lb.length >= 2 && distance(la, lb) === 1;
};

export const makeMinimalPair = (ctx: MakeContext, kc: BundleKc): MinimalPair | undefined => {
  const audio = audioOf(ctx, kc.id);
  const word = writtenForm(ctx, kc);
  if (audio === undefined || word === undefined) return undefined;
  const rivals = otherKcs(ctx, kc).flatMap((k) => {
    const other = writtenForm(ctx, k);
    return other !== undefined && keyOf(ctx.course, other) !== keyOf(ctx.course, word) && minimallyApart(ctx, word, other) ? [other] : [];
  });
  const rival = ctx.rng.shuffle(rivals)[0];
  if (rival === undefined) return undefined;
  const { options, answer } = withAnswer(ctx, word, [rival]);
  return { template: "minimal-pair", id: id("minimal-pair", kc.id), item: kc.id, kcs: [kc.id], orthography: ctx.course.orthography, audio, options, answer };
};

/** KC templates that need a clip of the word. */
export const KC_LISTENING: readonly ((ctx: MakeContext, kc: BundleKc) => Exercise | undefined)[] = [makeListenSelect, makeMinimalPair];

/** Templates built from one KC, by id: mistakes mode rebuilds a missed one. */
export const KC_TEMPLATES: Readonly<Partial<Record<TemplateId, (ctx: MakeContext, kc: BundleKc) => Exercise | undefined>>> = {
  "select-image": makeSelectImage,
  "listen-select": makeListenSelect,
  "minimal-pair": makeMinimalPair,
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
  speak: makeSpeakScored,
  "listen-speak": makeListenSpeak,
  "tone-identify": makeToneIdentify,
  "listen-tap": makeListenTap,
  "listen-type": makeListenType,
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
    case "listen-select":
    case "minimal-pair":
    case "story-choose":
    case "story-complete":
      return response.tag === "choice" ? choice(response.index, ex.answer, ex.options[ex.answer]) : mismatch(ex, response);
    case "tone-identify":
      return response.tag === "choice" ? choice(response.index, ex.answer, ex.syllable) : mismatch(ex, response);
    case "speak":
    case "listen-speak": {
      // Without a microphone the learner rates themselves, as at tier 0.
      if (response.tag === "self-rating") return { verdict: response.rating === "again" ? "WRONG" : "CORRECT", notes: [], solution: ex.prompt };
      if (response.tag !== "speech") return mismatch(ex, response);
      const { verdict, notes, offTokens } = gradeSpeech(response.result);
      return { verdict, notes, solution: ex.prompt, offTokens };
    }
    case "story-arrange": {
      if (response.tag !== "tiles") return mismatch(ex, response);
      // The line's own words in its order; tiles that read the same are interchangeable.
      const read = (order: readonly number[]): string => JSON.stringify(order.map((i) => surfaceOf(ex.tiles[i] as TaggedText)));
      return { verdict: read(response.order) === read(ex.solution) ? "CORRECT" : "WRONG", notes: [], solution: ex.canonical };
    }
    case "match-pairs":
      return response.tag === "pairs" ? { verdict: "CORRECT", notes: response.mistakes > 0 ? ["pairs-mistakes"] : [] } : mismatch(ex, response);
    case "translate-tap.l2-l1":
    case "translate-tap.l1-l2":
    case "listen-tap":
      if (response.tag !== "tiles") return mismatch(ex, response);
      return graded(grader, ex, response.order.map((i) => surfaceOf(ex.tiles[i] as TaggedText)).join(ex.joiner), ex.canonical);
    case "translate-type.l1-l2":
    case "listen-type":
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
    case "listen-select":
    case "minimal-pair":
    case "story-choose":
    case "story-complete":
      return ex.options[ex.answer];
    case "story-arrange":
      return ex.canonical;
    case "translate-tap.l2-l1":
    case "translate-tap.l1-l2":
    case "translate-type.l1-l2":
    case "complete-translation":
    case "listen-tap":
    case "listen-type":
      return ex.canonical;
    case "speak.tier-0":
    case "speak":
    case "listen-speak":
      return ex.prompt;
    case "tone-identify":
      return ex.syllable;
    case "match-pairs":
      return undefined;
  }
};
