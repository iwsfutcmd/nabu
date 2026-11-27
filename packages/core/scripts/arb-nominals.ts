/**
 * Modern Standard Arabic's nouns, adjectives and names of lexicons/arb (ADR 0158) merged with their
 * number, gender, case and state lexemes; the pronoun suffixes on a noun, the prepositions and a verb;
 * the proclitics with the article. Spelled with arb-Arab/standard and its vocalized layer, as tables for
 * a reviewer: docs/rules/arb-nominals.md. Run from packages/core after changing the rules:
 *   node scripts/arb-nominals.ts
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
const voc = compileSpeller(
  profile,
  declared.notation ?? { sets: {} },
  "vocalized",
);
const plain = compileSpeller(profile, declared.notation ?? { sets: {} });
if (!lang.ok || !voc.ok || !plain.ok)
  throw new Error(
    JSON.stringify([lang, voc, plain].flatMap((r) => (r.ok ? [] : r.error))),
  );

/** A token, its lexemes in order with the base marked by a leading "*", realised and spelled (vocalized, then plain). */
const show = (ids: readonly string[]): string => {
  const written = ids.map((id) =>
    id.startsWith("*")
      ? { lexeme: `lexeme:${id.slice(1)}`, base: true }
      : { lexeme: `lexeme:${id}` },
  );
  const r = realiseToken(lang.value, written);
  if (!r.ok)
    return `✗ ${r.error.kind}${"lexeme" in r.error ? ` ${r.error.lexeme}` : ""}`;
  const both = `${spell(voc.value, r.value.form).spelling} ${spell(plain.value, r.value.form).spelling}`;
  return r.value.missing === undefined
    ? both
    : `${both} (needs ${r.value.missing.join(", ")})`;
};

const entries = lexicon.lexemes.filter(
  (l) => l.pos === "NOUN" || l.pos === "ADJ" || l.pos === "PROPN",
);
const STATES = [
  ["indef", "indefinite"],
  ["al", "definite"],
  ["cons", "construct"],
] as const;
const CASES = ["nom", "acc", "gen"] as const;
let out =
  "# arb nouns, adjectives and names: every cell (generated)\n\nWritten by packages/core/scripts/arb-nominals.ts from lexicons/arb and profiles/arb-Arab.standard.yaml: never by hand. Each cell\nis the word merged with its lexemes (ADR 0158), vocalized, then as written. Every form is REVIEW (docs/rules/arb.md).\n";
for (const e of entries) {
  const id = e.id.slice("lexeme:".length);
  const own = e.feats?.["Gender"];
  const genders: readonly (string | undefined)[] =
    e.pos === "PROPN"
      ? [undefined]
      : own !== undefined
        ? [undefined]
        : ["masc", "fem"];
  const listed = (gender: string): boolean =>
    (e.forms ?? []).some(
      (f) =>
        f.feats?.["Number"] === "Plur" &&
        (f.feats["Gender"] === undefined ||
          f.feats["Gender"] === (gender === "fem" ? "Fem" : "Masc")),
    );
  out += `\n## ${id} (${e.pos}${e.classes === undefined ? "" : `, ${e.classes.join(", ")}`}): ${e.gloss?.["en"] ?? ""}\n\n| | | nominative | accusative | genitive |\n|---|---|---|---|---|\n`;
  for (const g of genders) {
    const gender = g ?? (own === "Fem" ? "fem" : "masc");
    const numbers: readonly (readonly [string, string])[] =
      e.pos === "PROPN"
        ? [["", "name"]]
        : [
            ["sing", "one"],
            ["dual", "two"],
            [
              listed(gender)
                ? "pl"
                : gender === "fem"
                  ? "fpl-sound"
                  : "mpl-sound",
              "several",
            ],
          ];
    for (const [number, label] of numbers) {
      // A name takes neither the article nor the construct state.
      for (const [state, stateLabel] of e.pos === "PROPN"
        ? STATES.slice(0, 1)
        : STATES) {
        const row = CASES.map((c) =>
          show([
            ...(state === "al" ? ["al"] : []),
            `*${id}`,
            ...(g === undefined ? [] : [g]),
            ...(number === "" ? [] : [number]),
            c,
            ...(state === "al" ? [] : [state]),
          ]),
        );
        out += `| ${g ?? ""} ${label} | ${stateLabel} | ${row.join(" | ")} |\n`;
      }
    }
  }
}
out +=
  "\n## Pronoun suffixes\n\n| | kitāb (construct, nominative) | fī | ʿalā | li | min | kataba (object) |\n|---|---|---|---|---|---|---|\n";
for (const p of [
  "1sg",
  "1pl",
  "2ms",
  "2fs",
  "2du",
  "2mpl",
  "2fpl",
  "3ms",
  "3fs",
  "3du",
  "3mpl",
  "3fpl",
]) {
  const cells = [
    show(["*kitab", "sing", "nom", "cons", `poss-${p}`]),
    show(["*fi", `poss-${p}`]),
    show(["*ala", `poss-${p}`]),
    show(["*li", `poss-${p}`]),
    show(["*min", `poss-${p}`]),
    show(["*kataba", "perf-3ms", `obj-${p}`]),
  ];
  out += `| ${p} | ${cells.join(" | ")} |\n`;
}
out += "\n## Before a suffix\n\n";
for (const [label, ids] of [
  ["his book, genitive", ["*kitab", "sing", "gen", "cons", "poss-3ms"]],
  ["his car", ["*sayyara", "sing", "nom", "cons", "poss-3ms"]],
  ["my two books", ["*kitab", "dual", "nom", "cons", "poss-1sg"]],
  ["my two books, genitive", ["*kitab", "dual", "gen", "cons", "poss-1sg"]],
  ["my teachers", ["*muallim", "masc", "mpl-sound", "nom", "cons", "poss-1sg"]],
  [
    "my teachers, genitive",
    ["*muallim", "masc", "mpl-sound", "gen", "cons", "poss-1sg"],
  ],
  ["they wrote it", ["*kataba", "perf-3mpl", "obj-3ms"]],
  ["you (men) wrote it", ["*kataba", "perf-2mpl", "obj-3ms"]],
  ["he throws it", ["impf-3", "*rama", "ms", "ind", "obj-3ms"]],
] as const) {
  out += `- ${label}: ${show(ids)}\n`;
}
out += "\n## Proclitics and the article\n\n";
for (const [label, ids] of [
  ["and the book", ["wa", "al", "*kitab", "sing", "nom"]],
  ["in the house (bi-)", ["bi", "al", "*bayt", "sing", "gen"]],
  ["for the house", ["li", "al", "*bayt", "sing", "gen"]],
  ["for the language", ["li", "al", "*lugha", "sing", "gen"]],
  ["the sun", ["al", "*shams", "sing", "nom"]],
  ["like a man", ["ka", "*rajul", "sing", "gen", "indef"]],
  ["he will write", ["sa", "impf-3", "*kataba", "ms", "ind"]],
  ["so he wrote", ["fa", "*kataba", "perf-3ms"]],
  [
    "the writer (a participle)",
    ["al", "*kataba", "ptcp", "masc", "sing", "nom"],
  ],
  [
    "a written letter (passive participle, feminine)",
    ["*kataba", "ptcp", "pass", "fem", "sing", "nom", "indef"],
  ],
  [
    "a judge (a defective participle)",
    ["*rama", "ptcp", "masc", "sing", "nom", "indef"],
  ],
  [
    "named, accusative",
    ["*samma", "ptcp", "pass", "masc", "sing", "acc", "indef"],
  ],
] as const) {
  out += `- ${label}: ${show(ids)}\n`;
}
writeFileSync(`${ROOT}/docs/rules/arb-nominals.md`, out);
console.log("wrote docs/rules/arb-nominals.md");
