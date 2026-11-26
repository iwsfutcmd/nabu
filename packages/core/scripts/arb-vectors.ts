/**
 * Writes conformance/realise-arb.json and spell-arb.json (ADR 0158; docs/rules/arb.md): chosen cells of
 * arb's verbs, every cell of kataba and the weak classes where their rules fire, as the engine gives them
 * now. Run from packages/core once a reviewer has checked a change (docs/rules/arb-verbs.md):
 *   node scripts/arb-vectors.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
  LanguageDeclaration,
  Lexicon,
  OrthographyProfile,
} from "@nabu/schema";
import { parse } from "yaml";
import {
  compileLanguage,
  compileSpeller,
  realiseToken,
  spell,
} from "../src/lexicon/index.ts";

const ROOT = resolve(import.meta.dirname, "../../..");
const declared = parse(
  readFileSync(`${ROOT}/lexicons/arb/language.yaml`, "utf8"),
) as LanguageDeclaration;
const lexicon = parse(
  readFileSync(`${ROOT}/lexicons/arb/lexemes.yaml`, "utf8"),
) as Lexicon;
const profile = parse(
  readFileSync(`${ROOT}/profiles/arb-Arab.standard.yaml`, "utf8"),
) as OrthographyProfile;
const lang = compileLanguage(declared, lexicon);
const plain = compileSpeller(profile, declared.notation ?? { sets: {} });
const voc = compileSpeller(profile, declared.notation ?? { sets: {} }, "vocalized");
if (!lang.ok || !plain.ok || !voc.ok) throw new Error("compile");
const CELLS: Record<string, readonly [readonly string[], readonly string[]]> = {
  "perf-3ms": [[], ["perf", "perf-3ms"]],
  "perf-3fs": [[], ["perf", "perf-3fs"]],
  "perf-3mpl": [[], ["perf", "perf-3mpl"]],
  "perf-3fpl": [[], ["perf", "perf-3fpl"]],
  "perf-1sg": [[], ["perf", "perf-1sg"]],
  "perf-1pl": [[], ["perf", "perf-1pl"]],
  "pass-perf-3ms": [[], ["perf", "pass", "perf-3ms"]],
  "pass-perf-1sg": [[], ["perf", "pass", "perf-1sg"]],
  "ind-3ms": [["impf-3"], ["impf", "ms", "ind"]],
  "ind-1sg": [["impf-1sg"], ["impf", "ind"]],
  "ind-2fs": [["impf-2"], ["impf", "fs", "ind"]],
  "ind-3mpl": [["impf-3"], ["impf", "mpl", "ind"]],
  "ind-3fpl": [["impf-3"], ["impf", "fpl", "ind"]],
  "ind-3mdu": [["impf-3"], ["impf", "du", "ind"]],
  "sub-3ms": [["impf-3"], ["impf", "ms", "sub"]],
  "sub-3mpl": [["impf-3"], ["impf", "mpl", "sub"]],
  "jus-3ms": [["impf-3"], ["impf", "ms", "jus"]],
  "jus-3fs": [["impf-3f"], ["impf", "sg", "jus"]],
  "pass-ind-3ms": [["impf-3"], ["impf", "pass", "ms", "ind"]],
  "imp-2ms": [[], ["imp", "ms"]],
  "imp-2fs": [[], ["imp", "fs"]],
  "imp-2mpl": [[], ["imp", "mpl"]],
  "imp-2fpl": [[], ["imp", "fpl"]],
  ptcp: [[], ["ptcp"]],
  "ptcp-pass": [[], ["ptcp", "pass"]],
};
const PICK: Record<string, readonly string[]> = {
  kataba: [
    "perf-3ms",
    "perf-3fs",
    "perf-3mpl",
    "perf-3fpl",
    "perf-1sg",
    "pass-perf-3ms",
    "ind-3ms",
    "ind-1sg",
    "ind-2fs",
    "ind-3mpl",
    "ind-3fpl",
    "ind-3mdu",
    "sub-3ms",
    "sub-3mpl",
    "jus-3ms",
    "jus-3fs",
    "pass-ind-3ms",
    "imp-2ms",
    "imp-2fs",
    "imp-2mpl",
    "imp-2fpl",
    "ptcp",
    "ptcp-pass",
  ],
  jalasa: ["imp-2ms"],
  akala: ["ind-1sg", "imp-2ms", "pass-ind-3ms", "ptcp"],
  saala: ["pass-perf-3ms", "ptcp-pass"],
  qaraa: ["perf-3ms", "ind-2fs", "ptcp"],
  wasala: ["ind-3ms", "pass-ind-3ms", "imp-2ms"],
  qala: [
    "perf-3ms",
    "perf-1sg",
    "pass-perf-3ms",
    "pass-perf-1sg",
    "ind-3ms",
    "jus-3ms",
    "ind-3fpl",
    "imp-2ms",
    "imp-2fs",
    "ptcp",
    "ptcp-pass",
  ],
  khafa: ["perf-1sg", "ind-3ms", "imp-2ms"],
  baa: ["perf-1sg", "ind-3ms", "jus-3ms"],
  rama: [
    "perf-3ms",
    "perf-3fs",
    "perf-3mpl",
    "perf-1sg",
    "pass-perf-3ms",
    "ind-3ms",
    "ind-3mpl",
    "ind-2fs",
    "ind-3fpl",
    "sub-3ms",
    "jus-3ms",
    "pass-ind-3ms",
    "imp-2ms",
    "imp-2fpl",
    "ptcp-pass",
  ],
  daa: [
    "perf-3ms",
    "perf-3fs",
    "perf-3mpl",
    "perf-1sg",
    "pass-perf-3ms",
    "pass-perf-1sg",
    "ind-3ms",
    "ind-2fs",
    "jus-3ms",
    "pass-ind-3ms",
  ],
  laqiya: [
    "perf-3mpl",
    "perf-1sg",
    "ind-3ms",
    "ind-2fs",
    "ind-3mpl",
    "jus-3ms",
  ],
  madda: [
    "perf-3ms",
    "perf-1sg",
    "ind-3ms",
    "ind-3fpl",
    "jus-3ms",
    "imp-2ms",
    "imp-2fpl",
    "ptcp-pass",
  ],
  zanna: ["perf-3fpl", "perf-1pl"],
  allama: ["perf-3ms", "ind-3ms", "ind-1sg", "ptcp"],
  samma: ["perf-3fs", "ind-3ms", "imp-2fpl"],
  kataba_iii: [],
  arsala: ["perf-3ms", "ind-3ms", "imp-2ms"],
  aqama: ["perf-1sg", "ind-3ms", "jus-3ms", "imp-2ms"],
  ata: ["perf-3ms", "ind-3mpl"],
  taallama: ["ind-3ms", "pass-perf-3ms"],
  inkasara: ["perf-3ms", "ind-3ms"],
  ijtamaa: ["perf-3ms", "ptcp"],
  ikhtara: ["perf-1sg", "jus-3ms"],
  ishtara: ["perf-3ms", "imp-2ms", "imp-2fpl"],
  ittasala: ["perf-3ms", "ind-3ms"],
  izdahara: ["perf-3ms"],
  istabara: ["perf-3ms"],
  istaqbala: ["perf-3ms", "ind-3ms", "ptcp-pass"],
  istafada: ["perf-1sg", "ind-3ms"],
};
const realise: object[] = [];
const spelled: object[] = [];
for (const [verb, cells] of Object.entries(PICK)) {
  for (const cell of cells) {
    const [before, after] = CELLS[cell] as readonly [
      readonly string[],
      readonly string[],
    ];
    const lexemes = [
      ...before.map((l) => ({ lexeme: `lexeme:${l}` })),
      { lexeme: `lexeme:${verb}`, base: true },
      ...after.map((l) => ({ lexeme: `lexeme:${l}` })),
    ];
    const r = realiseToken(lang.value, lexemes);
    if (!r.ok) throw new Error(`${verb} ${cell}`);
    const { form, missing } = r.value;
    realise.push({
      id: `realise/arb/${verb}/${cell}`,
      op: "realise-token",
      args: { lang: "arb", lexemes },
      expected: {
        ok: true,
        value: { form, ...(missing === undefined ? {} : { missing }) },
      },
      note: `${verb}, ${cell.replaceAll("-", " ")}.`,
    });
    for (const [layer, speller] of [
      ["vocalized", voc],
      [undefined, plain],
    ] as const) {
      const spelling = spell(speller.value, form).spelling;
      spelled.push({
        id: `spell/arb/${layer ?? "plain"}/${verb}/${cell}`,
        op: "spell",
        args: {
          profile: "arb-Arab/standard",
          ...(layer === undefined ? {} : { layer }),
          form,
          expected: spelling,
        },
        expected: { spelling, alternatives: [], expected: "spelling" },
        note: `${verb}, ${cell.replaceAll("-", " ")}.`,
      });
    }
  }
}
writeFileSync(
  `${ROOT}/conformance/realise-arb.json`,
  `${JSON.stringify({ $comment: "Modern Standard Arabic's verbs in the merge model (ADR 0158; docs/rules/arb.md): lexicons/arb merged with its affix lexemes, one vector per verb class and cell the owner can check (every cell of kataba; the weak classes where their rules fire). Every form is REVIEW.", vectors: realise }, null, 1)}\n`,
);
writeFileSync(
  `${ROOT}/conformance/spell-arb.json`,
  `${JSON.stringify({ $comment: "Spelling arb's lexical forms (docs/rules/arb.md): arb-Arab/standard without marks, and its vocalized layer: the hamza's seat, the madda, the silent alif, the diphthong's sukun. Every spelling is REVIEW.", vectors: spelled }, null, 1)}\n`,
);
console.log(realise.length, spelled.length);
