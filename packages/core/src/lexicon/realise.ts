/**
 * Realisation (ADR 0145; docs/rules-design.md, sections 2 and 4): a lexeme in a cell made into its
 * lexical form, boundaries kept, in this order: blocking (the most specific listed or pinned form
 * of the lexeme for the cell), the stem (a base through its language's stem templates by root
 * class), the affix blocks of the first realisation rule that holds, the allomorphs of the token's
 * other lexemes, then the language's ordered rewrite rules over the whole form. Every rule taken is
 * recorded with its branch (ADR 0146: a rule's branches are its parts). Spelling the form is the
 * profile's (`spell`), not this module's.
 *
 * Pure: the declared language and its lexicon are passed in. No list of a language's letters,
 * endings or marks is here: sets, exponents and templates are data.
 */
import type { Allomorph, Exponent, LanguageDeclaration, Lexeme, LexemeForm, Lexicon, PartId, RadicalForm, RealisationRule, RuleId, Stem, StemChoice, UdFeatures } from "@nabu/schema";
import { err, ok, type Result } from "../result.ts";
import { caseFold } from "../text/case.ts";
import { graphemes } from "../text/graphemes.ts";
import {
  applyRewrite,
  BOUNDARY,
  checkRewrite,
  compileNotation,
  compilePattern,
  endsIn,
  isCarrier,
  namedSet,
  startsIn,
  textOf,
  unitsOf,
  withVowel,
  type CompiledNotation,
  type CompiledRewrite,
  type Pattern,
  type Unit,
} from "./realise-pattern.ts";
import { accentuate, compileProsody, type AccentMode, type CompiledProsody } from "./accent.ts";

type Condition = RealisationRule["when"];

/** One rule taken: its id and the branch of it (ADR 0146), where it names one. */
export interface Step {
  readonly rule: RuleId;
  readonly branch?: string;
}

/** A lexeme realised in a cell. */
export interface Realisation {
  /** The lexical form, boundaries (`+`) kept. */
  readonly form: string;
  /** ADR 0145's three statuses: given by the rules, or a pinned or listed form or stem of the lexeme. */
  readonly status: "given" | "pinned" | "listed";
  readonly steps: readonly Step[];
  /** The listed part it used (lexeme:tener|stem:tuv), where blocking took a listed form or stem. */
  readonly listed?: PartId;
  /**
   * A token's free variants, where it has any: the forms its lexemes' free allomorphs give in place
   * of the ones chosen (a scribe's other spelling of a suffix), each with the rules it took.
   */
  readonly alternatives?: readonly { readonly form: string; readonly steps: readonly Step[] }[];
  /**
   * Where blocking took one of several forms of the cell marked free (ADR 0145: both accepted, the
   * first shown): the lexical forms of the others, in their order. `RealiseOptions.variant` takes
   * one of them in the first's place.
   */
  readonly free?: readonly string[];
  /**
   * In a language that merges lexemes (ADR 0158: its `requires`), the features a token still lacks:
   * those its base's category and its lexemes require that no lexeme of it brings. A token with any
   * is incomplete: its form is shown (the rules explorer) but it is no word to write.
   */
  readonly missing?: readonly string[];
  /** In a language that merges lexemes, the values the token's lexemes bring, its base's own and chosen ones with them. */
  readonly feats?: UdFeatures;
}

export type RealiseError =
  | { readonly kind: "unknown-lexeme"; readonly lexeme: string }
  /** No realisation rule holds of the cell, and it is not the lexeme's citation cell. */
  | { readonly kind: "no-rule"; readonly cell: UdFeatures }
  /** Two forms of the lexeme are as specific for the cell, and not both free. */
  | { readonly kind: "tie"; readonly forms: readonly string[] }
  /** The base has no template for the stem (by its Form and root class), or the template names a vowel it lacks. */
  | { readonly kind: "template"; readonly stem: string; readonly root: string }
  /** The lexeme has no lexical form the engine can realise (none, or a kind it does not build yet). */
  | { readonly kind: "form"; readonly lexeme: string }
  /** Blocking found a form of the lexeme that pins spellings only, with no lexical form. */
  | { readonly kind: "spelled-only"; readonly feats: UdFeatures }
  /** `RealiseOptions.variant` asked for a free variant the cell does not have. */
  | { readonly kind: "variant"; readonly variants: number }
  /** A lexeme merged where its `on` does not hold (ADR 0158): the base is not of its part of speech, or the word lacks a value it merges onto. */
  | { readonly kind: "attach"; readonly lexeme: string; readonly pos?: readonly string[]; readonly has?: UdFeatures }
  /** Two lexemes of a token bring the same feature (ADR 0158: no value is brought twice). */
  | { readonly kind: "twice"; readonly feature: string; readonly lexemes: readonly string[] };

export interface RealiseOptions {
  /** false: ignore listed forms and stated classes, keep pinned ones (ADR 0145: the regularised form). */
  readonly blocking?: boolean;
  /**
   * false: pass over forms that pin spellings only (no `form`, no `stem`), as if they were not
   * stored: what the rules and the lexical forms give. The compiler's check of the course's tokens
   * asks this (docs/rules-design.md, stage 2): a spelling pinned before the rules were written is a
   * copy of what the course writes, not an account of it.
   */
  readonly spellings?: boolean;
  /** false: pass over pinned forms altogether (with a form or a stem too): what the rules alone give. */
  readonly pinned?: boolean;
  /**
   * Where the base's form is a phrase written over several tokens (ahla w sahla): the word of it,
   * counted from 0, that this token writes, with the token's other lexemes joined to it. Where no
   * whole form of the lexeme blocks, the rules realise that word alone, as if it were the
   * lexeme's form (a Slovak reflexive verb, volať sa: its token writes the verb, and sa is a
   * token of its own).
   */
  readonly word?: number;
  /** The base lexeme of the word after the token, where a lexeme's allomorph is chosen by it (`before: {pos}`). */
  readonly next?: string;
  /**
   * The contexts the token stands in, which are no feature values (hbo: pause, nesiga, bound by a
   * maqaf): a rewrite whose `when` names a `context` holds only of a token in it.
   */
  readonly context?: readonly string[];
  /**
   * Where blocking takes one of several free forms of the cell, which of them: 0 (the default) the
   * first, k the k-th of `Realisation.free`. A token is realised around it as around the first (its
   * other lexemes joined, the rewrite rules run): hbo וַיהֹוָה beside וַיהוָה, a pausal stem before
   * a suffix beside its contextual one.
   */
  readonly variant?: number;
  /**
   * true: as a paradigm's cells are listed (docs/rules-design.md, stage 4), a rule says something of
   * the cell or nothing is given. A rule with blocks of which no exponent names the cell (a noun's
   * plural, where the rule has only a feminine) is `no-rule`, not the bare stem; a phrase (a lexical
   * form with a space: its words are not one word's cells) is `form` in every cell. A rule with no blocks (an adjective that does
   * not agree) still gives its stem. The course's own tokens are never realised so: what a token
   * writes is checked as it is.
   */
  readonly strict?: boolean;
}

/** One lexeme a token writes, with the feature values chosen there. */
export interface WrittenLexeme {
  readonly lexeme: string;
  readonly feats?: UdFeatures;
  /** The lexeme the token is about, where it writes several. */
  readonly base?: boolean;
}

/** A cell of a paradigm, realised or not. */
export interface Realised {
  readonly cell: UdFeatures;
  readonly result: Result<Realisation, RealiseError>;
}

interface CompiledRule {
  readonly source: RealisationRule;
  readonly blocks: readonly { readonly side: "prefix" | "suffix"; readonly exponents: readonly Exponent[] }[];
}

/** A language ready to realise: its declaration and lexicon, the notation, patterns and sets compiled. */
export interface CompiledLanguage {
  readonly declared: LanguageDeclaration;
  readonly notation: CompiledNotation;
  readonly lexemes: ReadonlyMap<string, Lexeme>;
  readonly rootClasses: readonly { readonly id: string; readonly test: (radicals: readonly string[]) => boolean }[];
  readonly stems: readonly { readonly source: Stem; readonly fits: (radicals: readonly string[], vowels: Readonly<Record<string, string>>) => boolean; readonly conditions: number }[];
  readonly rules: readonly CompiledRule[];
  /** Each lexeme's own values (`Condition.own`): what its entry stores, else what a default gives. */
  readonly own: ReadonlyMap<string, UdFeatures>;
  /** The rewrite rules, in order, each with the condition on the token's base it holds of (`when`); an accent rule has `accent` in place of `rewrite`. */
  readonly phonology: readonly { readonly rewrite?: CompiledRewrite; readonly accent?: { readonly id: RuleId; readonly branch: string | undefined; readonly mode: AccentMode }; readonly when: Condition | undefined }[];
  /** The notation's prosody, where it declares one (accent rules read it). */
  readonly prosody?: CompiledProsody;
  /** Patterns of conditions (`endsIn`), compiled once. */
  readonly patterns: ReadonlyMap<string, Pattern>;
}

const lexemeId = (id: string): string => (id.startsWith("lexeme:") ? id : `lexeme:${id}`);

const featsKey = (feats: UdFeatures | undefined): string =>
  Object.keys(feats ?? {})
    .sort()
    .map((k) => `${k}=${(feats ?? {})[k] ?? ""}`)
    .join(";");

/** Whether a cell has every value of `feats` (a comma: one of them; a cell's own comma: all of its values must be allowed). */
const hasValues = (cell: UdFeatures, feats: UdFeatures | undefined): boolean =>
  Object.entries(feats ?? {}).every(([k, v]) => {
    const value = cell[k];
    if (value === undefined) return false;
    const allowed = new Set(v.split(","));
    return value.split(",").every((x) => allowed.has(x));
  });

const sizeOf = (feats: UdFeatures | undefined): number => Object.keys(feats ?? {}).length;

const isRadical = (form: Lexeme["form"]): form is RadicalForm => typeof form === "object" && "radicals" in form;

const MARK_CP = /^\p{M}$/u;

/** A spelling's letters, each with the marks on it, decomposed and case folded; and the marks it begins with. */
const lettersOf = (text: string, locale: string): { readonly leading: ReadonlySet<string>; readonly letters: readonly { readonly letter: string; readonly marks: ReadonlySet<string> }[] } => {
  const leading = new Set<string>();
  const letters: { letter: string; marks: Set<string> }[] = [];
  for (const cluster of graphemes(caseFold(text, locale).normalize("NFD"))) {
    // Within one cluster, by code point: only to tell its letter from its marks.
    for (const c of cluster) {
      if (MARK_CP.test(c)) (letters.at(-1)?.marks ?? leading).add(c);
      else letters.push({ letter: c, marks: new Set() });
    }
  }
  return { leading, letters };
};

/**
 * Whether a spelling ends so, as a default reads it (the pipeline's nabu.lexicon `ends`): an ending
 * written with marks needs them where it has them, whatever other marks the letters carry; one
 * written without is compared on the letters alone.
 */
const endsAs = (spelling: string, ending: string, locale: string): boolean => {
  const word = lettersOf(spelling, locale).letters;
  const { leading, letters: tail } = lettersOf(ending, locale);
  if (tail.length > word.length || (leading.size > 0 && tail.length >= word.length)) return false;
  const start = word.length - tail.length;
  const fits = tail.every((t, k) => {
    const w = word[start + k];
    return w !== undefined && w.letter === t.letter && [...t.marks].every((m) => w.marks.has(m));
  });
  const before = word[start - 1];
  return fits && (leading.size === 0 || (before !== undefined && [...leading].every((m) => before.marks.has(m))));
};

/** Letters with no marks, case folded: what a default's `starts` compares. */
const bare = (text: string, locale: string): string =>
  lettersOf(text, locale)
    .letters.map((l) => l.letter)
    .join("");

/**
 * A lexeme's own values (`Condition.own`; ADR 0148: a default is a rule), as the pipeline reads
 * them (nabu.lexicon `lexical`): what its entry stores, and for each feature its category has of
 * itself (`lexical`) that it neither stores nor chooses, what the most specific default gives (the
 * one whose `ends` is longest, the first on a tie), read off its first spelling.
 */
const ownOf = (declared: LanguageDeclaration, lexeme: Lexeme): UdFeatures => {
  const out: Record<string, string> = { ...(lexeme.feats ?? {}) };
  const pos = lexeme.pos;
  if (pos === undefined) return out;
  const shown = Object.values(lexeme.spelled ?? {}).find((s) => s.length > 0)?.[0] ?? "";
  const locale = declared.id;
  for (const feature of declared.lexical?.[pos] ?? []) {
    if (out[feature] !== undefined || (lexeme.chooses ?? []).includes(feature)) continue;
    let best: { readonly value: string; readonly length: number } | undefined;
    for (const d of declared.defaults ?? []) {
      const value = d.gives[feature];
      if (value === undefined) continue;
      if (d.when.pos !== undefined && d.when.pos !== pos) continue;
      if (d.when.ends !== undefined && !endsAs(shown, d.when.ends, locale)) continue;
      if (d.when.starts !== undefined && !bare(shown, locale).startsWith(bare(d.when.starts, locale))) continue;
      const length = Array.from(d.when.ends ?? "").length;
      if (best === undefined || length > best.length) best = { value, length };
    }
    if (best !== undefined) out[feature] = best.value;
  }
  return out;
};

/** Compiles a language for realising; the errors where its rules or its lexicon cannot be read. */
export const compileLanguage = (declared: LanguageDeclaration, lexicon: Lexicon): Result<CompiledLanguage, readonly string[]> => {
  const errors: string[] = [];
  const notationResult = compileNotation(declared.notation);
  if (!notationResult.ok) return err(notationResult.error);
  const notation = notationResult.value;
  let prosody: CompiledProsody | undefined;
  if (declared.notation?.prosody !== undefined) {
    const made = compileProsody(declared.notation.prosody);
    if (made.ok) prosody = made.value;
    else errors.push(...made.error);
  }
  const pattern = (where: string, text: string): Pattern | undefined => {
    const compiled = compilePattern(text, notation);
    if (!compiled.ok) {
      errors.push(`${where}: ${compiled.error}`);
      return undefined;
    }
    return compiled.value;
  };
  const letterSet = (where: string, text: string): ReadonlySet<string> => {
    if (text.startsWith("{")) {
      const set = notation.sets.get(text.slice(1, -1));
      if (set === undefined || set.kind !== "letters") {
        errors.push(`${where}: no set of letters ${text} in the notation`);
        return new Set();
      }
      return set.members;
    }
    try {
      const set = namedSet(text);
      if (set.kind === "letters") return set.members;
      errors.push(`${where}: ${text} is a set of marks, not letters`);
    } catch (e) {
      errors.push(`${where}: ${(e as Error).message}`);
    }
    return new Set();
  };

  const lexemes = new Map<string, Lexeme>();
  for (const lexeme of lexicon.lexemes) {
    lexemes.set(lexeme.id, lexeme);
    // A tie is an authoring error unless both forms are free (ADR 0145). Forms that pin spellings
    // only (no form, no stem) are two spellings of a cell, not two lexical forms: no tie.
    const seen = new Map<string, LexemeForm>();
    for (const form of lexeme.forms ?? []) {
      if (form.form === undefined && form.stem === undefined) continue;
      const key = featsKey(form.feats) + (form.before === undefined ? "" : ` before ${JSON.stringify(form.before)}`);
      const other = seen.get(key);
      if (other !== undefined && !(other.free === true && form.free === true)) errors.push(`lexicon.tie: ${lexeme.id} has two forms for ${key}, not both free`);
      seen.set(key, form);
    }
  }

  const rootClasses = (declared.rootClasses ?? []).map((rc, n) => {
    const where = `rootClasses[${n}] ${rc.id}`;
    if (rc.radical !== undefined && rc.in !== undefined) {
      const members = letterSet(where, rc.in);
      const k = rc.radical - 1;
      return { id: rc.id, test: (radicals: readonly string[]) => members.has(radicals[k] ?? "") };
    }
    if (rc.same !== undefined) {
      const [a, b] = rc.same.map((x) => x - 1) as [number, number];
      return { id: rc.id, test: (radicals: readonly string[]) => radicals[a] !== undefined && radicals[a] === radicals[b] };
    }
    return { id: rc.id, test: () => true };
  });

  const stems = (declared.stems ?? []).map((stem, n) => {
    const where = `stems[${n}] ${stem.id}`;
    const members = stem.radical !== undefined && stem.in !== undefined ? letterSet(where, stem.in) : undefined;
    const k = (stem.radical ?? 1) - 1;
    const vowels = Object.entries(stem.vowels ?? {});
    return {
      source: stem,
      // The word's values outweigh the base's own conditions: arb's assimilated passive (yūṣalu)
      // over its imperfect by the verb's vowel (yaṣilu).
      conditions: (members === undefined ? 0 : 1) + vowels.length + 10 * sizeOf(stem.feats),
      fits: (radicals: readonly string[], own: Readonly<Record<string, string>>) => (members === undefined || members.has(radicals[k] ?? "")) && vowels.every(([slot, v]) => own[slot] === v),
    };
  });
  const stemIds = new Set(stems.map((s) => s.source.id));

  const patterns = new Map<string, Pattern>();
  const conditionPatterns = (where: string, c: Condition | undefined): void => {
    for (const text of [c?.endsIn, c?.startsIn]) {
      if (text !== undefined && !patterns.has(text)) {
        const p = pattern(where, text);
        if (p !== undefined) patterns.set(text, p);
      }
    }
  };

  const checkStemChoice = (where: string, choice: StemChoice | undefined): void => {
    if (choice === undefined || typeof choice === "object" && !Array.isArray(choice)) return;
    for (const id of typeof choice === "string" ? [choice] : (choice as readonly string[])) if (!stemIds.has(id)) errors.push(`${where}: no stem ${id}`);
  };

  const rules: CompiledRule[] = (declared.realisation ?? []).map((rule) => {
    conditionPatterns(rule.id, rule.when);
    checkStemChoice(rule.id, rule.stem);
    const blocks = rule.blocks.map((block) => ("prefix" in block ? { side: "prefix" as const, exponents: block.prefix } : { side: "suffix" as const, exponents: block.suffix }));
    for (const block of blocks) {
      for (const e of block.exponents) {
        checkStemChoice(`${rule.id}|${e.branch}`, e.stem);
        // An exponent adds text or writes an affix lexeme of the lexicon, one of the two.
        if ((e.add === undefined) === (e.lexeme === undefined)) errors.push(`${rule.id}|${e.branch}: an exponent has \`add\` or \`lexeme\`, one of the two`);
        else if (e.lexeme !== undefined && !lexemes.has(lexemeId(e.lexeme))) errors.push(`${rule.id}|${e.branch}: no lexeme ${e.lexeme}`);
      }
    }
    return { source: rule, blocks };
  });
  const ruleIds = new Set<string>();
  for (const r of rules) {
    if (ruleIds.has(r.source.id)) errors.push(`realisation: ${r.source.id} is given twice`);
    ruleIds.add(r.source.id);
  }

  const phonology: { rewrite?: CompiledRewrite; accent?: { id: RuleId; branch: string | undefined; mode: AccentMode }; when: Condition | undefined }[] = [];
  (declared.phonology ?? []).forEach((rw, n) => {
    const where = `phonology[${n}] ${rw.id}${rw.branch === undefined ? "" : `|${rw.branch}`}`;
    if (rw.accent !== undefined) {
      // An accent rule: it reads the notation's prosody, and has no pattern of its own.
      if (rw.find !== undefined || rw.to !== undefined || rw.map !== undefined || rw.before !== undefined || rw.after !== undefined || rw.at !== undefined) errors.push(`${where}: an accent rule has no find, to, map, before, after or at`);
      if (declared.notation?.prosody === undefined) errors.push(`${where}: an accent rule needs the notation's prosody`);
      conditionPatterns(where, rw.when);
      phonology.push({ accent: { id: rw.id, branch: rw.branch, mode: rw.accent }, when: rw.when });
      return;
    }
    if (rw.find === undefined) {
      errors.push(`${where}: a rewrite has \`find\`, or is an accent rule`);
      return;
    }
    const find = pattern(where, rw.find);
    const to = rw.to === undefined ? undefined : pattern(where, rw.to);
    const contexts = (c: string | readonly string[] | undefined): Pattern[] => (c === undefined ? [] : typeof c === "string" ? [c] : c).map((p) => pattern(where, p)).filter((p): p is Pattern => p !== undefined);
    if (find === undefined || (rw.to !== undefined && to === undefined)) return;
    const compiled: CompiledRewrite = { id: rw.id, branch: rw.branch, find, to, map: rw.map, before: contexts(rw.before), after: contexts(rw.after), at: rw.at };
    errors.push(...checkRewrite(compiled).map((e) => `${where}: ${e}`));
    conditionPatterns(where, rw.when);
    phonology.push({ rewrite: compiled, when: rw.when });
  });

  for (const lexeme of lexicon.lexemes) {
    for (const a of lexeme.allomorphs ?? []) {
      conditionPatterns(`${lexeme.id} allomorph`, a.after);
      conditionPatterns(`${lexeme.id} allomorph`, a.before);
    }
    for (const f of lexeme.forms ?? []) conditionPatterns(`${lexeme.id} form`, f.before);
  }
  for (const d of declared.defaults ?? []) conditionPatterns(`default ${d.id}`, d.when);

  if (errors.length > 0) return err(errors);
  const own = new Map<string, UdFeatures>();
  for (const lexeme of lexicon.lexemes) own.set(lexeme.id, ownOf(declared, lexeme));
  return ok({ declared, notation, lexemes, rootClasses, stems, rules, own, phonology, patterns, ...(prosody !== undefined && { prosody }) });
};

// ------------------------------------------------------------------------------------------------

/**
 * Where `when` holds of a lexeme and a cell, and of the contexts its token stands in (`context`). A
 * lexeme's classes are ignored with blocking off. A lexical form that stores boundaries is read by
 * `ends`, `starts` and `endsIn` whole (sk by+ť ends in ť; a pattern may name the boundaries,
 * {C}n+ú+ť) or up to its first boundary (es levantar+se: a clitic its citation form carries, what
 * it ends in is its base's ending): either holds.
 */
const conditionHolds = (lang: CompiledLanguage, when: Condition | undefined, lexeme: Lexeme, cell: UdFeatures, blocking: boolean, context: readonly string[] = [], present?: ReadonlySet<string>): boolean => {
  if (when === undefined) return true;
  if (when.with !== undefined && (present === undefined || !when.with.every((id) => present.has(lexemeId(id))))) return false;
  if (when.context !== undefined && !context.includes(when.context)) return false;
  if (when.pos !== undefined && lexeme.pos !== when.pos) return false;
  if (when.feats !== undefined && !hasValues(cell, when.feats)) return false;
  if (when.own !== undefined && !hasValues(lang.own.get(lexeme.id) ?? lexeme.feats ?? {}, when.own)) return false;
  if (when.class !== undefined && !(blocking && (lexeme.classes ?? []).includes(when.class))) return false;
  const whole = typeof lexeme.form === "string" ? lexeme.form.normalize("NFC") : undefined;
  const readings = whole === undefined ? [] : whole.includes("+") ? [whole, whole.split("+")[0] as string] : [whole];
  if (when.ends !== undefined && !readings.some((f) => f.endsWith((when.ends as string).normalize("NFC")))) return false;
  if (when.starts !== undefined && !readings.some((f) => f.startsWith((when.starts as string).normalize("NFC")))) return false;
  if (when.endsIn !== undefined) {
    const p = lang.patterns.get(when.endsIn);
    if (p === undefined || !readings.some((f) => endsIn(p, unitsOf(f)))) return false;
  }
  return true;
};

/** The base's root class: the first that holds (never stored). */
const rootClassOf = (lang: CompiledLanguage, radicals: readonly string[]): string | undefined => lang.rootClasses.find((rc) => rc.test(radicals))?.id;

/** A template filled in: digits are radicals, {slot} a short vowel, {long slot} a long one. */
const fillTemplate = (lang: CompiledLanguage, template: string, base: RadicalForm): string | undefined => {
  let failed = false;
  const vowels = base.vowels ?? {};
  const filled = template.replace(/\{(long )?([a-z]+)\}|([1-9])/gu, (_m, long: string | undefined, slot: string | undefined, digit: string | undefined) => {
    if (digit !== undefined) {
      const radical = base.radicals[Number(digit) - 1];
      if (radical === undefined) failed = true;
      return radical ?? "";
    }
    const name = vowels[slot ?? ""];
    const sign = name === undefined ? undefined : (long === undefined ? lang.notation.vowels : lang.notation.long)[name];
    if (sign === undefined) failed = true;
    return sign ?? "";
  });
  return failed ? undefined : filled.normalize("NFC");
};

/** The stem of a base for a stem choice: the first of its ids the base has a template for. */
const stemOf = (lang: CompiledLanguage, choice: StemChoice, base: RadicalForm, cell: UdFeatures = {}): Result<{ readonly text: string; readonly branch?: string }, RealiseError> => {
  const root = rootClassOf(lang, base.radicals);
  const vowels = base.vowels ?? {};
  if (typeof choice === "object" && !Array.isArray(choice)) {
    const pattern = lang.lexemes.get((choice as { readonly pattern: string }).pattern);
    const form = pattern?.form;
    const template = typeof form === "object" && form !== null && "templates" in form ? (form.templates[root ?? ""] ?? form.templates["*"]) : undefined;
    const filled = template === undefined ? undefined : fillTemplate(lang, template, base);
    return filled === undefined ? err({ kind: "template", stem: (choice as { readonly pattern: string }).pattern, root: root ?? "" }) : ok({ text: filled });
  }
  const ids = typeof choice === "string" ? [choice] : (choice as readonly string[]);
  for (const id of ids) {
    let best: { readonly template: string; readonly score: number; readonly branch: string | undefined } | undefined;
    for (const s of lang.stems) {
      if (s.source.id !== id || s.source.form !== base.form) continue;
      if (s.source.class !== undefined && s.source.class !== root) continue;
      if (!s.fits(base.radicals, vowels)) continue;
      if (s.source.feats !== undefined && !hasValues(cell, s.source.feats)) continue;
      const score = (s.source.class === undefined ? 0 : 100) + s.conditions;
      if (best === undefined || score > best.score) best = { template: s.source.template, score, branch: s.source.branch };
    }
    if (best !== undefined) {
      const filled = fillTemplate(lang, best.template, base);
      if (filled === undefined) return err({ kind: "template", stem: id, root: root ?? "" });
      return ok(best.branch === undefined ? { text: filled } : { text: filled, branch: best.branch });
    }
  }
  return err({ kind: "template", stem: ids.join(","), root: root ?? "" });
};

/** Whether a bare letter is a long vowel's length letter: a letter long vowels end in, after a vowel. */
const isLength = (lang: CompiledLanguage, units: readonly Unit[], k: number): boolean => {
  const u = units[k];
  const before = units.slice(0, k).findLast((x) => x.kind === "letter");
  return u !== undefined && u.kind === "letter" && u.marks.length === 0 && lang.notation.lengthLetters.has(u.base) && before !== undefined && before.kind === "letter" && before.marks.some((m) => lang.notation.vowelSlot.has(m) && m !== lang.notation.none);
};

/**
 * Two pieces joined at a boundary. An affix that begins with a carrier puts the carrier's marks on
 * the letter it joins in place of its vowel (a stem that begins with one, on the prefix's last
 * letter). Where a suffix follows, a letter left bare before it gets the sign of no vowel (the
 * notation leaves only a word's last consonant bare), unless it is a length letter; a prefix's own
 * letters are left as they are, for the rewrite rules to give their vowel.
 */
const join = (lang: CompiledLanguage, left: readonly Unit[], right: readonly Unit[], side: "prefix" | "suffix"): readonly Unit[] => {
  if (left.length === 0) return right;
  if (right.length === 0) return left;
  const out = [...left];
  let rest = right;
  const last = out.length - 1;
  const end = out[last] as Unit;
  const first = rest[0];
  if (first !== undefined && first.kind === "letter" && isCarrier(first) && end.kind === "letter") {
    out[last] = { kind: "letter", base: end.base, marks: withVowel(lang.notation, end.marks, first.marks) };
    rest = rest.slice(1);
  } else if (side === "suffix" && end.kind === "letter" && end.marks.length === 0 && lang.notation.none !== undefined && !isLength(lang, out, last) && first?.kind === "letter") {
    out[last] = { kind: "letter", base: end.base, marks: [lang.notation.none] };
  }
  return rest.length === 0 ? out : [...out, BOUNDARY, ...rest];
};

interface Built {
  readonly units: readonly Unit[];
  readonly status: Realisation["status"];
  readonly steps: readonly Step[];
  readonly listed?: PartId;
  /** A whole form from blocking: no rule runs over it. */
  readonly whole: boolean;
  /** The lexeme realised (a phrase's word, `options.word`: the lexeme with that word as its form). */
  readonly lexeme: Lexeme;
  /** The other free forms as specific as the one blocking took, where it took one of several. */
  readonly free?: readonly string[];
  /** The rules realised one word of a phrase (`options.word`), not the whole. */
  readonly ofWord?: boolean;
  /** The features a whole form from blocking has that the token's other lexemes bring: those lexemes are in it, not joined to it. */
  readonly covers?: readonly string[];
}

/**
 * Everything but the rewrite rules: blocking, the stem, the affix blocks. `following`: what follows
 * the lexeme in its token, as its lexemes' own forms give it (a form's `before`); none for a lexeme
 * realised alone. `asWord`: a phrase's word, as its lexeme.
 */
/** What a token's other lexemes bring to its base, where the language merges lexemes (ADR 0158). */
interface Merged {
  /** The stem the last lexeme that selects one makes the base take. */
  readonly selects?: StemChoice;
  /** The values the other lexemes bring: an exponent of a rule that writes only those is theirs, not the rule's. */
  readonly brought: UdFeatures;
}

const build = (lang: CompiledLanguage, id: string, cell: UdFeatures, options: RealiseOptions, following?: readonly Unit[], asWord?: Lexeme, merged?: Merged): Result<Built, RealiseError> => {
  const blocking = options.blocking ?? true;
  const lexeme = asWord ?? lang.lexemes.get(lexemeId(id));
  if (lexeme === undefined) return err({ kind: "unknown-lexeme", lexeme: id });
  if (options.strict === true && typeof lexeme.form === "string" && lexeme.form.includes(" ")) return err({ kind: "form", lexeme: lexeme.id });

  // The values the base chooses itself: what the token's other lexemes bring is theirs, joined to it
  // (chg اندجان + ablative is the name and -din). A language that merges lexemes (ADR 0158) blocks on
  // the whole cell: a form stored for the merged word (a broken plural) stands for the lexemes it covers.
  const strictMerge = lang.declared.requires !== undefined;
  const chosenCell = merged === undefined ? cell : Object.fromEntries(Object.entries(cell).filter(([k]) => merged.brought[k] === undefined));
  const blockCell = strictMerge ? cell : chosenCell;

  // 1. Blocking: the most specific form of the lexeme whose values the cell has.
  const lexical = (f: LexemeForm): boolean => options.spellings !== false || f.form !== undefined || f.stem !== undefined;
  const kept = (f: LexemeForm): boolean => (blocking || f.status === "pinned") && (options.pinned !== false || f.status !== "pinned");
  // A form with `before` fits only where what follows in the token holds it, and is then more
  // specific than one of the same values without it.
  const follows = (f: LexemeForm): boolean => f.before === undefined || (following !== undefined && contextHolds(lang, f.before, following, undefined));
  const weight = (f: LexemeForm): number => 2 * sizeOf(f.feats) + (f.before === undefined ? 0 : 1);
  // A form that names no values is for a token that chooses none (an uninflected word's), never a cell.
  const fits = (f: LexemeForm): boolean => (f.feats === undefined ? Object.keys(blockCell).length === 0 : hasValues(blockCell, f.feats));
  const candidates = (lexeme.forms ?? []).filter((f) => kept(f) && lexical(f) && fits(f) && follows(f));
  const most = Math.max(-1, ...candidates.map(weight));
  const winners = candidates.filter((f) => weight(f) === most);
  if (winners.length > 1 && !winners.every((f) => f.free === true)) return err({ kind: "tie", forms: winners.map((f) => featsKey(f.feats)) });
  // The first free form is shown; the others with a lexical form are `free`, and `variant` takes one
  // of them in the first's place.
  const ordered = winners.length > 1 ? winners.filter((f, k) => k === 0 || f.form !== undefined) : winners;
  const variant = options.variant ?? 0;
  if (variant > 0 && variant >= ordered.length) return err({ kind: "variant", variants: ordered.length });
  const winner = ordered[variant];
  if (winner !== undefined) {
    const listed = winner.status === "listed" ? (winner.form !== undefined ? `${lexeme.id}|form:${featsKey(winner.feats)}` : `${lexeme.id}|stem:${(winner.stem ?? "").normalize("NFC")}`) : undefined;
    const free = ordered.flatMap((f, k) => (k === variant || f.form === undefined ? [] : [f.form.normalize("NFC")]));
    const covers = merged === undefined ? [] : Object.keys(winner.feats ?? {}).filter((k) => merged.brought[k] !== undefined);
    if (winner.form !== undefined) return ok({ units: unitsOf(winner.form), status: winner.status, steps: [], whole: true, lexeme, ...(listed !== undefined && { listed }), ...(free.length > 0 && { free }), ...(covers.length > 0 && { covers }) });
    if (winner.stem === undefined) return err({ kind: "spelled-only", feats: winner.feats ?? {} });
  }

  // A phrase's word (options.word), where no whole form blocked: the rules realise that word as
  // if it were the lexeme's form.
  if (asWord === undefined && options.word !== undefined && typeof lexeme.form === "string" && lexeme.form.includes(" ")) {
    const word = lexeme.form.split(" ")[options.word];
    if (word === undefined || word === "") return err({ kind: "form", lexeme: lexeme.id });
    const built = build(lang, id, cell, options, following, { ...lexeme, form: word }, merged);
    return built.ok ? ok({ ...built.value, ofWord: true }) : built;
  }

  // 2. The rule, its exponents (which may choose the stem), the stem. A lexeme whose form is a
  // string, in its citation cell (its own, else its category's), is that form: no rule runs;
  // unless its language declares the category's forms stems (`stemmed`: bar's red, kemm), whose
  // citation cell the rules realise as any other.
  const form = lexeme.form;
  const citation = lexeme.citation ?? (lexeme.pos === undefined ? undefined : lang.declared.citation?.[lexeme.pos]);
  const rule = lang.rules.find((r) => conditionHolds(lang, r.source.when, lexeme, cell, blocking));
  // A rule that takes off the ending the form is cited with (`strip`: grc's λόγος, -ος) realises the
  // citation cell too, as `stemmed` has a category's realised.
  const strips = winner?.stem === undefined && typeof form === "string" && rule?.source.strip !== undefined;
  // Whether the base stands in its citation cell is read off the values it chooses itself.
  const isCitation = !strips && Object.entries(chosenCell).every(([k, v]) => citation?.[k] === v);
  const stemmed = lexeme.pos !== undefined && (lang.declared.stemmed ?? []).includes(lexeme.pos);
  if (winner?.stem === undefined && typeof form === "string" && isCitation && lexeme.pos !== undefined && !stemmed) return ok({ units: unitsOf(form), status: "given", steps: [], whole: false, lexeme });
  if (rule === undefined && (merged !== undefined || lang.declared.requires !== undefined)) {
    // A language that merges lexemes (ADR 0158): with no rule, the base is its stem, a listed one, or the
    // template the lexemes that join it select; what they add is theirs, joined by the token.
    if (winner?.stem !== undefined) return ok({ units: unitsOf(winner.stem), status: winner.status, steps: [], whole: false, lexeme, ...(winner.status === "listed" && { listed: `${lexeme.id}|stem:${winner.stem.normalize("NFC")}` }) });
    if (typeof form === "string") return ok({ units: unitsOf(form), status: "given", steps: [], whole: false, lexeme });
    if (isRadical(form)) {
      // Nothing has chosen a stem yet: the root alone, its radicals in a row (a word still incomplete: `missing`).
      if (merged?.selects === undefined) return lang.declared.requires !== undefined ? ok({ units: unitsOf(form.radicals.join("")), status: "given", steps: [], whole: false, lexeme }) : err({ kind: "template", stem: "", root: rootClassOf(lang, form.radicals) ?? "" });
      const made = stemOf(lang, merged.selects, form, cell);
      if (!made.ok) return made;
      return ok({ units: unitsOf(made.value.text), status: "given", steps: [], whole: false, lexeme });
    }
    return err({ kind: "form", lexeme: lexeme.id });
  }
  if (rule === undefined) {
    // No rule: a stem in its citation cell; an affix's own form, always.
    if (winner?.stem !== undefined) return isCitation ? ok({ units: unitsOf(winner.stem), status: winner.status, steps: [], whole: false, lexeme }) : err({ kind: "no-rule", cell });
    if (lexeme.pos === undefined) {
      const own = typeof form === "string" ? form : (lexeme.allomorphs ?? []).find((a) => a.after === undefined && a.before === undefined && a.form !== undefined && a.free !== true)?.form;
      return own === undefined ? err({ kind: "form", lexeme: lexeme.id }) : ok({ units: unitsOf(own), status: "given", steps: [], whole: false, lexeme });
    }
    return err({ kind: typeof form === "string" || isRadical(form) ? "no-rule" : "form", ...(typeof form === "string" || isRadical(form) ? { cell } : { lexeme: lexeme.id }) } as RealiseError);
  }
  // An exponent whose values the token's other lexemes bring is theirs (uz's past is a lexeme of the token): not the rule's.
  const brings = (e: Exponent): boolean => merged !== undefined && sizeOf(e.feats) > 0 && hasValues(merged.brought, e.feats);
  const chosen = rule.blocks.map((block) => {
    const fitting = block.exponents.filter((e) => hasValues(cell, e.feats) && !brings(e));
    const top = Math.max(-1, ...fitting.map((e) => sizeOf(e.feats)));
    return { side: block.side, exponent: fitting.find((e) => sizeOf(e.feats) === top) };
  });
  if (options.strict === true && rule.blocks.length > 0 && chosen.every((b) => b.exponent === undefined)) return err({ kind: "no-rule", cell });
  const stemChoice = merged?.selects ?? chosen.reduce<StemChoice | undefined>((c, b) => b.exponent?.stem ?? c, rule.source.stem);

  let stem: string;
  let status: Realisation["status"] = "given";
  const steps: Step[] = [];
  if (winner?.stem !== undefined) {
    stem = winner.stem;
    status = winner.status;
  } else if (typeof form === "string") {
    stem = form;
    if (rule.source.strip !== undefined) {
      const cited = form.normalize("NFC");
      const ending = rule.source.strip.map((e) => e.normalize("NFC")).find((e) => cited.endsWith(e));
      if (ending === undefined) return err({ kind: "form", lexeme: lexeme.id });
      stem = cited.slice(0, cited.length - ending.length);
    }
  } else if (isRadical(form)) {
    if (stemChoice === undefined) return err({ kind: "template", stem: "", root: rootClassOf(lang, form.radicals) ?? "" });
    const made = stemOf(lang, stemChoice, form, cell);
    if (!made.ok) return made;
    stem = made.value.text;
    // A template that is a branch of its own (a hollow verb's short past stem) is a step of the rule.
    if (made.value.branch !== undefined) steps.push({ rule: rule.source.id, branch: made.value.branch });
  } else return err({ kind: "form", lexeme: lexeme.id });

  // 3. The affix blocks, in order: each prefix before what is made so far, each suffix after it.
  // An exponent that writes an affix lexeme takes the allomorph a token would: by what it follows
  // (a suffix) or stands before (a prefix), of what is made so far.
  let units = unitsOf(stem);
  for (const { side, exponent } of chosen) {
    if (exponent === undefined) continue;
    steps.push({ rule: rule.source.id, branch: exponent.branch });
    let text = exponent.add;
    if (exponent.lexeme !== undefined) {
      const affixLexeme = lang.lexemes.get(lexemeId(exponent.lexeme));
      text = affixLexeme === undefined ? undefined : side === "prefix" ? allomorphOf(lang, affixLexeme, [], units) : allomorphOf(lang, affixLexeme, units, []);
      if (text === undefined) return err({ kind: "form", lexeme: lexemeId(exponent.lexeme) });
    }
    const affix = unitsOf(text ?? "");
    units = side === "prefix" ? join(lang, affix, units, "prefix") : join(lang, units, affix, "suffix");
  }
  const listed = status === "listed" && winner?.stem !== undefined ? `${lexeme.id}|stem:${winner.stem.normalize("NFC")}` : undefined;
  return ok({ units, status, steps, whole: false, lexeme, ...(listed !== undefined && { listed }) });
};

/** The language's rewrite rules, in order, each once over the whole form: those whose `when` holds of the base lexeme in its cell. */
const rewrite = (lang: CompiledLanguage, units: readonly Unit[], base: Lexeme, cell: UdFeatures, blocking: boolean, context: readonly string[] = [], present?: ReadonlySet<string>): { readonly units: readonly Unit[]; readonly steps: readonly Step[] } => {
  let current = units;
  const steps: Step[] = [];
  for (const { rewrite: rw, accent, when } of lang.phonology) {
    if (when !== undefined && !conditionHolds(lang, when, base, cell, blocking, context, present)) continue;
    if (accent !== undefined) {
      if (lang.prosody === undefined) continue;
      const placed = accentuate(current, accent.mode, lang.prosody);
      if (placed.changed) steps.push(accent.branch === undefined ? { rule: accent.id } : { rule: accent.id, branch: accent.branch });
      current = placed.units;
      continue;
    }
    if (rw === undefined) continue;
    const applied = applyRewrite(rw, current, lang.notation);
    if (applied.matched) steps.push(rw.branch === undefined ? { rule: rw.id } : { rule: rw.id, branch: rw.branch });
    current = applied.units;
  }
  return { units: current, steps };
};

const realisation = (built: Built, units: readonly Unit[], steps: readonly Step[]): Realisation => ({
  form: textOf(units),
  status: built.status,
  steps,
  ...(built.listed !== undefined && { listed: built.listed }),
  ...(built.free !== undefined && { free: built.free }),
});

/** A lexeme realised in a cell (its token's chosen values): the lexical form, boundaries kept. */
export const realise = (lang: CompiledLanguage, lexeme: string, cell: UdFeatures, options: RealiseOptions = {}): Result<Realisation, RealiseError> => {
  const built = build(lang, lexeme, cell, options);
  if (!built.ok) return built;
  if (built.value.whole) return ok(realisation(built.value, built.value.units, built.value.steps));
  const rewritten = rewrite(lang, built.value.units, built.value.lexeme, cell, options.blocking ?? true, options.context);
  return ok(realisation(built.value, rewritten.units, [...built.value.steps, ...rewritten.steps]));
};

/** The token's base lexeme and its cell, as an allomorph's condition may read them. */
interface TokenBase {
  readonly lexeme?: Lexeme;
  readonly cell: UdFeatures;
  /** The lexemes the token writes (a condition's `with`). */
  readonly lexemes?: ReadonlySet<string>;
}

/**
 * Whether a condition on what stands beside an allomorph holds. Of the text beside it in its token
 * (`units`: what it follows, for `after`, or stands before, for `before`): `endsIn`, `startsIn`,
 * `ends`, `starts`. Of the word beside it (`word`: for `before`, the next word's base lexeme, where
 * nothing follows in the token): `pos`, `class`. Of the token's base (`base`): `feats`, its cell's
 * values (a suffix's series by its noun's number: hbo -ay, -êḵā); and, given its lexeme (for `after`,
 * of a lexeme that follows the base), `pos` and `class` (a preposition's suffixes). `context` never.
 */
const contextHolds = (lang: CompiledLanguage, c: Condition, units: readonly Unit[], word: Lexeme | undefined, base?: TokenBase): boolean => {
  const textual = c.endsIn !== undefined || c.startsIn !== undefined || c.ends !== undefined || c.starts !== undefined;
  if (textual && units.length === 0) return false;
  if (c.endsIn !== undefined) {
    const p = lang.patterns.get(c.endsIn);
    if (p === undefined || !endsIn(p, units)) return false;
  }
  if (c.startsIn !== undefined) {
    const p = lang.patterns.get(c.startsIn);
    if (p === undefined || !startsIn(p, units)) return false;
  }
  const text = textOf(units);
  if (c.ends !== undefined && !text.endsWith(c.ends.normalize("NFC"))) return false;
  if (c.starts !== undefined && !text.startsWith(c.starts.normalize("NFC"))) return false;
  const subject = base?.lexeme ?? (units.length > 0 ? undefined : word);
  if (c.pos !== undefined && (subject === undefined || subject.pos !== c.pos)) return false;
  if (c.class !== undefined && (subject === undefined || !(subject.classes ?? []).includes(c.class))) return false;
  if (c.feats !== undefined && (base === undefined || !hasValues(base.cell, c.feats))) return false;
  if (c.with !== undefined && (base?.lexemes === undefined || !c.with.every((id) => base.lexemes?.has(lexemeId(id)) === true))) return false;
  return c.context === undefined;
};

/**
 * Whether an allomorph's conditions hold where it would stand: `after` of what it follows
 * (`preceding`), `before` of what it stands before (`following`, or the next word, `next`, where
 * nothing follows in the token); both of the token's base (`base`: its cell, and its lexeme given
 * only where this lexeme follows it, for `after`).
 */
const allomorphHolds = (lang: CompiledLanguage, a: Allomorph, preceding: readonly Unit[], following: readonly Unit[], next?: Lexeme, base?: TokenBase): boolean =>
  (a.after === undefined || contextHolds(lang, a.after, preceding, undefined, base)) &&
  (a.before === undefined || contextHolds(lang, a.before, following, following.length === 0 ? next : undefined, base === undefined ? undefined : { cell: base.cell, ...(base.lexemes !== undefined && { lexemes: base.lexemes }) }));

/**
 * The allomorph of a lexeme written beside others: the first with a form whose conditions all hold
 * (`allomorphHolds`); else the one with no condition; else the lexeme's own form. A free allomorph
 * is never chosen (`freeOf` gives it).
 */
const allomorphOf = (lang: CompiledLanguage, lexeme: Lexeme, preceding: readonly Unit[], following: readonly Unit[], next?: Lexeme, base?: TokenBase): string | undefined => {
  const all = (lexeme.allomorphs ?? []).filter((a) => a.form !== undefined && a.free !== true);
  const holds = (a: Allomorph): boolean => (a.after !== undefined || a.before !== undefined) && allomorphHolds(lang, a, preceding, following, next, base);
  const found = all.find(holds) ?? all.find((a) => a.after === undefined && a.before === undefined);
  return found?.form ?? (typeof lexeme.form === "string" ? lexeme.form : undefined);
};

/** A lexeme's free allomorphs whose conditions hold where it stands (a writer's other forms of it there). */
const freeOf = (lang: CompiledLanguage, lexeme: Lexeme, preceding: readonly Unit[], following: readonly Unit[], next?: Lexeme, base?: TokenBase): readonly string[] =>
  (lexeme.allomorphs ?? []).flatMap((a) => (a.free === true && a.form !== undefined && allomorphHolds(lang, a, preceding, following, next, base) ? [a.form] : []));

/** Whether a lexeme has an allomorph with a form chosen by what follows it. */
const choosesByFollowing = (lexeme: Lexeme): boolean => (lexeme.allomorphs ?? []).some((a) => a.form !== undefined && a.free !== true && a.before !== undefined);

/** The most free variants one token is taken through: past it, the later places keep the chosen form. */
const VARIANTS = 256;

/** A form's words: its units split at each space. */
const wordsOf = (units: readonly Unit[]): readonly (readonly Unit[])[] => {
  const out: Unit[][] = [[]];
  for (const u of units) {
    if (u.kind === "letter" && u.base === " ") out.push([]);
    else (out.at(-1) as Unit[]).push(u);
  }
  return out;
};

/** Of the parts of a token of equals, the status of the whole: pinned where one is (rule debt), else listed where one is. */
const STATUS_RANK: Readonly<Record<Realisation["status"], number>> = { given: 0, listed: 1, pinned: 2 };

/**
 * A token of equals: several lexemes, none of them its base (the schema's "a token of two equals
 * has none": yue 十 + 八, eighteen). Each is realised as a word of its own, in its own cell
 * (`realise`: blocking, its rule, the rewrite rules), and they are joined in order at a boundary.
 * No allomorph is chosen and no rule runs over the join: none of them is what the others are merged
 * onto. A part that is a phrase (a form with a space) gives nothing (`form`).
 */
const equals = (lang: CompiledLanguage, written: readonly WrittenLexeme[], options: RealiseOptions): Result<Realisation, RealiseError> => {
  let units: readonly Unit[] = [];
  let status: Realisation["status"] = "given";
  let listed: PartId | undefined;
  const steps: Step[] = [];
  for (const w of written) {
    const part = realise(lang, w.lexeme, w.feats ?? {}, options);
    if (!part.ok) return part;
    const own = unitsOf(part.value.form);
    if (wordsOf(own).length > 1) return err({ kind: "form", lexeme: lexemeId(w.lexeme) });
    units = units.length === 0 ? own : [...units, BOUNDARY, ...own];
    steps.push(...part.value.steps);
    if (STATUS_RANK[part.value.status] > STATUS_RANK[status]) status = part.value.status;
    listed ??= part.value.listed;
  }
  return ok({ form: textOf(units), status, steps, ...(listed !== undefined && { listed }) });
};

/**
 * What a token's lexemes make of its base (ADR 0158): its cell, the values its base chooses there with
 * every value its other lexemes bring (`realises`); the stem the last of them that selects one makes
 * the base take; and, in a language that merges lexemes (its `requires`), the checks of the merge:
 * each lexeme's `on` holds of the base and of what the others bring, no feature is brought twice,
 * and what is still required (`missing`: its category's requirements and its lexemes', less what the
 * base has of itself and what the token brings).
 */
const mergeOf = (
  lang: CompiledLanguage,
  written: readonly WrittenLexeme[],
  baseAt: number,
): Result<{ readonly cell: UdFeatures; readonly merged?: Merged; readonly missing?: readonly string[] }, RealiseError> => {
  const base = written[baseAt] as WrittenLexeme;
  const baseLexeme = lang.lexemes.get(lexemeId(base.lexeme));
  const brought: Record<string, string> = {};
  const by: Record<string, string> = {};
  let selects: StemChoice | undefined;
  const strict = lang.declared.requires !== undefined;
  for (let k = 0; k < written.length; k++) {
    const lexeme = lang.lexemes.get(lexemeId((written[k] as WrittenLexeme).lexeme));
    if (lexeme === undefined) continue;
    if (lexeme.selects !== undefined) selects = lexeme.selects;
    if (k === baseAt || lexeme.realises === undefined) continue;
    for (const [feature, value] of Object.entries(lexeme.realises)) {
      if (strict && by[feature] !== undefined) return err({ kind: "twice", feature, lexemes: [by[feature], lexeme.id] });
      brought[feature] = value;
      by[feature] = lexeme.id;
    }
  }
  if (Object.keys(brought).length === 0 && selects === undefined && !strict) return ok({ cell: { ...(base.feats ?? {}) } });
  const merged: Merged = { brought, ...(selects !== undefined && { selects }) };
  if (!strict || baseLexeme === undefined) return ok({ cell: { ...(base.feats ?? {}), ...brought }, merged });
  // In a language that merges lexemes the word's values are its base's own too (a noun's gender, a name's
  // number), and a lexeme may bring none of them again (no feminine onto a feminine noun).
  const own = lang.own.get(baseLexeme.id) ?? baseLexeme.feats ?? {};
  for (const f of Object.keys(brought)) if (own[f] !== undefined) return err({ kind: "twice", feature: f, lexemes: [baseLexeme.id, by[f] as string] });
  const cell: UdFeatures = { ...own, ...(base.feats ?? {}), ...brought };
  for (let k = 0; k < written.length; k++) {
    if (k === baseAt) continue;
    const lexeme = lang.lexemes.get(lexemeId((written[k] as WrittenLexeme).lexeme));
    const on = lexeme?.on;
    if (lexeme === undefined || on === undefined) continue;
    if (on.pos !== undefined && (baseLexeme.pos === undefined || !on.pos.includes(baseLexeme.pos))) return err({ kind: "attach", lexeme: lexeme.id, pos: on.pos });
    // What the word has besides this lexeme's own values.
    const others: Record<string, string> = { ...own, ...(base.feats ?? {}) };
    for (const [f, v] of Object.entries(brought)) if (by[f] !== lexeme.id) others[f] = v;
    if (on.has !== undefined && !hasValues(others, on.has)) return err({ kind: "attach", lexeme: lexeme.id, has: on.has });
  }
  const required = new Set<string>(baseLexeme.pos === undefined ? [] : (lang.declared.requires?.[baseLexeme.pos] ?? []));
  for (const w of written) for (const f of lang.lexemes.get(lexemeId(w.lexeme))?.requires ?? []) required.add(f);
  const has = cell;
  const missing = [...required].filter((f) => has[f] === undefined);
  return ok({ cell, merged, ...(missing.length > 0 && { missing }) });
};

/**
 * A token realised: its base lexeme in its cell, the token's other lexemes in their allomorphs, each
 * joined at a boundary, then the rewrite rules over the whole. Allomorphs are chosen twice over, so
 * each sees the others' choices: the lexemes after the base by what they follow and what stands after
 * them; the base's own form (where no rule made it) by what follows it in the token, or by the next
 * word (`options.next`) where nothing does; the lexemes before it, nearest first, by what they stand
 * before and follow; each of them also of the token's base (its cell; its lexeme, for a lexeme after
 * it: hbo's suffixed pronouns by their noun's number, -nî after a verb). A form of the base with
 * `before` holds where what follows it in the token, each lexeme in its own form, holds that (a stem
 * before a suffixed pronoun). Free allomorphs are never chosen: each one whose conditions hold where the
 * chosen forms put it gives the token an alternative (`alternatives`), every combination of them,
 * the token's other allomorphs chosen again around it (a scribe's ay- for eyt- takes -di, not -ti).
 * A lexeme beside the base that the token gives values, and that has no allomorph to choose, is
 * realised in them as a word of its own (es buscarlos: lo in the plural). A token of several lexemes,
 * none of them marked its base, is a token of equals (`equals`).
 */
export const realiseToken = (lang: CompiledLanguage, written: readonly WrittenLexeme[], options: RealiseOptions = {}): Result<Realisation, RealiseError> => {
  const baseAt = written.length === 1 ? 0 : written.findIndex((w) => w.base === true);
  if (baseAt < 0) return written.length > 1 && options.word === undefined ? equals(lang, written, options) : err({ kind: "no-rule", cell: {} });
  const base = written[baseAt] as WrittenLexeme;
  // What follows the base in the token, each lexeme in its own form, for a form of the base with
  // `before` (a stem before a suffixed pronoun): asked only of a base that has one.
  let following: readonly Unit[] | undefined;
  if ((lang.lexemes.get(lexemeId(base.lexeme))?.forms ?? []).some((f) => f.before !== undefined)) {
    following = [];
    for (let k = baseAt + 1; k < written.length; k++) {
      const lx = lang.lexemes.get(lexemeId((written[k] as WrittenLexeme).lexeme));
      const f = lx === undefined ? undefined : allomorphOf(lang, lx, [], []);
      if (f === undefined) break;
      following = following.length === 0 ? unitsOf(f) : join(lang, following, unitsOf(f), "suffix");
    }
  }
  const merging = mergeOf(lang, written, baseAt);
  if (!merging.ok) return merging;
  const built = build(lang, base.lexeme, merging.value.cell, options, following, undefined, merging.value.merged);
  if (!built.ok) return built;
  let baseUnits = built.value.units;
  if (options.word !== undefined && built.value.ofWord !== true) {
    const words = wordsOf(baseUnits);
    const word = words[options.word];
    if (word === undefined) return err({ kind: "form", lexeme: base.lexeme });
    baseUnits = word;
  } else if (wordsOf(baseUnits).length > 1 && written.length > 1) return err({ kind: "form", lexeme: base.lexeme });
  const lexemes: Lexeme[] = [];
  for (const w of written) {
    const lexeme = lang.lexemes.get(lexemeId(w.lexeme));
    if (lexeme === undefined) return err({ kind: "unknown-lexeme", lexeme: w.lexeme });
    lexemes.push(lexeme);
  }
  const next = options.next === undefined ? undefined : lang.lexemes.get(lexemeId(options.next));
  // A word the token writes beside its base, given values there and with no allomorph to choose
  // (es buscarlos: lo in the plural), is realised in them as a word of its own, then joined.
  const partOptions: RealiseOptions = {
    ...(options.blocking !== undefined && { blocking: options.blocking }),
    ...(options.spellings !== undefined && { spellings: options.spellings }),
    ...(options.pinned !== undefined && { pinned: options.pinned }),
  };
  const own: (readonly Unit[] | undefined)[] = [];
  const ownSteps: Step[] = [];
  for (let k = 0; k < written.length; k++) {
    const lexeme = lexemes[k] as Lexeme;
    const feats = (written[k] as WrittenLexeme).feats ?? {};
    if (k === baseAt || sizeOf(feats) === 0 || lexeme.pos === undefined || (lexeme.allomorphs ?? []).some((a) => a.form !== undefined)) {
      own.push(undefined);
      continue;
    }
    const made = realise(lang, lexeme.id, feats, partOptions);
    if (!made.ok) return made;
    own.push(unitsOf(made.value.form));
    ownSteps.push(...made.value.steps);
  }
  // A lexeme whose values a whole form of the base covers is in that form (a broken plural): it writes nothing of its own.
  const covered = new Set(built.value.covers ?? []);
  const coveredAt = (k: number): boolean => {
    const realises = (lexemes[k] as Lexeme).realises;
    return k !== baseAt && covered.size > 0 && realises !== undefined && Object.keys(realises).every((f) => covered.has(f));
  };
  // Each lexeme's form, first with no context.
  const initial: (readonly Unit[])[] = [];
  for (let k = 0; k < written.length; k++) {
    if (k === baseAt) {
      initial.push(baseUnits);
      continue;
    }
    const realised = own[k];
    if (realised !== undefined) {
      initial.push(realised);
      continue;
    }
    if (coveredAt(k)) {
      initial.push([]);
      continue;
    }
    const f = allomorphOf(lang, lexemes[k] as Lexeme, [], []);
    if (f === undefined) return err({ kind: "form", lexeme: (lexemes[k] as Lexeme).id });
    initial.push(unitsOf(f));
  }
  const joinedIn = (pieces: readonly (readonly Unit[])[], from: number, to: number): readonly Unit[] => {
    let units: readonly Unit[] = [];
    for (let k = from; k < to; k++) units = units.length === 0 ? (pieces[k] as readonly Unit[]) : join(lang, units, pieces[k] as readonly Unit[], k <= baseAt ? "prefix" : "suffix");
    return units;
  };
  const baseLexeme = lexemes[baseAt] as Lexeme;
  const cell = merging.value.cell;
  const present: ReadonlySet<string> = new Set(lexemes.map((l) => l.id));
  const ownBase = !built.value.whole && built.value.steps.length === 0 && options.word === undefined && choosesByFollowing(baseLexeme);
  /** Every place's allomorph chosen by its conditions, twice over, but the places `fixed` keeps (a free variant's). */
  const choose = (start: readonly (readonly Unit[])[], fixed: ReadonlySet<number>): Result<readonly (readonly Unit[])[], RealiseError> => {
    const pieces = [...start];
    for (let pass = 0; pass < 2; pass++) {
      for (let k = baseAt + 1; k < written.length; k++) {
        if (fixed.has(k) || own[k] !== undefined || coveredAt(k)) continue;
        const f = allomorphOf(lang, lexemes[k] as Lexeme, joinedIn(pieces, 0, k), k + 1 < written.length ? (pieces[k + 1] as readonly Unit[]) : [], k + 1 < written.length ? undefined : next, { lexeme: baseLexeme, cell, lexemes: present });
        if (f === undefined) return err({ kind: "form", lexeme: (lexemes[k] as Lexeme).id });
        pieces[k] = unitsOf(f);
      }
      // The base's own form chosen by what follows (bad- before -na; 7da3shar before a noun).
      if (ownBase && !fixed.has(baseAt)) {
        const f = allomorphOf(lang, baseLexeme, [], baseAt + 1 < written.length ? (pieces[baseAt + 1] as readonly Unit[]) : [], baseAt + 1 < written.length ? undefined : next, { cell, lexemes: present });
        if (f !== undefined) pieces[baseAt] = unitsOf(f);
      }
      for (let k = baseAt - 1; k >= 0; k--) {
        if (fixed.has(k) || own[k] !== undefined || coveredAt(k)) continue;
        const f = allomorphOf(lang, lexemes[k] as Lexeme, joinedIn(pieces, 0, k), joinedIn(pieces, k + 1, written.length), undefined, { cell, lexemes: present });
        if (f === undefined) return err({ kind: "form", lexeme: (lexemes[k] as Lexeme).id });
        pieces[k] = unitsOf(f);
      }
    }
    return ok(pieces);
  };
  const settled = choose(initial, new Set());
  if (!settled.ok) return settled;
  const forms = settled.value;
  // Joined: the base and what follows it, then each lexeme before it, nearest first; then the rewrites.
  const assemble = (pieces: readonly (readonly Unit[])[]): readonly Unit[] => {
    let units = pieces[baseAt] as readonly Unit[];
    for (let k = baseAt + 1; k < written.length; k++) units = join(lang, units, pieces[k] as readonly Unit[], "suffix");
    for (let k = baseAt - 1; k >= 0; k--) units = join(lang, pieces[k] as readonly Unit[], units, "prefix");
    return units;
  };
  const finish = (units: readonly Unit[]): { readonly units: readonly Unit[]; readonly steps: readonly Step[] } => {
    if (built.value.whole && written.length === 1) return { units, steps: built.value.steps };
    const rewritten = rewrite(lang, units, built.value.lexeme, cell, options.blocking ?? true, options.context, present);
    return { units: rewritten.units, steps: [...built.value.steps, ...ownSteps, ...rewritten.steps] };
  };
  const chosen = finish(assemble(forms));
  const made: Realisation = {
    ...realisation(built.value, chosen.units, chosen.steps),
    ...(merging.value.missing !== undefined && { missing: merging.value.missing }),
    ...(lang.declared.requires !== undefined && { feats: cell }),
  };
  // Free variants: at each place, a free allomorph whose conditions hold where the chosen forms put it
  // (the base's only where its form is its own, no rule having made it).
  const ownForm = !built.value.whole && built.value.steps.length === 0 && options.word === undefined;
  const places = forms.map((f, k): readonly (readonly Unit[])[] => {
    if (k === baseAt && !ownForm) return [];
    const preceding = k === baseAt ? [] : joinedIn(forms, 0, k);
    const following = k < baseAt ? joinedIn(forms, k + 1, written.length) : k + 1 < written.length ? (forms[k + 1] as readonly Unit[]) : [];
    const nextWord = k >= baseAt && k + 1 >= written.length ? next : undefined;
    // The token's base, as `choose` gives it to each place.
    const of: TokenBase = k > baseAt ? { lexeme: baseLexeme, cell, lexemes: present } : { cell, lexemes: present };
    return freeOf(lang, lexemes[k] as Lexeme, preceding, following, nextWord, of)
      .map(unitsOf)
      .filter((u) => textOf(u) !== textOf(f));
  });
  if (places.every((p) => p.length === 0)) return ok(made);
  // Every choice at every place, the chosen forms first (undefined: the place is chosen by its
  // conditions around the free ones, as the language would); past VARIANTS the later places keep theirs.
  let picks: (readonly Unit[] | undefined)[][] = [forms.map(() => undefined)];
  places.forEach((extra, k) => {
    if (extra.length === 0) return;
    const grown: (readonly Unit[] | undefined)[][] = [];
    for (const pick of picks) {
      for (const choice of [undefined, ...extra]) if (grown.length < VARIANTS) grown.push(pick.map((u, i) => (i === k ? choice : u)));
    }
    picks = grown;
  });
  const seen = new Set([made.form]);
  const alternatives: { readonly form: string; readonly steps: readonly Step[] }[] = [];
  for (const pick of picks.slice(1)) {
    const fixed = new Set(pick.flatMap((u, k) => (u === undefined ? [] : [k])));
    const around = choose(
      forms.map((f, k) => pick[k] ?? f),
      fixed,
    );
    if (!around.ok) continue;
    const variant = finish(assemble(around.value));
    const form = textOf(variant.units);
    if (seen.has(form)) continue;
    seen.add(form);
    alternatives.push({ form, steps: variant.steps });
  }
  return ok(alternatives.length === 0 ? made : { ...made, alternatives });
};

/** A lexeme realised in each of `cells`. */
export const paradigm = (lang: CompiledLanguage, lexeme: string, cells: readonly UdFeatures[], options: RealiseOptions = {}): readonly Realised[] =>
  cells.map((cell) => ({ cell, result: realise(lang, lexeme, cell, options) }));
