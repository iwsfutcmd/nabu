/**
 * Generates src/generated/*.json from the pinned CLDR JSON packages
 * (cldr-core, cldr-misc-full). The output is checked in, so the app never
 * depends on the engine's own CLDR/ICU data for these tables (gameplan §6.2,
 * §17 risk "differences between browsers' Unicode and Intl data"). The likely
 * subtags keep the languages this repository's profiles and UI catalogs write,
 * so a profile or catalog in a new language may need a run (the check says so).
 *
 *   node scripts/generate-cldr.ts           # write
 *   node scripts/generate-cldr.ts --check   # exit 1 if the checked-in files are stale
 */
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { parseExemplarSet } from "@nabu/core/text";

const require = createRequire(import.meta.url);
const PKG = resolve(import.meta.dirname, "..");
const OUT = join(PKG, "src/generated");
const config = JSON.parse(readFileSync(join(PKG, "cldr.config.json"), "utf8")) as {
  exemplarLocales: string[];
  exemplarKinds: ExemplarKind[];
};

type ExemplarKind = "main" | "auxiliary" | "index" | "punctuation" | "numbers";
const CLDR_KEY: Record<ExemplarKind, string> = {
  main: "exemplarCharacters",
  auxiliary: "auxiliary",
  index: "index",
  punctuation: "punctuation",
  numbers: "numbers",
};

const pkgRoot = (name: string): string => dirname(require.resolve(`${name}/package.json`));
const inputs = new Map<string, string>(); // relative path → sha256
const readCldr = <T>(pkg: string, path: string): T => {
  const text = readFileSync(join(pkgRoot(pkg), path), "utf8");
  inputs.set(`${pkg}/${path}`, createHash("sha256").update(text).digest("hex"));
  return JSON.parse(text) as T;
};

const yesNo = (v: string): boolean | null => (v === "YES" ? true : v === "NO" ? false : null);

// --- scriptMetadata -----------------------------------------------------------
interface RawScript {
  rank: number;
  sampleChar: string;
  idUsage: string;
  rtl: string;
  lbLetters: string;
  hasCase: string;
  shapingReq: string;
  ime: string;
  density: number;
  originCountry: string;
  likelyLanguage: string;
}
const rawScripts = readCldr<{ scriptMetadata: Record<string, RawScript> }>("cldr-core", "scriptMetadata.json").scriptMetadata;
const scriptMetadata = Object.fromEntries(
  Object.keys(rawScripts)
    .sort()
    .map((code) => {
      const s = rawScripts[code] as RawScript;
      return [
        code,
        {
          rank: s.rank,
          sample: s.sampleChar,
          idUsage: s.idUsage,
          rtl: yesNo(s.rtl),
          lbLetters: yesNo(s.lbLetters),
          hasCase: yesNo(s.hasCase),
          shaping: ({ YES: "required", MIN: "minimal", NO: "none" } as Record<string, string>)[s.shapingReq] ?? null,
          ime: yesNo(s.ime),
          density: s.density < 0 ? null : s.density,
          originCountry: s.originCountry,
          likelyLanguage: s.likelyLanguage,
        },
      ];
    }),
);

// --- likelySubtags ------------------------------------------------------------
// The table ships in the web app's main chunk, and most of CLDR's 7,900 entries are languages
// nothing here meets. It keeps every language a tag the app handles can name (one CLDR has locale
// data for, one a profile or a UI catalog of this repository writes, and `und`), and every
// language whose likely script is not Latin, so direction and fonts never depend on the trim.
// What it leaves out are rare Latin-script languages: maximize() leaves such a tag as it is, and
// a tag without a script is treated as Latin anyway (left to right, the default font stack).
const likely = readCldr<{ supplemental: { version: { _cldrVersion: string; _unicodeVersion: string }; likelySubtags: Record<string, string> } }>(
  "cldr-core",
  "supplemental/likelySubtags.json",
).supplemental;
const languageOf = (tag: string): string => tag.split("-")[0] as string;
const REPO = resolve(PKG, "../..");
const written = new Set([
  "und",
  ...readCldr<{ availableLocales: { full: string[] } }>("cldr-core", "availableLocales.json").availableLocales.full.map(languageOf),
  ...readdirSync(join(REPO, "profiles"))
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => {
      const lang = /^lang:\s*["']?([A-Za-z0-9-]+)/mu.exec(readFileSync(join(REPO, "profiles", f), "utf8"))?.[1];
      if (lang === undefined) throw new Error(`profiles/${f} names no lang`);
      return languageOf(lang);
    }),
  ...readdirSync(join(PKG, "messages"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => languageOf(f.slice(0, -".json".length))),
]);
const nonLatin = new Set(Object.entries(likely.likelySubtags).flatMap(([key, value]) => (value.split("-")[1] === "Latn" ? [] : [languageOf(key)])));
const likelySubtags = Object.fromEntries(
  Object.entries(likely.likelySubtags)
    .filter(([key]) => written.has(languageOf(key)) || nonLatin.has(languageOf(key)))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
);

// --- parentLocales ------------------------------------------------------------
const parents = readCldr<{ supplemental: { parentLocales: { parentLocale: Record<string, string>; _localeRules?: { parentLocale?: { nonlikelyScript?: string } } } } }>(
  "cldr-core",
  "supplemental/parentLocales.json",
).supplemental.parentLocales;
const parentLocales = {
  parentLocale: Object.fromEntries(Object.entries(parents.parentLocale).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
  /** UTS #35 §4.2.6: a locale whose script is not the likely script of its language inherits from root. */
  nonlikelyScriptParent: parents._localeRules?.parentLocale?.nonlikelyScript ?? null,
};

// --- numbering systems (numeric only: id → its ten digits, 0–9) -------------------
const rawNumbering = readCldr<{ supplemental: { numberingSystems: Record<string, { _type: string; _digits?: string }> } }>(
  "cldr-core",
  "supplemental/numberingSystems.json",
).supplemental.numberingSystems;
const numberingSystems = Object.fromEntries(
  Object.entries(rawNumbering)
    .filter(([, n]) => n._type === "numeric" && n._digits !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([id, n]) => [id, n._digits as string]),
);

// --- macrolanguages -----------------------------------------------------------
// Each language a macrolanguage encompasses, and that macrolanguage, as CLDR records them: the
// replacements its aliases give for a reason of "macrolanguage" (arb → ar, cmn → zh), and its
// one-way language matches at distance 10 between two bare languages (apc → ar, yue → zh). The two
// lists are disjoint. The pipeline hears a language its recognizer or eSpeak NG has no model for as
// its macrolanguage (ADR 0116).
const macroAliases = readCldr<{ supplemental: { metadata: { alias: { languageAlias: Record<string, { _reason?: string; _replacement?: string }> } } } }>(
  "cldr-core",
  "supplemental/aliases.json",
).supplemental.metadata.alias.languageAlias;
const macroMatches = readCldr<{ supplemental: { languageMatching: { "written-new": { languageMatch: { _desired: string; _supported: string; _distance: number | string; _oneway?: boolean | string }[] } } } }>(
  "cldr-core",
  "supplemental/languageMatching.json",
).supplemental.languageMatching["written-new"].languageMatch;
const bare = /^[a-z]{2,3}$/u;
const macrolanguages = Object.fromEntries(
  [
    ...Object.entries(macroAliases).flatMap(([language, a]) => (a._reason === "macrolanguage" && a._replacement !== undefined && bare.test(language) && bare.test(a._replacement) ? [[language, a._replacement] as const] : [])),
    ...macroMatches.flatMap((m) => (String(m._oneway) === "true" && Number(m._distance) === 10 && bare.test(m._desired) && bare.test(m._supported) ? [[m._desired, m._supported] as const] : [])),
  ].sort(([a], [b]) => (a < b ? -1 : 1)),
);

// --- exemplars ----------------------------------------------------------------
const exemplars = Object.fromEntries(
  config.exemplarLocales.map((locale) => {
    const chars = readCldr<{ main: Record<string, { characters: Record<string, string> }> }>(
      "cldr-misc-full",
      `main/${locale}/characters.json`,
    ).main[locale]?.characters;
    if (chars === undefined) throw new Error(`No characters for ${locale}`);
    const sets = Object.fromEntries(
      config.exemplarKinds.flatMap((kind) => {
        const pattern = chars[CLDR_KEY[kind]];
        return pattern === undefined ? [] : [[kind, parseExemplarSet(pattern)]];
      }),
    );
    return [locale, sets];
  }),
);

// --- provenance ---------------------------------------------------------------
const meta = {
  $comment: "GENERATED by packages/i18n/scripts/generate-cldr.ts. Do not edit; run `pnpm cldr`.",
  cldrVersion: likely.version._cldrVersion,
  unicodeVersion: likely.version._unicodeVersion,
  packages: {
    "cldr-core": (JSON.parse(readFileSync(join(pkgRoot("cldr-core"), "package.json"), "utf8")) as { version: string }).version,
    "cldr-misc-full": (JSON.parse(readFileSync(join(pkgRoot("cldr-misc-full"), "package.json"), "utf8")) as { version: string }).version,
  },
  license: "Unicode-3.0",
  inputs: Object.fromEntries([...inputs].sort(([a], [b]) => (a < b ? -1 : 1))),
};

const files: Record<string, unknown> = {
  "cldr-meta.json": meta,
  "script-metadata.json": scriptMetadata,
  "likely-subtags.json": likelySubtags,
  "parent-locales.json": parentLocales,
  "exemplars.json": exemplars,
  "numbering-systems.json": numberingSystems,
  "macrolanguages.json": macrolanguages,
};

/** One entry per line for the big tables, so CLDR bumps produce reviewable diffs. */
const format = (name: string, data: unknown): string => {
  if (name !== "likely-subtags.json" && name !== "exemplars.json" && name !== "macrolanguages.json") return `${JSON.stringify(data, null, 2)}\n`;
  const lines = Object.entries(data as Record<string, unknown>).map(([k, v]) => {
    if (name !== "exemplars.json") return `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`;
    const sets = Object.entries(v as Record<string, unknown>).map(([kind, set]) => `    ${JSON.stringify(kind)}: ${JSON.stringify(set)}`);
    return `  ${JSON.stringify(k)}: {\n${sets.join(",\n")}\n  }`;
  });
  return `{\n${lines.join(",\n")}\n}\n`;
};

const check = process.argv.includes("--check");
let stale = 0;
mkdirSync(OUT, { recursive: true });
for (const [name, data] of Object.entries(files)) {
  const path = join(OUT, name);
  const text = format(name, data);
  if (check) {
    if (!existsSync(path) || readFileSync(path, "utf8") !== text) {
      console.error(`stale: ${path}`);
      stale++;
    }
  } else {
    writeFileSync(path, text);
    console.log(`wrote ${path}`);
  }
}
if (stale > 0) {
  console.error("CLDR data is out of date; run `pnpm cldr`.");
  process.exit(1);
}
