/**
 * A course's lexicon laid out for browsing (the Data page's Lexicon and Language views, debug mode):
 * every lexeme of the lexicon, free and bound alike (a stem, a clitic, an affix, a morpheme no
 * orthography writes), each with everything stored on it, in three parts: its entry as the lexicon
 * file has it (lexicons/<lang>/lexemes.yaml, where the app has the file beside it), what the bundle
 * carries of it (`BundleLexeme`), and what the course does with it. And the language file
 * (lexicons/<lang>/language.yaml), whose defaults a lexeme's features cannot be read without.
 *
 * Each record is a small tree (`DataNode`) the page renders without knowing a field: every key a
 * record has comes out, known or not. The known ones are read by name for what their strings are
 * (a spelling is text of its orthography, a reading text of its scheme, a gloss or a note text of its
 * support language, a lexical form text of the language's own script; ids, tags, statuses and
 * feature values are code); a key no one has named yet is still shown, its strings as text of an
 * undetermined language (`und`), so a field added later is never silently missing. Pure: the caller
 * fetches the files and passes them in. Built once per course view, source and alias table.
 */
import type { AliasTable, BundleLexeme, SchemeId, TaggedText, UdFeatures } from "@nabu/schema";
import { skillsAsked } from "../learner/words.ts";
import { courseData, type Carrier, type EntryId, type WrittenWord } from "./browse.ts";
import { lexemesInOrder, unitIndexOf, type CourseView } from "./course.ts";
import { readingAsText } from "./homographs.ts";
import { bound as isBound } from "./lexemes.ts";
import type { Searched } from "./search.ts";

/** A piece of a record, as the page shows it. */
export type DataNode =
  /** An id, a tag, a status, a feature's name or value, a number, a boolean: code, as written. */
  | { readonly kind: "code"; readonly value: string }
  /** Language text, in its own language, orthography and direction. */
  | { readonly kind: "text"; readonly text: TaggedText }
  | { readonly kind: "list"; readonly items: readonly DataNode[] }
  | { readonly kind: "record"; readonly fields: readonly DataField[] };

export interface DataField {
  readonly key: string;
  readonly value: DataNode;
  /** For a bundle lexeme's feature: whether its entry stores it, or a default of its language gives it. */
  readonly note?: "default" | "stored" | undefined;
}

/**
 * A lexicon's own files, as they sit beside the app (apps/web/lexicon-source.ts): lexemes.yaml and
 * language.yaml, parsed, nothing dropped or reshaped.
 */
export interface LexiconSource {
  readonly lexemes: { readonly lexemes: readonly Readonly<Record<string, unknown>>[]; readonly [key: string]: unknown };
  readonly language?: Readonly<Record<string, unknown>> | undefined;
}

const isObject = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === "object" && value !== null && !Array.isArray(value);

/** Whether a fetched file is a lexicon's source: an object whose `lexemes` holds a list of them. Nothing more is checked: the file is the repository's own. */
export const isLexiconSource = (value: unknown): value is LexiconSource => isObject(value) && isObject(value["lexemes"]) && Array.isArray(value["lexemes"]["lexemes"]);

/** One lexeme of the lexicon, with everything stored on it. */
export interface LexemeRow {
  readonly id: EntryId;
  /** As the bundle ships it; undefined for a lexeme only the lexicon's file has. */
  readonly lexeme: BundleLexeme | undefined;
  /** Written only inside words (an ending, a suffixed pronoun, the unwritten ezafe): no orthography spells it alone. */
  readonly bound: boolean;
  /** Its part of speech, the features it has of itself or realises, "bound" where it is. */
  readonly tags: readonly string[];
  /** The unit that first teaches it, from 0; the course's unit count where no node introduces it. */
  readonly unit: number;
  /** Its first spelling in the orthography being learned. */
  readonly form?: TaggedText | undefined;
  readonly gloss?: TaggedText | undefined;
  /** Its entry in the lexicon's file, every key; undefined where the file is not at hand or has no such entry. */
  readonly source?: DataNode | undefined;
  /** Its `BundleLexeme`, every key, its features marked stored or given by a default where the entry is at hand. */
  readonly bundle?: DataNode | undefined;
  /** What the course does with it: where it is introduced, how many sentences list it, its clip, the skills asked of it, its labels, the old ids that became it. */
  readonly course: DataNode;
  /** The ways its sentences write it (a free lexeme), each with what the token carries. */
  readonly written: readonly WrittenWord[];
  /** The words that carry it (a bound lexeme), as sentences write them. */
  readonly carriers: readonly Carrier[];
  /** Its picture's bundle path. */
  readonly image?: string | undefined;
  /** What the page's search looks in (`textMatcher`). */
  readonly searched: Searched;
}

export interface LexiconData {
  readonly lexemes: readonly LexemeRow[];
  /** Whether the lexicon's own files were at hand: without them, rows have no `source`. */
  readonly source: boolean;
  /** The lexicon file's own fields (language, license, provenance), shown once; undefined without the file. */
  readonly file?: DataNode | undefined;
  /** The language file as stored; without it, what the bundle carries of the language (its bare cells, labels, rules). */
  readonly language: DataNode;
}

const code = (value: string): DataNode => ({ kind: "code", value });
const text = (t: TaggedText): DataNode => ({ kind: "text", text: t });
const record = (fields: readonly DataField[]): DataNode => ({ kind: "record", fields });
const list = (items: readonly DataNode[]): DataNode => ({ kind: "list", items });

type Tag = Pick<TaggedText, "lang" | "orthography">;

const tagOf = (lang: string, orthography: string): Tag => ({ lang: lang as TaggedText["lang"], orthography: orthography as TaggedText["orthography"] });

/** Text of one run: a string as language data, NFC at this boundary. */
const tagged = (tag: Tag, value: string): TaggedText => ({ ...tag, tokens: [{ surface: value.normalize("NFC"), kind: "lexical" }] });

const isTaggedText = (value: unknown): value is TaggedText => isObject(value) && typeof value["lang"] === "string" && typeof value["orthography"] === "string" && Array.isArray(value["tokens"]);

/** What a string is, read from the key it is under. */
type Mode =
  | "auto"
  | "code"
  /** Under `spelled`: keys are orthographies, strings their spellings. */
  | "spelled"
  /** Under `readings` (or a logograph's `reading`): keys are schemes. */
  | "readings"
  /** Under `gloss` or `notes`: keys are support languages. */
  | "support"
  /** A lexical form (`form`, `stem`, an allomorph's): the language's own script, in its notation (docs/lexical-forms). */
  | "lexical"
  /** A condition (`after`, `before`, a default's `when`): `ends` and `starts` are lexical forms, the rest code. */
  | "condition"
  /** A language's `notation`: its signs are lexical forms, its `order` and `sets` UnicodeSets (code), its notes support text. */
  | "notation"
  /** A note for reviewers, in English, never shown to a learner (a radical form's `basis` and `note`). */
  | "reviewer";

/** Keys whose whole value is code: ids, tags, feature values, statuses, provenance, paths. */
const CODE_KEYS: ReadonlySet<string> = new Set([
  "id",
  "pos",
  "realises",
  "head",
  "feats",
  "chooses",
  "classes",
  "concept",
  "base",
  "pattern",
  "status",
  "statement",
  "scope",
  "provenance",
  "license",
  "language",
  "image",
  "parts",
  "leftovers",
  "varieties",
  "registers",
  "dimensions",
  "lexical",
  "citation",
  "bare",
  "features",
  "gives",
  "was",
  "class",
  "inflects",
]);

const childMode = (mode: Mode, key: string, value: unknown): Mode => {
  switch (mode) {
    case "code":
    case "spelled":
    case "readings":
    case "support":
      return mode;
    case "reviewer":
      return mode;
    case "lexical":
      // A form's object (radicals and Form, a pattern's templates, a listed item's parts, a logograph).
      if (key === "reading" || key === "readings") return "readings";
      // A radical form's Form, the vowels it leaves open (by name: a, i, u) and where they are from.
      if (key === "form" || key === "parts" || key === "inflects" || key === "vowels" || key === "source") return "code";
      if (key === "basis" || key === "note") return "reviewer";
      return "lexical";
    case "notation":
      if (key === "notes") return "support";
      return key === "order" || key === "sets" ? "code" : "lexical";
    case "condition":
      return key === "ends" || key === "starts" ? "lexical" : "code";
    case "auto":
      if (key === "spelled") return "spelled";
      if (key === "readings") return "readings";
      if (key === "gloss" || key === "notes") return "support";
      if (key === "form" || key === "stem") return typeof value === "string" || isObject(value) ? "lexical" : "auto";
      if (key === "after" || key === "before" || key === "when") return "condition";
      if (key === "notation") return "notation";
      return CODE_KEYS.has(key) ? "code" : "auto";
  }
};

/** Where text found in a record goes in search: the language being learned, or the support language. */
interface Collected {
  readonly target: TaggedText[];
  readonly support: TaggedText[];
  readonly ids: string[];
}

interface Tags {
  /** Text in an orthography of the course. */
  readonly orthography: (orthography: string) => Tag;
  /** Text in a support language. */
  readonly support: (language: string) => Tag;
  /** A lexical form: in the course's orthography whose script has its first letter. */
  readonly own: (value: string) => Tag;
  /** The orthography being learned: what a reading in an unknown scheme falls back to. */
  readonly learned: Tag;
}

const UNKNOWN: Tag = tagOf("und", "und");

/** Unicode's name for an ISO 15924 script a course is written in: the Han subsets are Han. */
const unicodeScript = (script: string): string => (script === "Hant" || script === "Hans" || script === "Hanb" ? "Hani" : script);

const scriptOf = (lang: string): string | undefined => {
  try {
    return new Intl.Locale(lang).maximize().script;
  } catch {
    return undefined;
  }
};

/** The tags of the course's texts: each orthography's as its texts have it, each support language's as its glosses have it. */
const tagsOf = (course: CourseView): Tags => {
  const byOrthography = new Map<string, Tag>();
  const bySupport = new Map<string, Tag>();
  const note = (t: TaggedText): void => {
    if (!byOrthography.has(t.orthography)) byOrthography.set(t.orthography, { lang: t.lang, orthography: t.orthography });
  };
  for (const lexeme of course.lexicon.lexemes) {
    for (const forms of Object.values(lexeme.forms ?? {})) for (const f of forms) note(f);
    for (const [key, gloss] of Object.entries(lexeme.gloss ?? {})) if (!bySupport.has(key)) bySupport.set(key, { lang: gloss.lang, orthography: gloss.orthography });
  }
  for (const unit of course.units) for (const s of unit.sentences) for (const f of Object.values(s.forms)) note(f.text);
  const learned = byOrthography.get(course.orthography) ?? tagOf(course.orthography.split("/")[0] ?? "und", course.orthography);
  const orthography = (id: string): Tag => byOrthography.get(id) ?? tagOf(id.split("/")[0] ?? "und", id);
  const support = (key: string): Tag => {
    const known = bySupport.get(key) ?? (key === course.supportKey ? tagOf(course.support.split("/")[0] ?? key, course.support) : undefined);
    if (known !== undefined) return known;
    const script = scriptOf(key);
    return script === undefined ? UNKNOWN : tagOf(`${key}-${script}`, `${key}-${script}/standard`);
  };
  // The course's orthographies, the one being learned first, each with a test for its script's letters.
  const homes = [learned, ...[...byOrthography.values()].filter((t) => t.orthography !== learned.orthography && t.orthography !== course.support)].flatMap((tag) => {
    const script = scriptOf(tag.lang);
    if (script === undefined) return [];
    try {
      return [{ tag, letters: new RegExp(`\\p{Script=${unicodeScript(script)}}`, "u") }];
    } catch {
      return [];
    }
  });
  const own = (value: string): Tag => {
    const letter = /\p{L}/u.exec(value)?.[0];
    return (letter === undefined ? undefined : homes.find((h) => h.letters.test(letter))?.tag) ?? learned;
  };
  return { orthography, support, own, learned };
};

/**
 * A stored value as a tree: every key, in the order it is written. `key` is the key the value is
 * under (an orthography under `spelled`, a scheme under `readings`, a language under `gloss`).
 */
const toNode = (value: unknown, mode: Mode, key: string, tags: Tags, into: Collected): DataNode => {
  if (value === null || value === undefined) return code(String(value));
  if (typeof value === "boolean" || typeof value === "number" || typeof value === "bigint") {
    into.ids.push(String(value));
    return code(String(value));
  }
  if (typeof value === "string") {
    // An empty form (an allomorph no orthography writes: the ezafe) is shown as code, quoted.
    if (value === "" || mode === "code") {
      into.ids.push(value);
      return code(value === "" ? '""' : value);
    }
    switch (mode) {
      case "support": {
        const t = tagged(tags.support(key), value);
        into.support.push(t);
        return text(t);
      }
      case "readings": {
        const t = readingAsText(key as SchemeId, value.normalize("NFC"), tags.learned);
        // Search reads a reading from a token's readings, with or without its tones.
        into.target.push({ ...t, tokens: [{ surface: value.normalize("NFC"), kind: "lexical", readings: { [key]: value.normalize("NFC") } }] });
        return text(t);
      }
      case "spelled": {
        const t = tagged(tags.orthography(key), value);
        into.target.push(t);
        return text(t);
      }
      case "reviewer": {
        const t = tagged(tags.support("en"), value);
        into.support.push(t);
        return text(t);
      }
      case "lexical":
      case "condition":
      case "notation": {
        const t = tagged(tags.own(value), value);
        into.target.push(t);
        return text(t);
      }
      default: {
        const t = tagged(UNKNOWN, value);
        into.support.push(t);
        return text(t);
      }
    }
  }
  if (Array.isArray(value)) return list(value.map((item) => toNode(item, mode, key, tags, into)));
  if (isTaggedText(value)) {
    (mode === "support" ? into.support : into.target).push(value);
    return text(value);
  }
  if (isObject(value)) {
    return record(
      Object.entries(value).map(([k, v]) => {
        into.ids.push(k);
        const child = childMode(mode, k, v);
        return { key: k, value: toNode(v, child, k, tags, into) };
      }),
    );
  }
  // Nothing a parsed file holds (a function, a symbol): named by its type.
  return code(typeof value);
};

const valueTags = (feats: UdFeatures | undefined): readonly string[] =>
  Object.keys(feats ?? {})
    .sort()
    .map((name) => `${name}=${(feats ?? {})[name] ?? ""}`);

const sourceTags = (entry: Readonly<Record<string, unknown>>): readonly string[] => [
  ...(typeof entry["pos"] === "string" ? [entry["pos"]] : []),
  ...valueTags(isObject(entry["feats"]) ? (entry["feats"] as UdFeatures) : undefined),
  ...valueTags(isObject(entry["realises"]) ? (entry["realises"] as UdFeatures) : undefined),
];

/** A bundle lexeme's features, each marked as its entry stores it or as a default gives it; unmarked without the entry. */
const markFeats = (node: DataNode, stored: UdFeatures | undefined): DataNode => {
  if (node.kind !== "record" || stored === undefined) return node;
  return record(
    node.fields.map((field) => {
      if (field.key !== "feats" || field.value.kind !== "record") return field;
      return { ...field, value: record(field.value.fields.map((f) => ({ ...f, note: stored[f.key] === (f.value.kind === "code" ? f.value.value : undefined) ? "stored" : "default" }))) };
    }),
  );
};

/** Old KC ids (courses/<id>/aliases.yaml) that became a part, by the part. */
const aliasesBy = (aliases: AliasTable | undefined): ReadonlyMap<string, readonly string[]> => {
  const out = new Map<string, Set<string>>();
  const add = (part: string, kc: string): void => {
    out.set(part, (out.get(part) ?? new Set<string>()).add(kc));
  };
  for (const [kc, alias] of Object.entries(aliases?.aliases ?? {})) {
    if (alias.part !== undefined) add(alias.part, kc);
    for (const parts of Object.values(alias.byItem ?? {})) for (const part of parts) add(part, kc);
    for (const part of alias.seeds ?? []) add(part, kc);
  }
  return new Map([...out].map(([part, kcs]) => [part, [...kcs].sort()]));
};

const NONE = {};
const built = new WeakMap<CourseView, WeakMap<object, WeakMap<object, LexiconData>>>();

/**
 * The lexicon laid out for browsing: every lexeme of the bundle in the order the course introduces
 * them (`lexemesInOrder`), then those only the lexicon's file has, by id. `source`: the lexicon's
 * own files, where the app has them; `aliases`: the bundle's alias table, where it is at hand.
 */
export const lexiconData = (course: CourseView, source?: LexiconSource, aliases?: AliasTable): LexiconData => {
  let bySource = built.get(course);
  if (bySource === undefined) {
    bySource = new WeakMap();
    built.set(course, bySource);
  }
  let byAliases = bySource.get(source ?? NONE);
  if (byAliases === undefined) {
    byAliases = new WeakMap();
    bySource.set(source ?? NONE, byAliases);
  }
  const cached = byAliases.get(aliases ?? NONE);
  if (cached !== undefined) return cached;

  const tags = tagsOf(course);
  const data = courseData(course);
  const units = unitIndexOf(course);
  const skills = skillsAsked(course);
  const oldIds = aliasesBy(aliases);
  const entries = new Map<string, Readonly<Record<string, unknown>>>();
  for (const entry of source?.lexemes.lexemes ?? []) if (typeof entry["id"] === "string") entries.set(entry["id"], entry);

  // The node that first introduces each lexeme, and how many sentences list it.
  const introducedBy = new Map<string, { readonly unit: string; readonly node: string }>();
  for (const unit of course.units) for (const node of unit.nodes) for (const id of node.introduces) if (!introducedBy.has(id)) introducedBy.set(id, { unit: unit.id, node: node.id });
  const listed = new Map<string, number>();
  for (const unit of course.units) for (const s of unit.sentences) for (const part of new Set(s.parts)) listed.set(part, (listed.get(part) ?? 0) + 1);
  const wordsById = new Map(data.words.map((w) => [w.lexeme.id, w]));
  const formsById = new Map(data.forms.map((f) => [f.id.id, f]));
  // The labels that name the forms a lexeme's tokens stand in.
  const labelsOf = new Map<string, { readonly id: string; readonly gloss: TaggedText | undefined }[]>();
  for (const f of data.forms) {
    if (f.tags[0] !== "form") continue;
    for (const c of f.carriers) {
      const labels = labelsOf.get(c.word) ?? [];
      labelsOf.set(c.word, labels);
      if (!labels.some((l) => l.id === f.id.id)) labels.push({ id: f.id.id, gloss: f.gloss });
    }
  }
  const idOf = (id: string): EntryId => wordsById.get(id)?.id ?? formsById.get(id)?.id ?? { id };

  const rowOf = (id: string, lexeme: BundleLexeme | undefined): LexemeRow => {
    const into: Collected = { target: [], support: [], ids: [id] };
    const entry = entries.get(id);
    const sourceNode = entry === undefined ? undefined : toNode(entry, "auto", id, tags, into);
    const storedFeats = entry !== undefined && isObject(entry["feats"]) ? (entry["feats"] as UdFeatures) : undefined;
    const bundleNode = lexeme === undefined ? undefined : markFeats(toNode(lexeme, "auto", id, tags, into), entry === undefined ? undefined : (storedFeats ?? {}));
    const bound = lexeme === undefined ? !isObject(entry?.["spelled"]) : isBound(lexeme);
    const word = wordsById.get(id);
    const at = introducedBy.get(id);
    const clip = course.audio[id];
    const fields: DataField[] = [
      { key: "unit", value: code(at?.unit ?? "-") },
      { key: "node", value: code(at?.node ?? "-") },
      { key: "sentences", value: code(String(listed.get(id) ?? 0)) },
      { key: "bound", value: code(String(bound)) },
      { key: "skills", value: list(skills(id).map((s) => code(s))) },
      {
        key: "labels",
        value: list((labelsOf.get(id) ?? []).map((l) => record([{ key: "id", value: code(l.id) }, ...(l.gloss === undefined ? [] : [{ key: "gloss", value: text(l.gloss) }])]))),
      },
      ...(clip === undefined ? [] : [{ key: "clip", value: toNode(clip, "code", "clip", tags, { target: [], support: [], ids: [] }) }]),
      ...(aliases === undefined ? [] : [{ key: "aliases", value: list((oldIds.get(id) ?? []).map((kc) => code(kc))) }]),
    ];
    for (const f of fields) {
      into.ids.push(f.key);
      if (f.value.kind === "code") into.ids.push(f.value.value);
      if (f.value.kind === "list") for (const item of f.value.items) if (item.kind === "code") into.ids.push(item.value);
    }
    const rowTags = [...(lexeme === undefined ? (entry === undefined ? [] : sourceTags(entry)) : [...(lexeme.pos === undefined ? [] : [lexeme.pos as string]), ...valueTags(lexeme.feats), ...valueTags(lexeme.realises)]), ...(bound ? ["bound"] : [])];
    into.ids.push(...rowTags);
    const firstSpelling = (): TaggedText | undefined => {
      const spelled = entry?.["spelled"];
      const first = isObject(spelled) ? spelled[course.orthography] : undefined;
      return Array.isArray(first) && typeof first[0] === "string" ? tagged(tags.orthography(course.orthography), first[0]) : undefined;
    };
    const sourceGloss = (): TaggedText | undefined => {
      const gloss = entry?.["gloss"];
      const g = isObject(gloss) ? gloss[course.supportKey] : undefined;
      return typeof g === "string" ? tagged(tags.support(course.supportKey), g) : undefined;
    };
    return {
      id: idOf(id),
      lexeme,
      bound,
      tags: rowTags,
      unit: units.get(id) ?? course.units.length,
      form: lexeme === undefined ? firstSpelling() : lexeme.forms?.[course.orthography]?.[0],
      gloss: lexeme === undefined ? sourceGloss() : lexeme.gloss?.[course.supportKey],
      source: sourceNode,
      bundle: bundleNode,
      course: record(fields),
      written: word?.written ?? [],
      carriers: bound ? (formsById.get(id)?.carriers ?? []) : [],
      image: lexeme?.image,
      searched: { target: into.target, support: into.support, ids: [...new Set(into.ids)] },
    };
  };

  const inBundle = new Set(course.lexicon.lexemes.map((l) => l.id));
  const rows = [...lexemesInOrder(course).map((l) => rowOf(l.id, l)), ...[...entries.keys()].filter((id) => !inBundle.has(id)).sort().map((id) => rowOf(id, undefined))];

  const scratch: Collected = { target: [], support: [], ids: [] };
  let file: DataNode | undefined;
  if (source !== undefined) {
    const { lexemes: _lexemes, ...head } = source.lexemes;
    file = toNode(head, "auto", "lexicon", tags, scratch);
  }
  const { lexemes: _bundleLexemes, ...bundleLanguage } = course.lexicon;
  const language = source?.language === undefined ? toNode(bundleLanguage, "auto", "language", tags, scratch) : toNode(source.language, "auto", "language", tags, scratch);
  const out: LexiconData = { lexemes: rows, source: source !== undefined, file, language };
  byAliases.set(aliases ?? NONE, out);
  return out;
};
