/**
 * Every Modern Standard Arabic verb of lexicons/arb (ADR 0158) merged with its affix lexemes in each
 * person, mood and voice, spelled with arb-Arab/standard and its vocalized layer, as tables for a
 * reviewer: docs/rules/arb-verbs.md. Run from packages/core after changing the rules:
 *   node scripts/arb-verbs.ts ../../profiles/arb-Arab.standard.yaml "" ../../docs/rules/arb-verbs.md
 * (the second argument picks one verb; "" all of them).
 */
import { readFileSync, writeFileSync } from "node:fs";
import type {
  LanguageDeclaration,
  Lexicon,
  OrthographyProfile,
} from "@nabu/schema";
import { parse } from "yaml";
import { resolve } from "node:path";
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
const lang = compileLanguage(declared, lexicon);
if (!lang.ok) {
  console.error(lang.error);
  process.exit(1);
}
const profilePath = process.argv[2];
const profile =
  profilePath === undefined || profilePath === ""
    ? undefined
    : (parse(readFileSync(profilePath, "utf8")) as OrthographyProfile);
const spellers =
  profile === undefined
    ? []
    : [
        compileSpeller(profile, declared.notation ?? { sets: {} }, "vocalized"),
        compileSpeller(profile, declared.notation ?? { sets: {} }),
      ];
for (const s of spellers)
  if (!s.ok) {
    console.error(s.error);
    process.exit(1);
  }

type Cell = readonly [string, readonly string[], readonly string[]];
const PERF: Cell[] = [
  ["3ms", [], ["perf", "perf-3ms"]],
  ["3fs", [], ["perf", "perf-3fs"]],
  ["3mdu", [], ["perf", "perf-3mdu"]],
  ["3fdu", [], ["perf", "perf-3fdu"]],
  ["3mpl", [], ["perf", "perf-3mpl"]],
  ["3fpl", [], ["perf", "perf-3fpl"]],
  ["2ms", [], ["perf", "perf-2ms"]],
  ["2fs", [], ["perf", "perf-2fs"]],
  ["2du", [], ["perf", "perf-2du"]],
  ["2mpl", [], ["perf", "perf-2mpl"]],
  ["2fpl", [], ["perf", "perf-2fpl"]],
  ["1sg", [], ["perf", "perf-1sg"]],
  ["1pl", [], ["perf", "perf-1pl"]],
];
const IMPF = (mood: string): Cell[] => [
  ["3ms", ["impf-3"], ["impf", "ms", mood]],
  ["3fs", ["impf-3f"], ["impf", "sg", mood]],
  ["3mdu", ["impf-3"], ["impf", "du", mood]],
  ["3fdu", ["impf-3f"], ["impf", "du", mood]],
  ["3mpl", ["impf-3"], ["impf", "mpl", mood]],
  ["3fpl", ["impf-3"], ["impf", "fpl", mood]],
  ["2ms", ["impf-2"], ["impf", "ms", mood]],
  ["2fs", ["impf-2"], ["impf", "fs", mood]],
  ["2du", ["impf-2"], ["impf", "du", mood]],
  ["2mpl", ["impf-2"], ["impf", "mpl", mood]],
  ["2fpl", ["impf-2"], ["impf", "fpl", mood]],
  ["1sg", ["impf-1sg"], ["impf", mood]],
  ["1pl", ["impf-1pl"], ["impf", mood]],
];
const IMP: Cell[] = [
  ["2ms", [], ["imp", "ms"]],
  ["2fs", [], ["imp", "fs"]],
  ["2du", [], ["imp", "du"]],
  ["2mpl", [], ["imp", "mpl"]],
  ["2fpl", [], ["imp", "fpl"]],
];
const passive = (cells: Cell[]): Cell[] =>
  cells.map(([n, b, a]) => [n, b, [a[0] as string, "pass", ...a.slice(1)]]);

const show = (verb: string, [, before, after]: Cell): string => {
  const written = [
    ...before.map((l) => ({ lexeme: `lexeme:${l}` })),
    { lexeme: `lexeme:${verb}`, base: true },
    ...after.map((l) => ({ lexeme: `lexeme:${l}` })),
  ];
  const r = realiseToken(lang.value, written);
  if (!r.ok)
    return `✗ ${r.error.kind}${"lexeme" in r.error ? ` ${r.error.lexeme}` : ""}`;
  const shown =
    spellers.length === 0
      ? r.value.form
      : spellers
          .map((s) => (s.ok ? spell(s.value, r.value.form).spelling : ""))
          .join(" ");
  return `${shown}${r.value.missing === undefined ? "" : ` (needs ${r.value.missing.join(", ")})`}`;
};

const verbs = lexicon.lexemes.filter((l) => l.pos === "VERB");
const only = process.argv[3];
let out =
  "# arb verbs: every cell (generated)\n\nWritten by packages/core/scripts/arb-verbs.ts from lexicons/arb and profiles/arb-Arab.standard.yaml: never by hand. Each cell is the verb merged\nwith its affix lexemes (ADR 0158), vocalized, then as written. Every form is REVIEW (docs/rules/arb.md).\n";
for (const v of verbs) {
  const id = v.id.slice("lexeme:".length);
  if (only !== undefined && only !== "" && id !== only) continue;
  out += `\n## ${id} (${typeof v.form === "object" && v.form !== null && "form" in v.form ? String(v.form.form) : ""}): ${v.gloss?.["en"] ?? ""}\n\n| | perfect | passive | indicative | subjunctive | jussive | passive ind. | imperative |\n|---|---|---|---|---|---|---|---|\n`;
  const imp = new Map(IMP.map((c) => [c[0], c]));
  PERF.forEach((cell, k) => {
    const row = [
      PERF[k],
      passive(PERF)[k],
      IMPF("ind")[k],
      IMPF("sub")[k],
      IMPF("jus")[k],
      passive(IMPF("ind"))[k],
    ].map((c) => show(id, c as Cell));
    const i = imp.get(cell[0]);
    out += `| ${cell[0]} | ${row.join(" | ")} | ${i === undefined ? "" : show(id, i)} |\n`;
  });
  out += `\nParticiples: ${show(id, ["", [], ["ptcp"]])} · ${show(id, ["", [], ["ptcp", "pass"]])}\n`;
}
if (process.argv[4] !== undefined) writeFileSync(process.argv[4], out);
else console.log(out);
