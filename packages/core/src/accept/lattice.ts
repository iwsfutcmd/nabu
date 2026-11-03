/**
 * Accept lattice (gameplan §7.4): every alternative, normalized with the
 * orthography profile and split into units (tokens, or grapheme clusters for
 * orthographies without spaces), merged into a prefix DAG. Each final node is
 * one distinct alternative; two alternatives that normalize to the same units
 * are reported, because one of them is dead weight.
 *
 * Profile ZWNJ equivalents (Persian: ZWNJ ≡ space ≡ nothing) are compiled in
 * as extra paths flagged `zwnj`, so "کتاب ها" and "کتابها" reach a final node.
 */
import type { CompiledProfile } from "../profile/compile.ts";
import type { AcceptSet } from "./notation.ts";

export type PathFlag = "zwnj";

export interface LatticeFinal {
  readonly alternative: number;
  readonly weight: number;
  readonly canonical: boolean;
  readonly flags: readonly PathFlag[];
}

export interface LatticeNode {
  /** The unit on the edge into this node ("" for the root). */
  readonly unit: string;
  readonly parent: number;
  readonly children: Map<string, number>;
  final?: LatticeFinal;
}

export interface LatticeAlternative {
  readonly source: string;
  /** The alternative as written (normalized); for ZWNJ-flagged paths, the ZWNJ spelling. */
  readonly normalized: string;
  readonly units: readonly string[];
  readonly weight: number;
  readonly canonical: boolean;
  readonly flags: readonly PathFlag[];
}

export interface LatticeWarning {
  readonly code: "duplicate-after-normalization";
  readonly alternative: string;
  readonly duplicateOf: string;
}

export interface Lattice {
  /** Nodes in topological order: every parent precedes its children. */
  readonly nodes: readonly LatticeNode[];
  readonly alternatives: readonly LatticeAlternative[];
  readonly warnings: readonly LatticeWarning[];
}

const ZWNJ = "\u200C";
const MAX_ZWNJ_VARIANTS = 81;

/** Every way of writing the ZWNJs in `text` with the profile's equivalents (the original first). */
const zwnjVariants = (text: string, equivalents: readonly string[]): { text: string; flagged: boolean }[] => {
  const parts = text.split(ZWNJ);
  let out = [{ text: parts[0] as string, flagged: false }];
  for (const part of parts.slice(1)) {
    out = out.flatMap((prefix) =>
      [ZWNJ, ...equivalents.filter((e) => e !== ZWNJ)].map((eq) => ({ text: prefix.text + eq + part, flagged: prefix.flagged || eq !== ZWNJ })),
    );
    if (out.length > MAX_ZWNJ_VARIANTS) break;
  }
  return out;
};

export const compileLattice = (set: AcceptSet, profile: CompiledProfile): Lattice => {
  const nodes: LatticeNode[] = [{ unit: "", parent: -1, children: new Map() }];
  const alternatives: LatticeAlternative[] = [];
  const warnings: LatticeWarning[] = [];

  const insert = (units: readonly string[], final: LatticeFinal): LatticeFinal | undefined => {
    let at = 0;
    for (const unit of units) {
      const node = nodes[at] as LatticeNode;
      let next = node.children.get(unit);
      if (next === undefined) {
        next = nodes.length;
        nodes.push({ unit, parent: at, children: new Map() });
        node.children.set(unit, next);
      }
      at = next;
    }
    const node = nodes[at] as LatticeNode;
    if (node.final !== undefined) return node.final;
    node.final = final;
    return undefined;
  };

  for (const alt of set.alternatives) {
    const normalized = profile.normalize(alt.text);
    const variants =
      profile.zwnj !== undefined && normalized.includes(ZWNJ) ? zwnjVariants(normalized, profile.zwnj.equivalents) : [{ text: normalized, flagged: false }];
    for (const variant of variants) {
      const text = variant.flagged ? profile.normalize(variant.text) : variant.text;
      const units = profile.units(text);
      const flags: PathFlag[] = variant.flagged ? ["zwnj"] : [];
      const index = alternatives.length;
      // A ZWNJ spelling of the canonical answer is still the canonical answer (with a note), not an alternative.
      const existing = insert(units, { alternative: index, weight: alt.weight, canonical: alt.canonical, flags });
      if (existing !== undefined) {
        if (!variant.flagged) {
          warnings.push({ code: "duplicate-after-normalization", alternative: alt.text, duplicateOf: (alternatives[existing.alternative] as LatticeAlternative).source });
        }
        continue;
      }
      alternatives.push({ source: alt.text, normalized, units, weight: alt.weight, canonical: alt.canonical, flags });
    }
  }
  return { nodes, alternatives, warnings };
};
