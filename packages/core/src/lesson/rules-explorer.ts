/**
 * The rules explorer (debug mode; docs/rules-design.md): a lexeme of the course's language realised in
 * a cell, with other lexemes written onto it as a token writes them (before it or after it, in order),
 * and the form spelled by each of the course's orthographies and their marked layers, as it is changed.
 * It reads the lexicon's own files (lexicons/<lang>/*.yaml and the course's profiles, beside the app as
 * lexicon-source/<course>.json), so what it shows is what the rules as written give now, and it runs
 * the same @nabu/core functions the compiler's token check runs (`compileLanguage`, `realiseToken`,
 * `compileSpeller`, `spell`, `spelledAs`): a check made by hand, for whoever writes rules. Nothing a
 * learner does reaches it: lessons and grading read the bundle's paradigms, never a realisation made on
 * the device.
 *
 * What the page shows is laid out here: the lexemes to pick from (the Data page's rows), each with the
 * features a cell of it may set (its category's dimensions and lexical features, and what it chooses);
 * a realisation (its lexical form, status, every rule and branch taken, and its spellings with their
 * free alternatives) or what went wrong; how the course's own tokens write the lexeme, each realised and
 * compared as the compiler compares it; and the lexeme's paradigm over the cells the course lists.
 *
 * Pure: the caller fetches the files and passes them in. Built once per course and source.
 */
import type { LanguageDeclaration, Lexicon, OrthographyProfile, TaggedText, Token, UdFeatures } from "@nabu/schema";
import { compileLanguage, compileSpeller, realiseToken, spell, spelledAs, spellingKey, type CompiledLanguage, type RealiseError, type Speller, type WrittenLexeme } from "../lexicon/index.ts";
import type { CourseView } from "./course.ts";
import { courseTags, lexiconData, type LexemeRow, type LexiconSource, type Tags } from "./lexicon-data.ts";
import { cellFeats } from "./paradigms.ts";

/** A lexeme to explore: the Data page's row, and the features a cell of it may set. */
export interface ExplorerLexeme {
  readonly row: LexemeRow;
  /** Its part of speech, where it has one (an affix has none). */
  readonly pos?: string | undefined;
  /** Each feature a cell of it may set (its category's dimensions, its lexical features, what it chooses), with the language's values of it. */
  readonly features: readonly { readonly feature: string; readonly values: readonly string[] }[];
}

/** An orthography (or one of its marked layers) the explorer spells in. */
export interface ExplorerOrthography {
  readonly orthography: string;
  /** The layer (apc's `vocalized`), for a layer's own statement. */
  readonly layer?: string | undefined;
  /** Whether it states how it spells a lexical form: one that does not (a logographic script) is shown as such. */
  readonly spells: boolean;
}

/** What keeps the explorer from realising or spelling: the language's rules, or a statement, that do not compile. */
export type ExplorerProblem =
  | { readonly kind: "no-notation" }
  | { readonly kind: "language"; readonly errors: readonly string[] }
  | { readonly kind: "spell"; readonly orthography: string; readonly layer?: string | undefined; readonly errors: readonly string[] };

export interface RulesExplorer {
  readonly course: CourseView;
  readonly lexemes: readonly ExplorerLexeme[];
  readonly orthographies: readonly ExplorerOrthography[];
  readonly problems: readonly ExplorerProblem[];
  /** The language compiled, where its notation and rules compile. */
  readonly compiled?: CompiledLanguage | undefined;
  readonly spellers: ReadonlyMap<string, Speller>;
  readonly tags: Tags;
}

/** A lexeme written beside the base, with the values the token gives it where it gives any (es buscarlos: lo in the plural). */
export interface Attached {
  readonly lexeme: string;
  readonly feats?: UdFeatures | undefined;
}

/** A realisation asked for: the base lexeme in its cell, the lexemes written before and after it, and how blocking runs. */
export interface ExploreRequest {
  readonly base: string;
  readonly feats: UdFeatures;
  /** Written before the base, in order (a proclitic, a prefix). */
  readonly before: readonly Attached[];
  /** Written after it, in order (a suffix, an enclitic). */
  readonly after: readonly Attached[];
  /** The base of the next word, where an allomorph is chosen by it (`before: {pos}`). */
  readonly next?: string | undefined;
  /** false: listed forms and stated classes passed over, pinned ones kept (ADR 0145: what a learner would regularise). */
  readonly blocking: boolean;
  /** false: pinned forms passed over: what the rules alone give. */
  readonly pinned: boolean;
  /** false: forms that pin spellings only passed over, as the compiler's token check does. */
  readonly spellings: boolean;
}

/** The defaults: as the compiler checks the course's tokens. */
export const EXPLORE_DEFAULTS: Pick<ExploreRequest, "blocking" | "pinned" | "spellings"> = { blocking: true, pinned: true, spellings: false };

/** One rule taken, with its gloss where the language names it (`rules`). */
export interface ExploredStep {
  readonly rule: string;
  readonly branch?: string | undefined;
  readonly gloss?: TaggedText | undefined;
}

/** A form spelled in an orthography (or a layer of it): its spelling and free alternatives; none where it states no statement. */
export interface ExploredSpelling extends ExplorerOrthography {
  readonly spelling?: TaggedText | undefined;
  readonly alternatives: readonly { readonly spelling: TaggedText; readonly by: readonly string[] }[];
}

/** What went wrong, as the engine says it: its kind and its details, as code. */
export interface ExploredError {
  readonly kind: RealiseError["kind"] | "not-ready";
  readonly details: readonly { readonly key: string; readonly value: string }[];
}

export type Explored =
  | {
      readonly ok: true;
      /** The lexical form, boundaries (+) kept, as text of the language's own script. */
      readonly form: TaggedText;
      readonly status: "given" | "pinned" | "listed";
      /** The listed part it used (lexeme:tener|stem:tuv). */
      readonly listed?: string | undefined;
      readonly steps: readonly ExploredStep[];
      readonly spellings: readonly ExploredSpelling[];
      /** The token's free variants (a scribe's other spelling of a suffix: a free allomorph), each form with its spellings. */
      readonly variants: readonly { readonly form: TaggedText; readonly spellings: readonly ExploredSpelling[] }[];
    }
  | { readonly ok: false; readonly error: ExploredError };

/** How the course's tokens write a lexeme: one way, with where, what it asks the explorer, and whether the rules give it. */
export interface ExplorerWay {
  readonly orthography: string;
  readonly text: TaggedText;
  readonly request: ExploreRequest;
  /** The sentences and story lines that write it so. */
  readonly items: readonly string[];
  /**
   * As the compiler's token check has it: the orthography's spelling, a free alternative, a free
   * variant of the token (one of its lexemes' free allomorphs), another spelling (`differs`:
   * `form.unaccounted`), no statement to compare with, or nothing realised.
   */
  readonly verdict: "spelling" | "alternative" | "variant" | "differs" | "unspelled" | "error";
  readonly spelled?: TaggedText | undefined;
}

/** A cell of a lexeme's paradigm, realised. */
export interface ExplorerCell {
  /** As the lexicon keys it (Aspect=Imp;Mood=Ind;…). */
  readonly cell: string;
  readonly feats: UdFeatures;
  readonly result: Explored;
}

const isObject = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === "object" && value !== null && !Array.isArray(value);

const stringsOf = (value: unknown): readonly string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);

const tagged = (tag: Pick<TaggedText, "lang" | "orthography">, value: string): TaggedText => ({ ...tag, tokens: [{ surface: value.normalize("NFC"), kind: "lexical" }] });

const keyOf = (orthography: string, layer: string | undefined): string => (layer === undefined ? orthography : `${orthography}#${layer}`);

/** A cell as the lexicon keys it: Name=Value, sorted, `;`. */
export const cellKey = (feats: UdFeatures): string =>
  Object.keys(feats)
    .sort()
    .map((k) => `${k}=${feats[k] ?? ""}`)
    .join(";");

const built = new WeakMap<CourseView, WeakMap<LexiconSource, RulesExplorer>>();

/** The explorer for a course, from its lexicon's own files. */
export const rulesExplorer = (course: CourseView, source: LexiconSource): RulesExplorer => {
  let bySource = built.get(course);
  if (bySource === undefined) {
    bySource = new WeakMap();
    built.set(course, bySource);
  }
  const cached = bySource.get(source);
  if (cached !== undefined) return cached;

  const declared = (source.language ?? {}) as unknown as LanguageDeclaration;
  const lexicon = source.lexemes as unknown as Lexicon;
  const entries = new Map<string, Readonly<Record<string, unknown>>>();
  for (const entry of source.lexemes.lexemes) if (typeof entry["id"] === "string") entries.set(entry["id"], entry);
  const dimensions = isObject(declared.dimensions) ? (declared.dimensions as Readonly<Record<string, readonly string[]>>) : {};
  const lexicalFeatures = isObject(declared.lexical) ? (declared.lexical as Readonly<Record<string, readonly string[]>>) : {};
  const values = isObject(declared.features) ? (declared.features as Readonly<Record<string, readonly string[]>>) : {};

  const rows = lexiconData(course, source).lexemes;
  const lexemes = rows.map((row): ExplorerLexeme => {
    const entry = entries.get(row.id.id);
    const pos = typeof entry?.["pos"] === "string" ? entry["pos"] : row.lexeme?.pos;
    const names = [...(pos === undefined ? [] : [...(dimensions[pos] ?? []), ...(lexicalFeatures[pos] ?? [])]), ...stringsOf(entry?.["chooses"])];
    const features = [...new Set(names)].map((feature) => ({ feature, values: stringsOf(values[feature]) }));
    return { row, pos, features };
  });

  const problems: ExplorerProblem[] = [];
  let compiled: CompiledLanguage | undefined;
  const notation = declared.notation;
  if (notation === undefined) problems.push({ kind: "no-notation" });
  else {
    const made = compileLanguage(declared, lexicon);
    if (made.ok) compiled = made.value;
    else problems.push({ kind: "language", errors: made.error });
  }

  // The course's orthographies (not the support language's), the one being learned first, each with its layers.
  const ids = [course.orthography, ...[...course.profiles.keys()].filter((o) => o !== course.orthography && o !== course.support)];
  const orthographies: ExplorerOrthography[] = [];
  const spellers = new Map<string, Speller>();
  for (const orthography of ids) {
    const profile = source.profiles?.[orthography] as OrthographyProfile | undefined;
    const add = (layer: string | undefined, statement: unknown): void => {
      if (statement === undefined || profile === undefined || notation === undefined) {
        orthographies.push({ orthography, ...(layer === undefined ? {} : { layer }), spells: false });
        return;
      }
      const made = compileSpeller(profile, notation, layer);
      if (made.ok) spellers.set(keyOf(orthography, layer), made.value);
      else problems.push({ kind: "spell", orthography, ...(layer === undefined ? {} : { layer }), errors: made.error });
      orthographies.push({ orthography, ...(layer === undefined ? {} : { layer }), spells: made.ok });
    };
    add(undefined, profile?.spell);
    for (const annotation of profile?.annotations ?? []) if (annotation.spell !== undefined) add(annotation.id, annotation.spell);
  }

  const explorer: RulesExplorer = { course, lexemes, orthographies, problems, compiled, spellers, tags: courseTags(course) };
  bySource.set(source, explorer);
  return explorer;
};

const detailsOf = (error: RealiseError): ExploredError["details"] => {
  switch (error.kind) {
    case "unknown-lexeme":
    case "form":
      return [{ key: "lexeme", value: error.lexeme }];
    case "no-rule":
      return [{ key: "cell", value: cellKey(error.cell) || "-" }];
    case "spelled-only":
      return [{ key: "cell", value: cellKey(error.feats) || "-" }];
    case "tie":
      return [{ key: "forms", value: error.forms.join(" | ") }];
    case "template":
      return [
        { key: "stem", value: error.stem || "-" },
        { key: "root", value: error.root || "-" },
      ];
    case "variant":
      return [{ key: "variants", value: String(error.variants) }];
  }
};

/** The lexemes of a request, as a token lists them: those before the base, the base with its values, those after it. */
const writtenOf = (request: ExploreRequest): readonly WrittenLexeme[] => {
  const base: WrittenLexeme = { lexeme: request.base, feats: request.feats, base: true };
  const beside = (a: Attached): WrittenLexeme => (a.feats === undefined || Object.keys(a.feats).length === 0 ? { lexeme: a.lexeme } : { lexeme: a.lexeme, feats: a.feats });
  return [...request.before.map(beside), base, ...request.after.map(beside)];
};

/** A request realised and spelled, as the compiler's token check does it (`strict` as the bundle's paradigms are). */
export const explore = (explorer: RulesExplorer, request: ExploreRequest, strict = false): Explored => {
  const lang = explorer.compiled;
  if (lang === undefined) return { ok: false, error: { kind: "not-ready", details: [] } };
  const result = realiseToken(lang, writtenOf(request), {
    blocking: request.blocking,
    pinned: request.pinned,
    spellings: request.spellings,
    ...(request.next === undefined ? {} : { next: request.next }),
    ...(strict ? { strict: true } : {}),
  });
  if (!result.ok) return { ok: false, error: { kind: result.error.kind, details: detailsOf(result.error) } };
  const { form, status, steps, listed, alternatives } = result.value;
  const support = explorer.course.supportKey;
  const glossOf = (rule: string): TaggedText | undefined => (explorer.course.lexicon.rules ?? []).find((r) => r.id === rule)?.gloss?.[support];
  const spellingsOf = (text: string): readonly ExploredSpelling[] =>
    explorer.orthographies.map((o): ExploredSpelling => {
      const speller = explorer.spellers.get(keyOf(o.orthography, o.layer));
      if (speller === undefined) return { ...o, alternatives: [] };
      const tag = explorer.tags.orthography(o.orthography);
      const spelled = spell(speller, text);
      return { ...o, spelling: tagged(tag, spelled.spelling), alternatives: spelled.alternatives.map((a) => ({ spelling: tagged(tag, a.spelling), by: a.by })) };
    });
  const spellings = spellingsOf(form);
  return {
    ok: true,
    form: tagged(explorer.tags.own(form), form),
    status,
    ...(listed === undefined ? {} : { listed }),
    steps: steps.map((s) => {
      const gloss = glossOf(s.rule);
      return { rule: s.rule, ...(s.branch === undefined ? {} : { branch: s.branch }), ...(gloss === undefined ? {} : { gloss }) };
    }),
    spellings,
    variants: (alternatives ?? []).map((a) => ({ form: tagged(explorer.tags.own(a.form), a.form), spellings: spellingsOf(a.form) })),
  };
};

/** Each token of a text, with the base lexeme of the next token that writes one (what an allomorph may be chosen by). */
const tokensOf = (text: TaggedText): readonly { readonly token: Token; readonly next: string | undefined }[] => {
  const tokens = text.tokens;
  const baseOf = (t: Token): string | undefined => {
    const lexemes = t.lexemes ?? [];
    return lexemes.length === 1 ? lexemes[0]?.lexeme : lexemes.find((l) => l.base === true)?.lexeme;
  };
  return tokens.map((token, i) => ({ token, next: tokens.slice(i + 1).map(baseOf).find((b) => b !== undefined) }));
};

const attachedOf = (l: { readonly lexeme: string; readonly feats?: UdFeatures | undefined }): Attached =>
  l.feats === undefined || Object.keys(l.feats).length === 0 ? { lexeme: l.lexeme } : { lexeme: l.lexeme, feats: l.feats };

/** The request a token makes of the explorer: its lexemes around its base, the base's values, the next word's base. */
export const requestOfToken = (token: Token, next: string | undefined): ExploreRequest | undefined => {
  const lexemes = token.lexemes ?? [];
  const at = lexemes.length === 1 ? 0 : lexemes.findIndex((l) => l.base === true);
  const base = lexemes[at];
  if (base === undefined) return undefined;
  return {
    base: base.lexeme,
    feats: base.feats ?? {},
    before: lexemes.slice(0, at).map(attachedOf),
    after: lexemes.slice(at + 1).map(attachedOf),
    ...(next === undefined ? {} : { next }),
    ...EXPLORE_DEFAULTS,
  };
};

const ways = new WeakMap<RulesExplorer, Map<string, readonly ExplorerWay[]>>();

/**
 * How the course's sentences and story lines write a lexeme as a token's base, each way once per
 * orthography (its spelling, lexemes and values alike; the next word of its first token), with the rules' verdict on it as the
 * compiler's token check gives it: realised with forms that pin spellings only passed over, spelled
 * by the orthography's statement, compared as its profile keys a word.
 */
export const waysOf = (explorer: RulesExplorer, base: string): readonly ExplorerWay[] => {
  let byBase = ways.get(explorer);
  if (byBase === undefined) {
    byBase = new Map();
    ways.set(explorer, byBase);
  }
  const cached = byBase.get(base);
  if (cached !== undefined) return cached;
  const found = new Map<string, { orthography: string; text: TaggedText; request: ExploreRequest; items: string[] }>();
  const visit = (item: string, orthography: string, text: TaggedText): void => {
    for (const { token, next } of tokensOf(text)) {
      const request = requestOfToken(token, next);
      if (request === undefined || request.base !== base) continue;
      // The next word is kept with the first way only: where it chooses an allomorph, the surface differs anyway.
      const side = (list: readonly Attached[]): readonly string[] => list.map((a) => `${a.lexeme}|${cellKey(a.feats ?? {})}`);
      const key = JSON.stringify([orthography, token.surface, side(request.before), side(request.after), cellKey(request.feats)]);
      const way = found.get(key);
      if (way !== undefined) {
        if (!way.items.includes(item)) way.items.push(item);
        continue;
      }
      found.set(key, { orthography, text: { lang: text.lang, orthography: text.orthography, tokens: [token] }, request, items: [item] });
    }
  };
  for (const unit of explorer.course.units) {
    for (const s of unit.sentences) for (const [orthography, form] of Object.entries(s.forms)) visit(s.id, orthography, form.text);
    for (const story of unit.stories ?? []) {
      story.steps.forEach((step, i) => {
        if ("line" in step && step.line !== undefined) for (const [orthography, text] of Object.entries(step.line.forms)) visit(`${story.id}#${String(i)}`, orthography, text);
      });
    }
  }
  const out = [...found.values()]
    .filter((w) => w.orthography !== explorer.course.support)
    .map((w): ExplorerWay => {
      const result = explore(explorer, w.request);
      if (!result.ok) return { ...w, verdict: "error" };
      const spelled = result.spellings.find((s) => s.orthography === w.orthography && s.layer === undefined);
      const profile = explorer.course.profiles.get(w.orthography);
      const speller = explorer.spellers.get(w.orthography);
      if (spelled?.spelling === undefined || profile === undefined || speller === undefined) return { ...w, verdict: "unspelled" };
      const surface = w.text.tokens[0]?.surface ?? "";
      const key = spellingKey(profile);
      const form = result.form.tokens[0]?.surface ?? "";
      // A phrase lexeme written over several tokens (buenos días): each token is one word of it, as the compiler checks it.
      const part = form.includes(" ") && !surface.includes(" ");
      const as = spelledAs(spell(speller, form), surface, key, part);
      if (as !== undefined) return { ...w, verdict: as, spelled: spelled.spelling };
      // A free variant's spelling, as the compiler's check accepts it.
      const variant = result.variants.some((v) => spelledAs(spell(speller, v.form.tokens[0]?.surface ?? ""), surface, key, part) !== undefined);
      return { ...w, verdict: variant ? "variant" : "differs", spelled: spelled.spelling };
    });
  byBase.set(base, out);
  return out;
};

/**
 * The cells a lexeme's paradigm is shown in: the bundle's (`cells` of its category: those the course
 * teaches) where it lists them, else every cell the course's tokens give its category, cut to the
 * features a cell of it may set.
 */
export const cellsOf = (explorer: RulesExplorer, lexeme: ExplorerLexeme): readonly UdFeatures[] => {
  const pos = lexeme.pos;
  if (pos === undefined) return [];
  const listed = explorer.course.lexicon.cells?.[pos];
  if (listed !== undefined) return listed.map(cellFeats);
  const names = new Set(lexeme.features.map((f) => f.feature));
  const posOf = new Map(explorer.lexemes.map((l) => [l.row.id.id, l.pos]));
  const out = new Map<string, UdFeatures>();
  const visit = (text: TaggedText): void => {
    for (const token of text.tokens) {
      const request = requestOfToken(token, undefined);
      if (request === undefined || posOf.get(request.base) !== pos) continue;
      const cell = Object.fromEntries(Object.entries(request.feats).filter(([k]) => names.has(k)));
      if (Object.keys(cell).length > 0) out.set(cellKey(cell), cell);
    }
  };
  for (const unit of explorer.course.units) {
    for (const s of unit.sentences) for (const form of Object.values(s.forms)) visit(form.text);
    for (const story of unit.stories ?? []) for (const step of story.steps) if ("line" in step && step.line !== undefined) for (const text of Object.values(step.line.forms)) visit(text);
  }
  return [...out.values()].sort((a, b) => cellKey(a).localeCompare(cellKey(b), "en"));
};

/** A lexeme's paradigm: each cell realised alone (`strict`, as the bundle's are), with the request's blocking. */
export const explorerParadigm = (explorer: RulesExplorer, lexeme: ExplorerLexeme, options: Pick<ExploreRequest, "blocking" | "pinned" | "spellings">): readonly ExplorerCell[] =>
  cellsOf(explorer, lexeme).map((feats) => ({ cell: cellKey(feats), feats, result: explore(explorer, { base: lexeme.row.id.id, feats, before: [], after: [], ...options }, true) }));

/**
 * A request as the page's address keeps it, and back: URL search parameters (b the base, f its
 * values as a cell key, p and s the lexemes before and after it (each its id, and where the token gives
 * it values, `|` and them as a cell key), n the next word, o the options
 * turned off). Ids are as the lexicon writes them.
 */
export const encodeExplore = (request: ExploreRequest): string => {
  const params = new URLSearchParams();
  params.set("b", request.base);
  const feats = cellKey(request.feats);
  if (feats !== "") params.set("f", feats);
  const side = (list: readonly Attached[]): string => list.map((a) => (a.feats === undefined || Object.keys(a.feats).length === 0 ? a.lexeme : `${a.lexeme}|${cellKey(a.feats)}`)).join(",");
  if (request.before.length > 0) params.set("p", side(request.before));
  if (request.after.length > 0) params.set("s", side(request.after));
  if (request.next !== undefined) params.set("n", request.next);
  const off = [...(request.blocking ? [] : ["blocking"]), ...(request.pinned ? [] : ["pinned"]), ...(request.spellings === EXPLORE_DEFAULTS.spellings ? [] : ["spellings"])];
  if (off.length > 0) params.set("o", off.join(","));
  return params.toString();
};

const attachedOfKey = (key: string): Attached => {
  const bar = key.indexOf("|");
  if (bar < 0) return { lexeme: key };
  const feats = cellFeats(key.slice(bar + 1));
  return Object.keys(feats).length === 0 ? { lexeme: key.slice(0, bar) } : { lexeme: key.slice(0, bar), feats };
};

export const decodeExplore = (encoded: string): ExploreRequest | undefined => {
  const params = new URLSearchParams(encoded);
  const base = params.get("b");
  if (base === null || base === "") return undefined;
  const list = (key: string): readonly string[] => (params.get(key) ?? "").split(",").filter((x) => x !== "");
  const off = new Set(list("o"));
  const next = params.get("n");
  return {
    base,
    feats: cellFeats(params.get("f") ?? ""),
    before: list("p").map(attachedOfKey),
    after: list("s").map(attachedOfKey),
    ...(next === null || next === "" ? {} : { next }),
    blocking: !off.has("blocking"),
    pinned: !off.has("pinned"),
    spellings: off.has("spellings") ? !EXPLORE_DEFAULTS.spellings : EXPLORE_DEFAULTS.spellings,
  };
};
