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
import { compileLanguage, compileSpeller, mergeable, mergeFor, mergeOrder, realiseToken, spell, spelledAs, spellingKey, type CompiledLanguage, type RealiseError, type Speller, type WrittenLexeme } from "../lexicon/index.ts";
import type { CourseView } from "./course.ts";
import { courseTags, lexiconData, type LexemeRow, type LexiconSource, type Tags } from "./lexicon-data.ts";
import { cellFeats } from "./paradigms.ts";

/** A lexeme to explore: the Data page's row, and the features a cell of it may set. */
export interface ExplorerLexeme {
  readonly row: LexemeRow;
  /** Its part of speech, where it has one (an affix has none). */
  readonly pos?: string | undefined;
  /** Each feature a cell of it may set (its category's dimensions and what it chooses, never a lexical feature it does not choose), with the language's values of it. */
  readonly features: readonly { readonly feature: string; readonly values: readonly string[] }[];
  /**
   * The cell it is cited in, where it is first picked: its own `citation`, else its category's
   * (language.yaml: es's infinitive, apc's and hbo's 3ms perfect), its stored lexical values left out.
   */
  readonly citation: UdFeatures;
  /**
   * Which side of its base it stands, where its entry says (`on.at`, ADR 0158): it is written there, never asked;
   * else the side the course writes it on more often.
   */
  readonly at?: "before" | "after" | undefined;
  /** In a language that merges lexemes, the cell it is cited in: the lexemes that bring it open it (`opening`). */
  readonly citationCell?: UdFeatures | undefined;
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
  /** The language merges lexemes (ADR 0158: it states `requires`): no lexeme has switches; a word's values are its lexemes'. */
  readonly merging: boolean;
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
      /** In a language that merges lexemes: the values the word's lexemes bring, and those it still needs (none: complete). */
      readonly feats?: UdFeatures | undefined;
      readonly missing?: readonly string[] | undefined;
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
  const citations = isObject(declared.citation) ? (declared.citation as Readonly<Record<string, unknown>>) : {};
  const merging = isObject(declared.requires);

  const rows = lexiconData(course, source).lexemes;
  // How often the course writes each lexeme before and after a token's base.
  const written = new Map<string, { before: number; after: number }>();
  for (const unit of course.units) {
    const texts = [...unit.sentences.flatMap((x) => Object.values(x.forms).map((f) => f.text)), ...(unit.stories ?? []).flatMap((st) => st.steps.flatMap((step) => ("line" in step && step.line !== undefined ? Object.values(step.line.forms) : [])))];
    for (const text of texts)
      for (const token of text.tokens) {
        const request = requestOfToken(token, undefined);
        if (request === undefined) continue;
        for (const [list, side] of [[request.before, "before"], [request.after, "after"]] as const)
          for (const a of list) {
            const n = written.get(a.lexeme) ?? { before: 0, after: 0 };
            written.set(a.lexeme, { ...n, [side]: n[side] + 1 });
          }
      }
  }
  const lexemes = rows.map((row): ExplorerLexeme => {
    const entry = entries.get(row.id.id);
    const pos = typeof entry?.["pos"] === "string" ? entry["pos"] : row.lexeme?.pos;
    // A lexical feature (a noun's gender: قهوة's Fem) is the lexeme's own, stored or given by a default, never its
    // cell's: only one it `chooses` (tío, tía) is set there. Its own value is shown with the lexeme, never offered.
    const chooses = stringsOf(entry?.["chooses"]);
    const own = new Set(pos === undefined ? [] : (lexicalFeatures[pos] ?? []).filter((f) => !chooses.includes(f)));
    // A language that merges lexemes (ADR 0158) has no switches: a word's values are what its lexemes bring.
    const names = merging ? [] : [...(pos === undefined ? [] : (dimensions[pos] ?? [])), ...chooses].filter((f) => !own.has(f));
    const features = [...new Set(names)].map((feature) => ({ feature, values: stringsOf(values[feature]) }));
    const stated = isObject(entry?.["citation"]) ? entry["citation"] : pos === undefined ? undefined : citations[pos];
    const citation = Object.fromEntries(
      Object.entries(isObject(stated) ? stated : {}).filter(([k, v]) => typeof v === "string" && !own.has(k) && features.some((f) => f.feature === k)),
    ) as UdFeatures;
    const on = entry?.["on"];
    const stated2 = isObject(on) && (on["at"] === "before" || on["at"] === "after") ? on["at"] : undefined;
    // One that states no side stands where the course writes it more often (apc el-: before a noun, after a
    // preposition in 3al).
    const sides = written.get(row.id.id);
    const at = stated2 ?? (sides === undefined ? undefined : sides.before >= sides.after ? "before" : "after");
    // In a language that merges lexemes the citation is a merge (ADR 0158 §5a): its cell, whose lexemes open it.
    const merge = merging && isObject(stated) ? (Object.fromEntries(Object.entries(stated).filter(([, v]) => typeof v === "string")) as UdFeatures) : undefined;
    return { row, pos, features, citation, ...(at !== undefined && { at }), ...(merge !== undefined && Object.keys(merge).length > 0 && { citationCell: merge }) };
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

  const explorer: RulesExplorer = { course, lexemes, orthographies, problems, compiled, spellers, tags: courseTags(course), merging };
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
    case "attach":
      return [
        { key: "lexeme", value: error.lexeme },
        ...(error.pos === undefined ? [] : [{ key: "pos", value: error.pos.join(" | ") }]),
        ...(error.has === undefined ? [] : [{ key: "has", value: cellKey(error.has) }]),
        ...(error.at === undefined ? [] : [{ key: "at", value: error.at }]),
        ...(error.needs === undefined ? [] : [{ key: "needs", value: error.needs.join(" | ") }]),
        ...(error.lacks === undefined ? [] : [{ key: "lacks", value: error.lacks.join(" | ") }]),
        ...(error.complete === undefined ? [] : [{ key: "complete", value: "true" }]),
      ];
    case "twice":
      return [
        { key: "feature", value: error.feature },
        { key: "lexemes", value: error.lexemes.join(" | ") },
      ];
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
  const result = realiseToken(lang, writtenOf(expandMerged(explorer, request)), {
    blocking: request.blocking,
    pinned: request.pinned,
    spellings: request.spellings,
    ...(request.next === undefined ? {} : { next: request.next }),
    ...(strict ? { strict: true } : {}),
  });
  if (!result.ok) return { ok: false, error: { kind: result.error.kind, details: detailsOf(result.error) } };
  const { form, status, steps, listed, alternatives, feats, missing } = result.value;
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
    ...(feats === undefined ? {} : { feats }),
    ...(missing === undefined ? {} : { missing }),
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
      const asked = requestOfToken(token, next);
      if (asked === undefined || asked.base !== base) continue;
      const request = expandMerged(explorer, asked);
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
  return tokenCells(explorer, lexeme, pos);
};

/** Every cell the course's tokens give a category, cut to the features a cell of the lexeme may set. */
const tokenCells = (explorer: RulesExplorer, lexeme: ExplorerLexeme, pos: string): readonly UdFeatures[] => {
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

const attaching = new WeakMap<RulesExplorer, Readonly<Record<"before" | "after", readonly ExplorerLexeme[]>>>();

/**
 * The lexemes that may be written with a base on one side: bound ones (an affix, a suffixed pronoun:
 * written only inside words), and any the course's tokens write beside a base on that side (a clitic:
 * the article, b-, w-). A free word no token writes inside another (apc إنت) is never offered. In a
 * language that merges lexemes, those whose entry says they stand on that side (`on.at`).
 */
export const attachable = (explorer: RulesExplorer, side: "before" | "after"): readonly ExplorerLexeme[] => {
  // A language that merges lexemes says where each stands (`on.at`): those, on that side.
  if (explorer.merging) return explorer.lexemes.filter((l) => l.at === side);
  let found = attaching.get(explorer);
  if (found === undefined) {
    const seen = { before: new Set<string>(), after: new Set<string>() };
    const visit = (text: TaggedText): void => {
      for (const token of text.tokens) {
        const request = requestOfToken(token, undefined);
        if (request === undefined) continue;
        for (const a of request.before) seen.before.add(a.lexeme);
        for (const a of request.after) seen.after.add(a.lexeme);
      }
    };
    for (const unit of explorer.course.units) {
      for (const s of unit.sentences) for (const form of Object.values(s.forms)) visit(form.text);
      for (const story of unit.stories ?? []) for (const step of story.steps) if ("line" in step && step.line !== undefined) for (const text of Object.values(step.line.forms)) visit(text);
    }
    const of = (on: Set<string>): readonly ExplorerLexeme[] => explorer.lexemes.filter((l) => l.row.facets.kind.includes("bound") || on.has(l.row.id.id));
    found = { before: of(seen.before), after: of(seen.after) };
    attaching.set(explorer, found);
  }
  return found[side];
};

/**
 * A request with the values chosen on its base written as the lexemes that bring them, in a language that merges
 * lexemes (ADR 0158: `mergeFor`): they stand next to the base, the token's other lexemes (clitics) outside them. A
 * compiled token still carries its base's values; so do a paradigm's cells and an older address. Unchanged where no
 * merge gives the values (a pronoun that chooses them), or the language does not merge.
 */
export const expandMerged = <R extends Pick<ExploreRequest, "base" | "feats" | "before" | "after">>(explorer: RulesExplorer, request: R): R => {
  if (!explorer.merging || explorer.compiled === undefined || Object.keys(request.feats).length === 0) return request;
  const found = mergeFor(explorer.compiled, request.base, request.feats);
  if (found === undefined) return request;
  const expanded = {
    ...request,
    feats: {},
    before: [...request.before, ...found.before.map((lexeme) => ({ lexeme }))],
    after: [...found.after.map((lexeme) => ({ lexeme })), ...request.after],
  };
  // Each where it merges, among the lexemes the token writes (chg's nominative after the possessive, before -dur).
  return { ...expanded, ...arrange(explorer, expanded) };
};

/** Where a base opens when it is picked: its citation, as values or, in a language that merges lexemes, as the lexemes of its merge. */
export const opening = (explorer: RulesExplorer, lexeme: ExplorerLexeme): Pick<ExploreRequest, "feats" | "before" | "after"> => {
  if (!explorer.merging || lexeme.citationCell === undefined) return { feats: lexeme.citation, before: [], after: [] };
  const { feats, before, after } = expandMerged(explorer, { base: lexeme.row.id.id, feats: lexeme.citationCell, before: [], after: [] });
  return { feats, before, after };
};

/**
 * What the add box offers for a request (ADR 0158): in a language that merges lexemes, only those that can merge onto
 * the word as it stands (their `on` holds, they bring nothing it has, it does not write them yet: `mergeable`), each
 * written on its own side; elsewhere those `attachable` on the side asked.
 */
export const addable = (
  explorer: RulesExplorer,
  request: Pick<ExploreRequest, "base" | "feats" | "before" | "after">,
  side: "before" | "after" = "after",
): readonly ExplorerLexeme[] => {
  if (!explorer.merging || explorer.compiled === undefined) return attachable(explorer, side);
  const candidates = explorer.lexemes.filter((l) => l.at !== undefined);
  const can = new Set(
    mergeable(
      explorer.compiled,
      request.base,
      request.feats,
      [...request.before, ...request.after].map((a) => a.lexeme),
      candidates.map((l) => l.row.id.id),
    ),
  );
  return candidates.filter((l) => can.has(l.row.id.id));
};

/**
 * Where a request's lexemes are written, with `adding` among them (ADR 0158): in a language that merges lexemes,
 * the order they merge in, each on its side, outward from the base (`mergeOrder`), ties as already written; elsewhere
 * as they stand, `adding` last on the side asked.
 */
export const arrange = (
  explorer: RulesExplorer,
  request: Pick<ExploreRequest, "base" | "feats" | "before" | "after">,
  adding?: string,
  side: "before" | "after" = "after",
): Pick<ExploreRequest, "before" | "after"> => {
  const added: readonly Attached[] = adding === undefined ? [] : [{ lexeme: adding }];
  if (!explorer.merging || explorer.compiled === undefined)
    return side === "before" ? { before: [...request.before, ...added], after: request.after } : { before: request.before, after: [...request.after, ...added] };
  // One that states no side (`on`) is no merge: it stays on its side, outside those that merge (apc el-).
  const lang = explorer.compiled;
  const merges = (a: Attached): boolean => lang.lexemes.get(a.lexeme)?.on !== undefined;
  const sideOf = (a: Attached, fallback: "before" | "after"): "before" | "after" => explorer.lexemes.find((l) => l.row.id.id === a.lexeme)?.at ?? fallback;
  const outside = {
    before: [...request.before.filter((a) => !merges(a)), ...added.filter((a) => !merges(a) && sideOf(a, side) === "before")],
    after: [...request.after.filter((a) => !merges(a)), ...added.filter((a) => !merges(a) && sideOf(a, side) === "after")],
  };
  const all = [...request.before, ...request.after, ...added].filter(merges);
  const order = mergeOrder(explorer.compiled, request.base, request.feats, all.map((a) => a.lexeme));
  const taken = new Set<number>();
  const back = (id: string): Attached => {
    const k = all.findIndex((a, i) => a.lexeme === id && !taken.has(i));
    taken.add(k);
    return all[k] as Attached;
  };
  return { before: [...outside.before, ...order.before.map(back)], after: [...order.after.map(back), ...outside.after] };
};

const combos = new WeakMap<RulesExplorer, Map<string, readonly UdFeatures[]>>();

/** The cells a lexeme's values may combine into: the bundle's, its category's tokens', and its citation cell. */
const combosOf = (explorer: RulesExplorer, lexeme: ExplorerLexeme): readonly UdFeatures[] => {
  const pos = lexeme.pos;
  if (pos === undefined) return [];
  let byPos = combos.get(explorer);
  if (byPos === undefined) {
    byPos = new Map();
    combos.set(explorer, byPos);
  }
  const key = `${pos}\u0000${lexeme.features.map((f) => f.feature).join(",")}`;
  const known = byPos.get(key);
  if (known !== undefined) return known;
  const all = [...(explorer.course.lexicon.cells?.[pos] ?? []).map(cellFeats), ...tokenCells(explorer, lexeme, pos), lexeme.citation].filter((c) => Object.keys(c).length > 0);
  byPos.set(key, all);
  return all;
};

/**
 * A cell after one of its features was set: the value chosen kept, and each other value kept, in the
 * order of the lexeme's features, only while some cell the explorer knows of its category (the
 * bundle's, the tokens', the citation) has all the values kept so far; the rest left unset. es
 * VerbForm=Fin drops Gender=Masc (only a participle has a gender). A feature no known cell sets (a
 * value of the lexeme's own) is never dropped, and a lexeme with no known cells keeps every value.
 */
export const fitCell = (explorer: RulesExplorer, lexeme: ExplorerLexeme, feats: UdFeatures, changed: string): UdFeatures => {
  const known = combosOf(explorer, lexeme);
  const value = feats[changed];
  if (known.length === 0 || value === undefined) return feats;
  const constrained = new Set(known.flatMap((c) => Object.keys(c)));
  if (!constrained.has(changed)) return feats;
  const fits = (kept: UdFeatures): boolean => known.some((c) => Object.entries(kept).every(([k, v]) => c[k] === v));
  // A value no known cell has (a cell the course never writes) is the explorer's to try: nothing is dropped.
  if (!fits({ [changed]: value })) return feats;
  let kept: UdFeatures = { [changed]: value };
  const order = [...lexeme.features.map((f) => f.feature), ...Object.keys(feats)];
  for (const feature of new Set(order)) {
    const v = feats[feature];
    if (feature === changed || v === undefined) continue;
    if (!constrained.has(feature) || fits({ ...kept, [feature]: v })) kept = { ...kept, [feature]: v };
  }
  return Object.fromEntries(Object.keys(feats).filter((k) => kept[k] !== undefined).map((k) => [k, kept[k] as string]));
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
