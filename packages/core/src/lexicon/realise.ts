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
  | { readonly kind: "spelled-only"; readonly feats: UdFeatures };

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
   * counted from 0, that this token writes, with the token's other lexemes joined to it.
   */
  readonly word?: number;
  /** The base lexeme of the word after the token, where a lexeme's allomorph is chosen by it (`before: {pos}`). */
  readonly next?: string;
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
  /** The rewrite rules, in order, each with the condition on the token's base it holds of (`when`). */
  readonly phonology: readonly { readonly rewrite: CompiledRewrite; readonly when: Condition | undefined }[];
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

/** Compiles a language for realising; the errors where its rules or its lexicon cannot be read. */
export const compileLanguage = (declared: LanguageDeclaration, lexicon: Lexicon): Result<CompiledLanguage, readonly string[]> => {
  const errors: string[] = [];
  const notationResult = compileNotation(declared.notation);
  if (!notationResult.ok) return err(notationResult.error);
  const notation = notationResult.value;
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
      const key = featsKey(form.feats);
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
      conditions: (members === undefined ? 0 : 1) + vowels.length,
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
    for (const block of blocks) for (const e of block.exponents) checkStemChoice(`${rule.id}|${e.branch}`, e.stem);
    return { source: rule, blocks };
  });
  const ruleIds = new Set<string>();
  for (const r of rules) {
    if (ruleIds.has(r.source.id)) errors.push(`realisation: ${r.source.id} is given twice`);
    ruleIds.add(r.source.id);
  }

  const phonology: { rewrite: CompiledRewrite; when: Condition | undefined }[] = [];
  (declared.phonology ?? []).forEach((rw, n) => {
    const where = `phonology[${n}] ${rw.id}${rw.branch === undefined ? "" : `|${rw.branch}`}`;
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
  }
  for (const d of declared.defaults ?? []) conditionPatterns(`default ${d.id}`, d.when);

  if (errors.length > 0) return err(errors);
  return ok({ declared, notation, lexemes, rootClasses, stems, rules, phonology, patterns });
};

// ------------------------------------------------------------------------------------------------

/** Where `when` holds of a lexeme and a cell. A lexeme's classes are ignored with blocking off. */
const conditionHolds = (lang: CompiledLanguage, when: Condition | undefined, lexeme: Lexeme, cell: UdFeatures, blocking: boolean): boolean => {
  if (when === undefined) return true;
  if (when.pos !== undefined && lexeme.pos !== when.pos) return false;
  if (when.feats !== undefined && !hasValues(cell, when.feats)) return false;
  if (when.class !== undefined && !(blocking && (lexeme.classes ?? []).includes(when.class))) return false;
  const form = typeof lexeme.form === "string" ? lexeme.form.normalize("NFC") : undefined;
  if (when.ends !== undefined && !(form !== undefined && form.endsWith(when.ends.normalize("NFC")))) return false;
  if (when.starts !== undefined && !(form !== undefined && form.startsWith(when.starts.normalize("NFC")))) return false;
  if (when.endsIn !== undefined) {
    const p = lang.patterns.get(when.endsIn);
    if (p === undefined || form === undefined || !endsIn(p, unitsOf(form))) return false;
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
const stemOf = (lang: CompiledLanguage, choice: StemChoice, base: RadicalForm): Result<{ readonly text: string; readonly branch?: string }, RealiseError> => {
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
  /** The lexeme realised. */
  readonly lexeme: Lexeme;
}

/** Everything but the rewrite rules: blocking, the stem, the affix blocks. */
const build = (lang: CompiledLanguage, id: string, cell: UdFeatures, options: RealiseOptions): Result<Built, RealiseError> => {
  const blocking = options.blocking ?? true;
  const lexeme = lang.lexemes.get(lexemeId(id));
  if (lexeme === undefined) return err({ kind: "unknown-lexeme", lexeme: id });
  if (options.strict === true && typeof lexeme.form === "string" && lexeme.form.includes(" ")) return err({ kind: "form", lexeme: lexeme.id });

  // 1. Blocking: the most specific form of the lexeme whose values the cell has.
  const lexical = (f: LexemeForm): boolean => options.spellings !== false || f.form !== undefined || f.stem !== undefined;
  const kept = (f: LexemeForm): boolean => (blocking || f.status === "pinned") && (options.pinned !== false || f.status !== "pinned");
  const candidates = (lexeme.forms ?? []).filter((f) => kept(f) && lexical(f) && hasValues(cell, f.feats));
  const most = Math.max(-1, ...candidates.map((f) => sizeOf(f.feats)));
  const winners = candidates.filter((f) => sizeOf(f.feats) === most);
  if (winners.length > 1 && !winners.every((f) => f.free === true)) return err({ kind: "tie", forms: winners.map((f) => featsKey(f.feats)) });
  const winner = winners[0];
  if (winner !== undefined) {
    const listed = winner.status === "listed" ? (winner.form !== undefined ? `${lexeme.id}|form:${featsKey(winner.feats)}` : `${lexeme.id}|stem:${(winner.stem ?? "").normalize("NFC")}`) : undefined;
    if (winner.form !== undefined) return ok({ units: unitsOf(winner.form), status: winner.status, steps: [], whole: true, lexeme, ...(listed !== undefined && { listed }) });
    if (winner.stem === undefined) return err({ kind: "spelled-only", feats: winner.feats });
  }

  // 2. The rule, its exponents (which may choose the stem), the stem. A lexeme whose form is a
  // string, in its citation cell (its own, else its category's), is that form: no rule runs.
  const form = lexeme.form;
  const citation = lexeme.citation ?? (lexeme.pos === undefined ? undefined : lang.declared.citation?.[lexeme.pos]);
  const isCitation = Object.entries(cell).every(([k, v]) => citation?.[k] === v);
  if (winner?.stem === undefined && typeof form === "string" && isCitation && lexeme.pos !== undefined) return ok({ units: unitsOf(form), status: "given", steps: [], whole: false, lexeme });
  const rule = lang.rules.find((r) => conditionHolds(lang, r.source.when, lexeme, cell, blocking));
  if (rule === undefined) {
    // No rule: a stem in its citation cell; an affix's own form, always.
    if (winner?.stem !== undefined) return isCitation ? ok({ units: unitsOf(winner.stem), status: winner.status, steps: [], whole: false, lexeme }) : err({ kind: "no-rule", cell });
    if (lexeme.pos === undefined) {
      const own = typeof form === "string" ? form : (lexeme.allomorphs ?? []).find((a) => a.after === undefined && a.before === undefined && a.form !== undefined)?.form;
      return own === undefined ? err({ kind: "form", lexeme: lexeme.id }) : ok({ units: unitsOf(own), status: "given", steps: [], whole: false, lexeme });
    }
    return err({ kind: typeof form === "string" || isRadical(form) ? "no-rule" : "form", ...(typeof form === "string" || isRadical(form) ? { cell } : { lexeme: lexeme.id }) } as RealiseError);
  }
  const chosen = rule.blocks.map((block) => {
    const fitting = block.exponents.filter((e) => hasValues(cell, e.feats));
    const top = Math.max(-1, ...fitting.map((e) => sizeOf(e.feats)));
    return { side: block.side, exponent: fitting.find((e) => sizeOf(e.feats) === top) };
  });
  if (options.strict === true && rule.blocks.length > 0 && chosen.every((b) => b.exponent === undefined)) return err({ kind: "no-rule", cell });
  const stemChoice = chosen.reduce<StemChoice | undefined>((c, b) => b.exponent?.stem ?? c, rule.source.stem);

  let stem: string;
  let status: Realisation["status"] = "given";
  const steps: Step[] = [];
  if (winner?.stem !== undefined) {
    stem = winner.stem;
    status = winner.status;
  } else if (typeof form === "string") stem = form;
  else if (isRadical(form)) {
    if (stemChoice === undefined) return err({ kind: "template", stem: "", root: rootClassOf(lang, form.radicals) ?? "" });
    const made = stemOf(lang, stemChoice, form);
    if (!made.ok) return made;
    stem = made.value.text;
    // A template that is a branch of its own (a hollow verb's short past stem) is a step of the rule.
    if (made.value.branch !== undefined) steps.push({ rule: rule.source.id, branch: made.value.branch });
  } else return err({ kind: "form", lexeme: lexeme.id });

  // 3. The affix blocks, in order: each prefix before what is made so far, each suffix after it.
  let units = unitsOf(stem);
  for (const { side, exponent } of chosen) {
    if (exponent === undefined) continue;
    steps.push({ rule: rule.source.id, branch: exponent.branch });
    const affix = unitsOf(exponent.add);
    units = side === "prefix" ? join(lang, affix, units, "prefix") : join(lang, units, affix, "suffix");
  }
  const listed = status === "listed" && winner?.stem !== undefined ? `${lexeme.id}|stem:${winner.stem.normalize("NFC")}` : undefined;
  return ok({ units, status, steps, whole: false, lexeme, ...(listed !== undefined && { listed }) });
};

/** The language's rewrite rules, in order, each once over the whole form: those whose `when` holds of the base lexeme in its cell. */
const rewrite = (lang: CompiledLanguage, units: readonly Unit[], base: Lexeme, cell: UdFeatures, blocking: boolean): { readonly units: readonly Unit[]; readonly steps: readonly Step[] } => {
  let current = units;
  const steps: Step[] = [];
  for (const { rewrite: rw, when } of lang.phonology) {
    if (when !== undefined && !conditionHolds(lang, when, base, cell, blocking)) continue;
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
});

/** A lexeme realised in a cell (its token's chosen values): the lexical form, boundaries kept. */
export const realise = (lang: CompiledLanguage, lexeme: string, cell: UdFeatures, options: RealiseOptions = {}): Result<Realisation, RealiseError> => {
  const built = build(lang, lexeme, cell, options);
  if (!built.ok) return built;
  if (built.value.whole) return ok(realisation(built.value, built.value.units, built.value.steps));
  const rewritten = rewrite(lang, built.value.units, built.value.lexeme, cell, options.blocking ?? true);
  return ok(realisation(built.value, rewritten.units, [...built.value.steps, ...rewritten.steps]));
};

/**
 * Whether a condition on what stands beside an allomorph holds. Of the text beside it in its token
 * (`units`: what it follows, for `after`, or stands before, for `before`): `endsIn`, `startsIn`,
 * `ends`, `starts`. Of the word beside it (`word`: for `before`, the next word's base lexeme, where
 * nothing follows in the token): `pos`, `class`. `feats` is never a context's.
 */
const contextHolds = (lang: CompiledLanguage, c: Condition, units: readonly Unit[], word: Lexeme | undefined): boolean => {
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
  if (c.pos !== undefined && (word === undefined || units.length > 0 || word.pos !== c.pos)) return false;
  if (c.class !== undefined && (word === undefined || units.length > 0 || !(word.classes ?? []).includes(c.class))) return false;
  return c.feats === undefined;
};

/**
 * The allomorph of a lexeme written beside others: the first with a form whose conditions all hold,
 * `after` of what it follows (`preceding`), `before` of what it stands before (`following`, or the
 * next word, `next`, where nothing follows in the token); else the one with no condition; else the
 * lexeme's own form.
 */
const allomorphOf = (lang: CompiledLanguage, lexeme: Lexeme, preceding: readonly Unit[], following: readonly Unit[], next?: Lexeme): string | undefined => {
  const all = (lexeme.allomorphs ?? []).filter((a) => a.form !== undefined);
  const holds = (a: Allomorph): boolean =>
    (a.after !== undefined || a.before !== undefined) &&
    (a.after === undefined || contextHolds(lang, a.after, preceding, undefined)) &&
    (a.before === undefined || contextHolds(lang, a.before, following, following.length === 0 ? next : undefined));
  const found = all.find(holds) ?? all.find((a) => a.after === undefined && a.before === undefined);
  return found?.form ?? (typeof lexeme.form === "string" ? lexeme.form : undefined);
};

/** Whether a lexeme has an allomorph with a form chosen by what follows it. */
const choosesByFollowing = (lexeme: Lexeme): boolean => (lexeme.allomorphs ?? []).some((a) => a.form !== undefined && a.before !== undefined);

/** A form's words: its units split at each space. */
const wordsOf = (units: readonly Unit[]): readonly (readonly Unit[])[] => {
  const out: Unit[][] = [[]];
  for (const u of units) {
    if (u.kind === "letter" && u.base === " ") out.push([]);
    else (out.at(-1) as Unit[]).push(u);
  }
  return out;
};

/**
 * A token realised: its base lexeme in its cell, the token's other lexemes in their allomorphs, each
 * joined at a boundary, then the rewrite rules over the whole. Allomorphs are chosen twice over, so
 * each sees the others' choices: the lexemes after the base by what they follow and what stands after
 * them; the base's own form (where no rule made it) by what follows it in the token, or by the next
 * word (`options.next`) where nothing does; the lexemes before it, nearest first, by what they stand
 * before and follow.
 */
export const realiseToken = (lang: CompiledLanguage, written: readonly WrittenLexeme[], options: RealiseOptions = {}): Result<Realisation, RealiseError> => {
  const baseAt = written.length === 1 ? 0 : written.findIndex((w) => w.base === true);
  if (baseAt < 0) return err({ kind: "no-rule", cell: {} });
  const base = written[baseAt] as WrittenLexeme;
  const built = build(lang, base.lexeme, base.feats ?? {}, options);
  if (!built.ok) return built;
  let baseUnits = built.value.units;
  if (options.word !== undefined) {
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
  // Each lexeme's form, first with no context.
  const forms: (readonly Unit[])[] = [];
  for (let k = 0; k < written.length; k++) {
    if (k === baseAt) {
      forms.push(baseUnits);
      continue;
    }
    const f = allomorphOf(lang, lexemes[k] as Lexeme, [], []);
    if (f === undefined) return err({ kind: "form", lexeme: (lexemes[k] as Lexeme).id });
    forms.push(unitsOf(f));
  }
  const joined = (from: number, to: number): readonly Unit[] => {
    let units: readonly Unit[] = [];
    for (let k = from; k < to; k++) units = units.length === 0 ? (forms[k] as readonly Unit[]) : join(lang, units, forms[k] as readonly Unit[], k <= baseAt ? "prefix" : "suffix");
    return units;
  };
  const baseLexeme = lexemes[baseAt] as Lexeme;
  const ownBase = !built.value.whole && built.value.steps.length === 0 && options.word === undefined && choosesByFollowing(baseLexeme);
  for (let pass = 0; pass < 2; pass++) {
    for (let k = baseAt + 1; k < written.length; k++) {
      const f = allomorphOf(lang, lexemes[k] as Lexeme, joined(0, k), k + 1 < written.length ? (forms[k + 1] as readonly Unit[]) : [], k + 1 < written.length ? undefined : next);
      if (f === undefined) return err({ kind: "form", lexeme: (lexemes[k] as Lexeme).id });
      forms[k] = unitsOf(f);
    }
    // The base's own form chosen by what follows (bad- before -na; 7da3shar before a noun).
    if (ownBase) {
      const f = allomorphOf(lang, baseLexeme, [], baseAt + 1 < written.length ? (forms[baseAt + 1] as readonly Unit[]) : [], baseAt + 1 < written.length ? undefined : next);
      if (f !== undefined) forms[baseAt] = unitsOf(f);
    }
    for (let k = baseAt - 1; k >= 0; k--) {
      const f = allomorphOf(lang, lexemes[k] as Lexeme, joined(0, k), joined(k + 1, written.length));
      if (f === undefined) return err({ kind: "form", lexeme: (lexemes[k] as Lexeme).id });
      forms[k] = unitsOf(f);
    }
  }
  // Joined: the base and what follows it, then each lexeme before it, nearest first.
  let units = forms[baseAt] as readonly Unit[];
  for (let k = baseAt + 1; k < written.length; k++) units = join(lang, units, forms[k] as readonly Unit[], "suffix");
  for (let k = baseAt - 1; k >= 0; k--) units = join(lang, forms[k] as readonly Unit[], units, "prefix");
  if (built.value.whole && written.length === 1) return ok(realisation(built.value, units, built.value.steps));
  const rewritten = rewrite(lang, units, built.value.lexeme, base.feats ?? {}, options.blocking ?? true);
  return ok(realisation(built.value, rewritten.units, [...built.value.steps, ...rewritten.steps]));
};

/** A lexeme realised in each of `cells`. */
export const paradigm = (lang: CompiledLanguage, lexeme: string, cells: readonly UdFeatures[], options: RealiseOptions = {}): readonly Realised[] =>
  cells.map((cell) => ({ cell, result: realise(lang, lexeme, cell, options) }));
