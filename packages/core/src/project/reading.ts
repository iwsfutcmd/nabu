/**
 * The reading side of a scheme's statement (ADR 0148; docs/migration-design.md, "Stages 5 and 6"):
 * how a reading in the scheme relates to a spelling of the orthography it annotates (`of`), and
 * which of its pieces the script leaves open, for reading cards and minimal ruby (ADR 0131, 0141).
 *
 * A reading is prepared as NFC, cut into grapheme clusters and lowercased in the scheme's `lang`
 * (or `language`), each cluster's capital remembered so a variant keeps it. A spelling is NFC, cut
 * into code points: its letters, marks and joiners are each a unit (an Arabic shadda or a ZWNJ is
 * written, and stated, on its own). A correspondence consumes its `says` of the reading (it may be
 * "": written and not said) and one of its written forms of the spelling (it may be "": said and not
 * written), its `when` tested on the spelling. Nothing is implied: a piece or a letter no
 * correspondence names is not accounted for. The marks a scheme `ignores` (hbo's points) are taken out
 * of a spelling first: the relation is of what remains (the consonantal text, pointed or not).
 */
import type { ReadingScheme } from "@nabu/schema";
import { graphemes } from "../text/graphemes.ts";
import { parseExemplarSet } from "../text/unicode-set.ts";
import { compileRules, holds, startsWith, type Rule } from "./rules.ts";

/** One step of a path relating a reading to a spelling. */
export interface ReadingSite {
  readonly says: string;
  readonly written: string;
  readonly rule: string;
  readonly kind: "fixed" | "free";
  readonly note?: string;
}

export interface ReadingProjection {
  readonly scheme: string;
  /** The orthography whose spellings the statement relates readings to, where it states one. */
  readonly of?: string;
  /** The sites of one path that reads the spelling so, or undefined where the statement allows none. */
  readonly spells: (reading: string, spelling: string) => readonly ReadingSite[] | undefined;
  /**
   * The places of the reading the script leaves open, first to last, each the reading changed there
   * in every way it allows (capitals kept): with a spelling the statement relates it to, what the
   * letter written there also writes; otherwise what the scheme's sets let a piece be traded for.
   */
  readonly variants: (reading: string, spelling?: string) => readonly (readonly string[])[];
  /** The same, one list: each variant once, places first to last. */
  readonly letterVariants: (reading: string, spelling?: string) => readonly string[];
  /** The reading as minimal ruby: open pieces kept, each run of closed ones a middle dot, spaces kept; "" where nothing is open. */
  readonly open: (reading: string, spelling?: string) => string;
  /** For each grapheme of the reading (in the scheme's language), whether it is in a place the script leaves open. */
  readonly openAt: (reading: string, spelling?: string) => readonly boolean[];
  /** Whether the statement leaves anything open anywhere: some piece a card may trade for another (`loses`). */
  readonly opens: boolean;
}

/** Where a reading's letters the script leaves open are left out: a run of others stands as one dot. */
const CLOSED = "\u00B7";

interface Piece {
  readonly text: string;
  readonly lower: string;
  readonly capital: boolean;
}

interface Step {
  readonly rule: Rule;
  readonly written: string;
  readonly says: number;
  readonly writes: number;
}

/** A scheme's statement compiled. Throws where the statement cannot be read (the schemes are checked data). */
export const compileReadingProjection = (scheme: ReadingScheme): ReadingProjection => {
  const locale = scheme.lang ?? scheme.language;
  const lower = (text: string): string => text.normalize("NFC").toLocaleLowerCase(locale).normalize("NFC");
  // The marks the relation passes over (`ignores`: hbo's points), each code point on its own.
  const ignored: ReadonlySet<string> = new Set(scheme.ignores === undefined ? [] : parseExemplarSet(scheme.ignores).flatMap((m) => Array.from(m.normalize("NFD"))));
  const spellingUnits = (text: string): readonly string[] => Array.from(text.normalize("NFC")).filter((c) => !ignored.has(c));
  const compiled = compileRules(scheme.correspondences ?? [], { says: lower, units: spellingUnits, written: (s) => s.normalize("NFC") });
  if (!compiled.ok) throw new Error(`scheme ${scheme.id}: ${compiled.error.join("; ")}`);
  const rules = compiled.value;
  const saysUnits = new Map(rules.map((r) => [r, graphemes(r.says, locale)] as const));

  // The sets a card may trade within: each correspondence's says with its `loses`, in statement order.
  const alternatives = new Map<string, string[]>();
  for (const r of rules) {
    const set = [r.says, ...r.loses].filter((p) => p !== "");
    if (set.length < 2) continue;
    for (const p of set) {
      const list = alternatives.get(p) ?? [p];
      for (const q of set) if (!list.includes(q)) list.push(q);
      alternatives.set(p, list);
    }
  }
  const othersOf = (piece: string): readonly string[] => (alternatives.get(piece) ?? []).filter((p) => p !== piece);
  // Every piece a reading may be segmented into without a spelling: a `says` or a member of some `loses`
  // that a card may trade. A piece no set holds is no place to trade, and a word a statement lists for
  // one spelling (chg's šahargä written شهریکه, hbo's qere) is read as its letters without that spelling.
  const known = [...alternatives.keys()].map((p) => graphemes(p, locale)).sort((a, b) => b.length - a.length);

  const prepare = (reading: string): readonly Piece[] =>
    graphemes(reading.normalize("NFC"), locale).map((text) => {
      const l = lower(text);
      return { text, lower: l, capital: l !== text };
    });
  const recase = (piece: readonly Piece[], replacement: string): string => {
    if (piece[0]?.capital !== true) return replacement;
    const [first, ...rest] = graphemes(replacement, locale);
    return first === undefined ? replacement : `${first.toLocaleUpperCase(locale)}${rest.join("")}`;
  };

  /** A path through both, by dynamic programming; the steps in order. */
  const path = (pieces: readonly Piece[], spelling: string): readonly { step: Step; from: number; at: number }[] | undefined => {
    const r = pieces.map((p) => p.lower);
    const s = spellingUnits(spelling);
    const width = s.length + 1;
    // 0 unknown, 1 reaches the end, 2 does not; choice holds the step taken.
    const state = new Uint8Array((r.length + 1) * width);
    const choice = new Map<number, Step>();
    const steps = (i: number, j: number): Step[] => {
      const out: Step[] = [];
      for (const rule of rules) {
        const said = saysUnits.get(rule) as readonly string[];
        if (!startsWith(r, i, said)) continue;
        for (const w of rule.written) {
          if (said.length + w.units.length === 0) continue;
          if (startsWith(s, j, w.units) && holds(rule, s, j, j + w.units.length)) out.push({ rule, written: w.text, says: said.length, writes: w.units.length });
        }
      }
      // The longest `says` first, then the longest written form, then the earlier correspondence.
      return out.sort((a, b) => b.says - a.says || b.writes - a.writes || a.rule.index - b.rule.index);
    };
    const reach = (i: number, j: number): boolean => {
      const k = i * width + j;
      const known = state[k] as number;
      if (known !== 0) return known === 1;
      if (i === r.length && j === s.length) {
        state[k] = 1;
        return true;
      }
      // Marked unreachable while it is explored: no step consumes nothing, so a cycle cannot form.
      state[k] = 2;
      for (const step of steps(i, j)) {
        if (reach(i + step.says, j + step.writes)) {
          state[k] = 1;
          choice.set(k, step);
          return true;
        }
      }
      return false;
    };
    if (!reach(0, 0)) return undefined;
    const out: { step: Step; from: number; at: number }[] = [];
    let i = 0;
    let j = 0;
    while (i < r.length || j < s.length) {
      const step = choice.get(i * width + j) as Step;
      out.push({ step, from: i, at: j });
      i += step.says;
      j += step.writes;
    }
    return out;
  };

  const spells = (reading: string, spelling: string): readonly ReadingSite[] | undefined =>
    path(prepare(reading), spelling)?.map(({ step }) => ({
      says: step.rule.says,
      written: step.written,
      rule: step.rule.id,
      kind: step.rule.kind,
      ...(step.rule.note !== undefined && { note: step.rule.note }),
    }));

  /** The reading's places: each a span of its pieces and what it may be traded for there. */
  const places = (reading: string, spelling: string | undefined): { readonly pieces: readonly Piece[]; readonly spans: readonly { from: number; to: number; others: readonly string[] }[] } => {
    const pieces = prepare(reading);
    const found = scheme.of !== undefined && spelling !== undefined ? path(pieces, spelling) : undefined;
    if (found !== undefined) {
      const s = spellingUnits(spelling as string);
      const spans = found.flatMap(({ step, from, at }) => {
        if (step.says === 0) return [];
        const piece = step.rule.says;
        const traded = new Set<string>(step.rule.loses);
        // What the same letter also writes here, or, where the piece is not written, what else the
        // script leaves unwritten here (Chaghatay's short vowels: qizil's i as a, ä, e, u, ü): told
        // apart only by what the scheme lets a card trade.
        for (const other of rules) {
          if (other === step.rule || other.says === "" || other.says === piece) continue;
          if (other.written.some((w) => w.text === step.written) && holds(other, s, at, at + step.writes)) traded.add(other.says);
        }
        const allowed = othersOf(piece);
        const others = allowed.filter((p) => traded.has(p));
        return [{ from, to: from + step.says, others }];
      });
      return { pieces, spans };
    }
    // No spelling (or none the statement relates): the longest known piece at each place.
    const spans: { from: number; to: number; others: readonly string[] }[] = [];
    const lowers = pieces.map((p) => p.lower);
    let i = 0;
    while (i < pieces.length) {
      const match = known.find((k) => startsWith(lowers, i, k));
      const length = match?.length ?? 1;
      const piece = lowers.slice(i, i + length).join("");
      spans.push({ from: i, to: i + length, others: othersOf(piece) });
      i += length;
    }
    return { pieces, spans };
  };

  const variants = (reading: string, spelling?: string): readonly (readonly string[])[] => {
    const { pieces, spans } = places(reading, spelling);
    const text = pieces.map((p) => p.text);
    return spans
      .filter((span) => span.others.length > 0)
      .map((span) => {
        const own = pieces.slice(span.from, span.to);
        return span.others.map((o) => [...text.slice(0, span.from), recase(own, o), ...text.slice(span.to)].join(""));
      });
  };

  const letterVariants = (reading: string, spelling?: string): readonly string[] => [...new Set(variants(reading, spelling).flat())];

  const open = (reading: string, spelling?: string): string => {
    const { pieces, spans } = places(reading, spelling);
    let out = "";
    let kept = false;
    for (const span of spans) {
      const text = pieces
        .slice(span.from, span.to)
        .map((p) => p.text)
        .join("");
      if (/^\s+$/u.test(text)) out += text;
      else if (span.others.length > 0) {
        out += text;
        kept = true;
      } else if (!out.endsWith(CLOSED)) out += CLOSED;
    }
    return kept ? out : "";
  };

  const openAt = (reading: string, spelling?: string): readonly boolean[] => {
    const { pieces, spans } = places(reading, spelling);
    const out: boolean[] = pieces.map(() => false);
    for (const span of spans) if (span.others.length > 0) for (let k = span.from; k < span.to; k++) out[k] = true;
    return out;
  };

  return { scheme: scheme.id, ...(scheme.of !== undefined && { of: scheme.of }), spells, variants, letterVariants, open, openAt, opens: alternatives.size > 0 };
};
