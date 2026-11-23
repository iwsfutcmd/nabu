/**
 * A course as the player sees it: the bundle's units plus compiled profiles,
 * for one taught orthography and one support language. Assembling it is pure;
 * the shell fetches the files (gameplan §7.5 stage 9) and passes them in.
 */
import type { BundleAudio, BundleAudioItem, BundleClip, BundleFile, BundleGrapheme, BundleLabel, BundleLexeme, BundleLexicon, BundleManifest, BundleRule, BundleSentence, BundleUnit, CourseNames, DataTable, Facet, KeyboardLayout, OrthographyProfile, PartId, PlacementPolicy, SchemeId, TaggedText, Token, UdFeatures } from "@nabu/schema";
import { keyboardDistance, type WordForm } from "../match/compare.ts";
import { compileAcceptSet, grade, lexiconKey, type CompiledAcceptSet, type Grade, type LexemeForm } from "../match/grade.ts";
import { compileProfile, type CompiledProfile } from "../profile/compile.ts";
import { err, ok, type Result } from "../result.ts";
import { graphemes } from "../text/graphemes.ts";
import { surfaceOf } from "../text/tagged-text.ts";
import { baseOf, effectiveFeats, formKey, kindOf, lexemeFormKey, lexemesOf, nodeOf } from "./lexemes.ts";
import { paradigmWords } from "./paradigms.ts";

export interface CourseView {
  readonly id: string;
  /** The course's target language (BCP 47). */
  readonly target?: string | undefined;
  /** What the app calls the course and its orthographies, by language (ADR 0109). */
  readonly names?: CourseNames | undefined;
  readonly units: readonly BundleUnit[];
  /**
   * The lexicon of the course's language, as far as the course uses it (ADR 0145): its lexemes in
   * one flat list, what the language calls its forms, and its rules. No entry names a unit: the
   * units' nodes point at it.
   */
  readonly lexicon: BundleLexicon;
  /** The orthography the learner chose (one of the course's). */
  readonly orthography: string;
  /** The support orthography (en-Latn/standard) and its translation key (en). */
  readonly support: string;
  readonly supportKey: string;
  readonly profiles: ReadonlyMap<string, CompiledProfile>;
  /** Playable clips by sentence, lexeme or letter id (gameplan §10); empty for a course without audio. */
  readonly audio: Readonly<Record<string, BundleAudioItem>>;
  /**
   * The facets the course practises (ADR 0071), where it names them; undefined: all of them.
   * Classical Chinese practises recognize and produce only: it is never spoken or heard, and its
   * readings are shown, never drilled.
   */
  readonly facets?: readonly Facet[] | undefined;
  /**
   * How far learners may rely on the course's clips, where it is not good (ADR 0091). An iffy voice
   * plays only where the learner has the text: no exercise whose prompt is a clip is planned.
   */
  readonly audioQuality?: "iffy" | undefined;
  /** How the placement test probes, where the course says (ADR 0077). */
  readonly placement?: PlacementPolicy | undefined;
  /** The course asks words by their parts (ADR 0152): `parts-whole` and `whole-parts` are planned. */
  readonly wordParts?: true | undefined;
  /** The registers the course's sentences are in where they say nothing else (ADR 0147): apc is colloquial throughout. */
  readonly registers?: readonly string[] | undefined;
}

/** Bundle files that stay URLs (pictures, audio); every other file is JSON the course needs. */
export const MEDIA_ROLES: ReadonlySet<string> = new Set(["image", "audio"]);

/** The files every device that opens the course needs, what it is assembled from: all its manifest lists but media. */
export const coreFiles = (manifest: BundleManifest): readonly BundleFile[] => manifest.files.filter((f) => !MEDIA_ROLES.has(f.role));

/**
 * A course from its bundle, each file read by `read`: a bundle path ("manifest.json", or a path the
 * manifest lists) to its parsed JSON. The one loader of bundles from disk (tests, the API, the
 * landing page); core does no I/O itself, so the caller reads.
 */
export const readCourse = (read: (path: string) => unknown, numberingSystems: Readonly<Record<string, string>>, orthography?: string): Result<CourseView, CourseError> => {
  const manifest = read("manifest.json") as BundleManifest;
  const files = new Map(coreFiles(manifest).map((f) => [f.path, read(f.path)] as const));
  return assembleCourse({ manifest, files, numberingSystems }, orthography);
};

export interface CourseFiles {
  readonly manifest: BundleManifest;
  /** Parsed JSON of every file the manifest lists, by bundle path (media excluded: MEDIA_ROLES). */
  readonly files: ReadonlyMap<string, unknown>;
  /** CLDR numbering systems (packages/i18n generated). */
  readonly numberingSystems: Readonly<Record<string, string>>;
}

/**
 * The bundle format this build reads (the manifest's `formatVersion`): 5, format 4 with the lexicon's
 * `cells` and `principalParts` and each lexeme's `paradigm` and `regularised` (docs/rules-design.md,
 * stage 4: the compiler lists a lexeme's forms, the device looks them up). 4 was format 3 with the profiles'
 * and schemes' statements in place of `soundAlike` and `variants` and each lexeme's `leftovers` (ADR
 * 0148); 3 was format 2 (lexemes where a bundle had KCs, ADR 0145) with the token kind `lexical` where
 * it was `word`. A bundle of another
 * format is refused whole: one a device kept from before is fetched again, and one from a later
 * build asks for the app to be updated.
 */
export const BUNDLE_FORMAT = 5;

export type CourseError =
  | { readonly code: "format"; readonly version: unknown }
  | { readonly code: "missing-file"; readonly path: string }
  | { readonly code: "unknown-orthography"; readonly orthography: string }
  | { readonly code: "profile"; readonly orthography: string; readonly detail: string };

/** The orthography id a support language key resolves to ("en" → "en-Latn/standard"). */
const supportKeyOf = (orthography: string): string => orthography.split("-")[0] as string;

/** The word (and number) tokens of a text, by index: what clip timings point at. */
const wordTokens = (text: TaggedText): readonly number[] =>
  text.tokens.flatMap((t, i) => (t.kind === "lexical" || t.kind === "number" ? [i] : []));

/** Each audio item's text in every orthography: sentences, story lines (`story#step`), and lexemes and letters as they are cited. */
const itemTexts = (units: readonly BundleUnit[], lexicon: BundleLexicon): ReadonlyMap<string, Readonly<Record<string, TaggedText>>> => {
  const out = new Map<string, Readonly<Record<string, TaggedText>>>();
  const cited = (entry: BundleLexeme | BundleGrapheme): void => {
    const forms = Object.entries(entry.forms ?? {}).flatMap(([o, fs]) => (fs[0] === undefined ? [] : [[o, fs[0]] as const]));
    out.set(entry.id, Object.fromEntries(forms));
  };
  for (const lexeme of lexicon.lexemes) cited(lexeme);
  for (const unit of units) {
    for (const s of unit.sentences) out.set(s.id, Object.fromEntries(Object.entries(s.forms).map(([o, f]) => [o, f.text])));
    for (const story of unit.stories ?? []) {
      story.steps.forEach((step, i) => {
        if ("line" in step && step.line !== undefined) out.set(`${story.id}#${String(i)}`, step.line.forms);
      });
    }
    for (const letter of unit.graphemes ?? []) cited(letter);
  }
  return out;
};

/**
 * A clip's timings for another orthography of its course (ADR 0126): each moves to the same word,
 * counted in order, of that orthography's text. Where the words do not line up one to one, the
 * clip keeps no timings: no highlight rather than the wrong word.
 */
const retime = (clip: BundleClip, texts: Readonly<Record<string, TaggedText>> | undefined, to: string): BundleClip => {
  if (clip.timings === undefined || clip.orthography === undefined || clip.orthography === to) return clip;
  const { timings, orthography, ...rest } = clip;
  const from = texts?.[orthography];
  const into = texts?.[to];
  if (from === undefined || into === undefined) return rest;
  const a = wordTokens(from);
  const b = wordTokens(into);
  if (a.length !== b.length) return rest;
  const ordinal = new Map(a.map((token, k) => [token, k]));
  const moved = timings.map((t) => {
    const k = ordinal.get(t.token);
    const token = k === undefined ? undefined : b[k];
    return token === undefined ? undefined : { ...t, token };
  });
  return moved.every((t) => t !== undefined) ? { ...rest, orthography: to, timings: moved } : rest;
};

/** The course's clips with their timings in the chosen orthography. */
export const audioFor = (
  audio: Readonly<Record<string, BundleAudioItem>>,
  units: readonly BundleUnit[],
  lexicon: BundleLexicon,
  orthography: string,
): Readonly<Record<string, BundleAudioItem>> => {
  const texts = itemTexts(units, lexicon);
  return Object.fromEntries(
    Object.entries(audio).map(([item, a]) => {
      const t = texts.get(item);
      return [item, { normal: retime(a.normal, t, orthography), ...(a.slow === undefined ? {} : { slow: retime(a.slow, t, orthography) }) }];
    }),
  );
};

export const assembleCourse = (bundle: CourseFiles, orthography?: string): Result<CourseView, CourseError> => {
  const { manifest, files } = bundle;
  const version: unknown = manifest.formatVersion;
  if (version !== BUNDLE_FORMAT) return err({ code: "format", version });
  const chosen: string = orthography ?? manifest.orthographies[0] ?? "";
  if (!(manifest.orthographies as readonly string[]).includes(chosen)) return err({ code: "unknown-orthography", orthography: chosen });
  const read = (role: string): unknown[] => manifest.files.filter((f) => f.role === role).map((f) => files.get(f.path));
  for (const f of manifest.files) {
    if (!MEDIA_ROLES.has(f.role) && !files.has(f.path)) return err({ code: "missing-file", path: f.path });
  }
  const tables = Object.fromEntries((read("table") as DataTable[]).map((t) => [t.id, t]));
  const keyboards = Object.fromEntries((read("keyboard") as KeyboardLayout[]).map((k) => [k.id, k]));
  const profiles = new Map<string, CompiledProfile>();
  for (const raw of read("profile") as OrthographyProfile[]) {
    const compiled = compileProfile(raw, { numberingSystems: bundle.numberingSystems, tables, keyboards });
    if (!compiled.ok) return err({ code: "profile", orthography: raw.id, detail: JSON.stringify(compiled.error) });
    profiles.set(raw.id, compiled.value);
  }
  const support = manifest.support[0] as string;
  const units = manifest.units.map((u) => files.get(u.file) as BundleUnit);
  const lexicon = (read("lexicon")[0] as BundleLexicon | undefined) ?? { language: manifest.lexicon, lexemes: [] };
  const audio = audioFor((read("audio-index")[0] as BundleAudio | undefined)?.items ?? {}, units, lexicon, chosen);
  return ok({
    id: manifest.course,
    target: manifest.target,
    ...(manifest.names === undefined ? {} : { names: manifest.names }),
    units,
    lexicon,
    orthography: chosen,
    support,
    supportKey: supportKeyOf(support),
    profiles,
    audio,
    ...(manifest.facets === undefined ? {} : { facets: manifest.facets }),
    ...(manifest.audioQuality === undefined ? {} : { audioQuality: manifest.audioQuality }),
    ...(manifest.placement === undefined ? {} : { placement: manifest.placement }),
    ...(manifest.wordParts === true ? { wordParts: true as const } : {}),
    ...(manifest.registers === undefined ? {} : { registers: manifest.registers }),
  });
};

export const profileOf = (course: CourseView, orthography: string): CompiledProfile => {
  const profile = course.profiles.get(orthography);
  if (profile === undefined) throw new Error(`no profile ${orthography} in course ${course.id}`);
  return profile;
};

const sentenceLists = new WeakMap<CourseView, readonly BundleSentence[]>();

/** Every sentence of the course, in course order (built once per course: planning asks per exercise). */
export const allSentences = (course: CourseView): readonly BundleSentence[] => {
  let list = sentenceLists.get(course);
  if (list === undefined) {
    list = course.units.flatMap((u) => u.sentences);
    sentenceLists.set(course, list);
  }
  return list;
};

/** Every lexeme the course uses, as its lexicon lists them (sorted by id: a lexicon has no course order). */
export const allLexemes = (course: CourseView): readonly BundleLexeme[] => course.lexicon.lexemes;

const lexemeMaps = new WeakMap<BundleLexicon, ReadonlyMap<string, BundleLexeme>>();

/** The course's lexemes by id (built once per lexicon). */
export const lexemesById = (course: CourseView): ReadonlyMap<string, BundleLexeme> => {
  let map = lexemeMaps.get(course.lexicon);
  if (map === undefined) {
    map = new Map(course.lexicon.lexemes.map((l) => [l.id, l]));
    lexemeMaps.set(course.lexicon, map);
  }
  return map;
};

/** A lexeme of the course by its id (lexeme:casa), or by a part of it (lexeme:mano|Gender). */
export const lexemeOf = (course: CourseView, part: string): BundleLexeme | undefined => lexemesById(course).get(nodeOf(part));

const graphemeMaps = new WeakMap<readonly BundleUnit[], ReadonlyMap<string, BundleGrapheme>>();

/** The letters the course's script tracks teach, by id, in course order. */
export const graphemesById = (course: CourseView): ReadonlyMap<string, BundleGrapheme> => {
  let map = graphemeMaps.get(course.units);
  if (map === undefined) {
    map = new Map(course.units.flatMap((u) => (u.graphemes ?? []).map((g) => [g.id, g] as const)));
    graphemeMaps.set(course.units, map);
  }
  return map;
};

/** The lexeme or letter a card is about, by its id: what has spellings and a gloss of its own. */
export const entryOf = (course: CourseView, id: string): BundleLexeme | BundleGrapheme | undefined =>
  kindOf(id) === "grapheme" ? graphemesById(course).get(id) : lexemeOf(course, id);

const orderMaps = new WeakMap<readonly BundleUnit[], ReadonlyMap<string, number>>();

/**
 * Where the course first teaches each lexeme, feature value, rule and letter: the index, among all
 * its nodes in course order, of the first node that introduces it. The lexicon is flat (it is
 * sorted by id), so anything that follows the course's order reads it here.
 */
export const introducedAt = (course: CourseView): ReadonlyMap<string, number> => {
  let map = orderMaps.get(course.units);
  if (map === undefined) {
    const built = new Map<string, number>();
    let position = 0;
    for (const unit of course.units) {
      for (const node of unit.nodes) {
        for (const id of node.introduces) if (!built.has(id)) built.set(id, position);
        position += 1;
      }
    }
    map = built;
    orderMaps.set(course.units, map);
  }
  return map;
};

const unitMaps = new WeakMap<readonly BundleUnit[], ReadonlyMap<string, number>>();

/** The index of the unit whose node first introduces each lexeme, feature value, rule and letter. */
export const unitIndexOf = (course: CourseView): ReadonlyMap<string, number> => {
  let map = unitMaps.get(course.units);
  if (map === undefined) {
    const built = new Map<string, number>();
    course.units.forEach((unit, i) => {
      for (const node of unit.nodes) for (const id of node.introduces) if (!built.has(id)) built.set(id, i);
    });
    map = built;
    unitMaps.set(course.units, map);
  }
  return map;
};

/** The lexemes a unit's nodes are the first to introduce, in the order they do: the unit's own words. */
export const lexemesOfUnit = (course: CourseView, unit: BundleUnit): readonly BundleLexeme[] => {
  const at = course.units.indexOf(unit);
  const units = unitIndexOf(course);
  const lexemes = lexemesById(course);
  const seen = new Set<string>();
  const out: BundleLexeme[] = [];
  for (const node of unit.nodes) {
    for (const id of node.introduces) {
      const lexeme = lexemes.get(id);
      if (lexeme === undefined || seen.has(id) || units.get(id) !== at) continue;
      seen.add(id);
      out.push(lexeme);
    }
  }
  return out;
};

const lexemeOrders = new WeakMap<readonly BundleUnit[], WeakMap<BundleLexicon, readonly BundleLexeme[]>>();

/**
 * The course's lexemes in the order it teaches them (each at the first node that introduces it;
 * those no node introduces after them, by id): what picks among lexemes in course order reads.
 */
export const lexemesInOrder = (course: CourseView): readonly BundleLexeme[] => {
  let byLexicon = lexemeOrders.get(course.units);
  if (byLexicon === undefined) {
    byLexicon = new WeakMap();
    lexemeOrders.set(course.units, byLexicon);
  }
  let list = byLexicon.get(course.lexicon);
  if (list === undefined) {
    const taught: BundleLexeme[] = [];
    const seen = new Set<string>();
    for (const unit of course.units) {
      for (const node of unit.nodes) {
        for (const id of node.introduces) {
          const lexeme = lexemesById(course).get(id);
          if (lexeme !== undefined && !seen.has(id)) {
            seen.add(id);
            taught.push(lexeme);
          }
        }
      }
    }
    list = [...taught, ...course.lexicon.lexemes.filter((l) => !seen.has(l.id))];
    byLexicon.set(course.lexicon, list);
  }
  return list;
};

/**
 * What the language calls a form (schemas/language.schema.json `labels`: "present tense: I"), for
 * a lexeme of a part of speech: the most specific label whose values the form has, one for its
 * part of speech before one for any, the first listed where two say as much. `feats`: every value
 * the form has (those chosen on its token and its lexeme's own).
 */
export const labelOf = (course: CourseView, feats: UdFeatures, pos?: string): BundleLabel | undefined => {
  let best: BundleLabel | undefined;
  let size = -1;
  for (const label of course.lexicon.labels ?? []) {
    if (label.pos !== undefined && label.pos !== pos) continue;
    const names = Object.keys(label.feats);
    if (names.some((name) => feats[name] !== label.feats[name])) continue;
    if (names.length > size || (names.length === size && label.pos !== undefined && best?.pos === undefined)) {
      best = label;
      size = names.length;
    }
  }
  return best;
};

/** A rule the language names (rule:copula-drop), with what the course says of it. */
export const ruleOf = (course: CourseView, id: string): BundleRule | undefined => (course.lexicon.rules ?? []).find((r) => r.id === id);

/** What a part is called in the support language, where the course says: a lexeme's or a rule's gloss, a feature value's label. */
export const glossOfPart = (course: CourseView, part: PartId): TaggedText | undefined => {
  const node = nodeOf(part);
  switch (kindOf(node)) {
    case "lexeme":
      return lexemeOf(course, node)?.gloss?.[course.supportKey];
    case "grapheme":
      return graphemesById(course).get(node)?.gloss?.[course.supportKey];
    case "rule":
      return ruleOf(course, node)?.gloss?.[course.supportKey];
    case "feature": {
      const [name, value] = node.slice("feature:".length).split("=");
      return name === undefined || value === undefined ? undefined : labelOf(course, { [name]: value })?.gloss[course.supportKey];
    }
  }
};

/**
 * What a lexeme's own feature is called (ADR 0146: `lexeme:mano|Gender`, a part of the lexeme no
 * default gives): the language's label (`labelOf`, for the lexeme's part of speech) for its lemma's
 * form, the part of speech's `bare` cell with the lexeme's own value in it (mano: feminine
 * singular, "feminine"), in the support language. Undefined for anything else, or where the
 * language labels no such form (a masculine noun's is the bare cell itself, which no label names).
 */
export const ownFeatureLabel = (course: CourseView, part: PartId): TaggedText | undefined => {
  const bar = part.indexOf("|");
  if (bar < 0) return undefined;
  const lexeme = lexemeOf(course, part.slice(0, bar));
  const name = part.slice(bar + 1);
  const value = lexeme?.feats?.[name];
  if (lexeme === undefined || value === undefined) return undefined;
  const cell = lexeme.pos === undefined ? undefined : course.lexicon.bare?.[lexeme.pos];
  return labelOf(course, { ...cell, [name]: value }, lexeme.pos)?.gloss[course.supportKey];
};

/** Grades answers against accept sets with the course's compiled profiles (§8.3). */
export interface Grader {
  readonly grade: (orthography: string, accept: string, answer: string) => Grade;
}

/**
 * Every text the course writes in an orthography: its lexemes and letters as
 * they are cited, its sentences, and its story lines. Since a lexeme is cited by
 * its lemma (ADR 0061), the inflected words a learner types (talabasan, kitobing,
 * وأنا) are only found in the sentences and stories that use them.
 */
const textsOf = function* (course: CourseView, orthography: string): Generator<TaggedText> {
  for (const lexeme of allLexemes(course)) yield* lexeme.forms?.[orthography] ?? [];
  for (const letter of graphemesById(course).values()) yield* letter.forms?.[orthography] ?? [];
  for (const s of allSentences(course)) {
    const form = s.forms[orthography];
    if (form !== undefined) yield form.text;
  }
  for (const u of course.units) {
    for (const story of u.stories ?? []) {
      for (const step of story.steps) {
        const line = step.line?.forms[orthography];
        if (line !== undefined) yield line;
      }
    }
  }
};

/** What grading looks a typed word up in, for one orthography of a course: everything the course spells there. */
export interface Spellings {
  /** Every word the course writes in it, as `lexiconKey` has it: a typo landing on one is WRONG_WORD (erratum 46). */
  readonly words: ReadonlySet<string>;
  /**
   * The words the course inflects (ADR 0081): every token of a lexeme that some token writes
   * outside its bare cell (`marked`), so a masculine adjective counts with its feminine, a bare
   * past verb with its b- present.
   */
  readonly inflected: ReadonlySet<string>;
  /**
   * The forms each word stands in, those of the tokens spelled so, for contrasts limited to some
   * (ADR 0084): a verb's infinitive is no perfect, whatever else its lexeme is written as.
   */
  readonly forms: ReadonlyMap<string, readonly WordForm[]>;
  /**
   * Whose form each word is (ADR 0148: decided by lexeme, never by string): every lexeme a token of
   * one unit spelled so writes, with the token's form key (`formKey`), and each lexicon lemma with
   * its own id as its form.
   */
  readonly lexemes: ReadonlyMap<string, readonly LexemeForm[]>;
  /**
   * Where the profile's sound is a pinned reading (`sound: {from: reading}`): the readings tokens
   * spelled so pin in its scheme, each once.
   */
  readonly readings: ReadonlyMap<string, readonly string[]>;
}

/**
 * Whether a token shows a form of its lexeme: it stands outside the cell its part of speech is
 * cited in (the lexicon's `bare`: a noun's singular, an adjective's masculine singular), by a value
 * chosen on it or one its lexeme has of itself. Where the language names no such cell for the part
 * of speech, any value chosen on the token is a form.
 */
export const marked = (lexicon: BundleLexicon, token: Token, lexeme: BundleLexeme | undefined): boolean => {
  const base = baseOf(token);
  if (base === undefined) return false;
  const chosen = base.feats ?? {};
  const cell = lexeme?.pos === undefined ? undefined : lexicon.bare?.[lexeme.pos];
  if (cell === undefined) return Object.keys(chosen).length > 0;
  return Object.entries(effectiveFeats(token, lexeme)).some(([name, value]) => (name in cell || name in chosen) && cell[name] !== value);
};

interface OwnWord {
  readonly key: string;
  readonly letters: readonly string[];
  readonly inflected: boolean;
}

const formId = (form: WordForm): string =>
  `${form.pos ?? ""}|${Object.keys(form.feats)
    .sort()
    .map((name) => `${name}=${form.feats[name] ?? ""}`)
    .join(";")}`;

const buildSpellings = (course: CourseView, orthography: string): Spellings => {
  const profile = profileOf(course, orthography);
  const texts = [...textsOf(course, orthography)];
  // Words recur across the course's texts and accept sets: each is keyed and split once.
  const unitKeys = new Map<string, string>();
  const keyOf = (unit: string): string => {
    let k = unitKeys.get(unit);
    if (k === undefined) {
      k = lexiconKey(profile, unit);
      unitKeys.set(unit, k);
    }
    return k;
  };
  const textKeys = new Map<string, readonly string[]>();
  const keys = (text: string): readonly string[] => {
    let ks = textKeys.get(text);
    if (ks === undefined) {
      ks = profile.units(profile.normalize(text)).map(keyOf);
      textKeys.set(text, ks);
    }
    return ks;
  };
  const letterLists = new Map<string, readonly string[]>();
  const lettersOf = (k: string): readonly string[] => {
    let letters = letterLists.get(k);
    if (letters === undefined) {
      letters = graphemes(k);
      letterLists.set(k, letters);
    }
    return letters;
  };

  const words = new Set<string>();
  for (const text of texts) for (const unit of profile.units(profile.normalize(surfaceOf(text)))) words.add(keyOf(unit));

  const lexemes = lexemesById(course);
  const entryOfToken = (t: Token): BundleLexeme | undefined => lexemes.get(baseOf(t)?.lexeme ?? "");
  const tokens = texts.flatMap((text) => text.tokens.filter((t) => t.kind === "lexical" && baseOf(t) !== undefined));
  // The lexemes the course inflects: those a token writes outside the cell they are cited in.
  const inflecting = new Set(tokens.filter((t) => marked(course.lexicon, t, entryOfToken(t))).map((t) => baseOf(t)?.lexeme));
  const inflected = new Set<string>();
  const forms = new Map<string, Map<string, WordForm>>();
  const pin = (k: string, these: Iterable<WordForm>): void => {
    const all = forms.get(k) ?? new Map<string, WordForm>();
    for (const f of these) all.set(formId(f), f);
    forms.set(k, all);
  };
  for (const t of tokens) {
    const lexeme = entryOfToken(t);
    const form: WordForm = { ...(lexeme?.pos !== undefined && { pos: lexeme.pos }), feats: effectiveFeats(t, lexeme) };
    for (const k of keys(t.surface)) {
      if (inflecting.has(baseOf(t)?.lexeme)) inflected.add(k);
      pin(k, [form]);
    }
  }
  // A sentence's accept set spells its words other ways too (be2ra beside b2ra): each of those
  // words counts as inflected when the nearest word of the sentence is, with its forms. Each word
  // of the set is looked at once (an accept set repeats its words in every order it lists), and a
  // word the sentence itself has is its own nearest.
  for (const s of allSentences(course)) {
    const form = s.forms[orthography];
    if (form?.reverse === undefined) continue;
    // The sentence's words, the first of each: a repeated word is never nearer than its first.
    const own: OwnWord[] = [];
    const ownByKey = new Map<string, OwnWord>();
    for (const t of form.text.tokens) {
      const base = baseOf(t);
      if (t.kind !== "lexical" || base === undefined) continue;
      for (const key of keys(t.surface)) {
        if (ownByKey.has(key)) continue;
        const word: OwnWord = { key, letters: lettersOf(key), inflected: inflecting.has(base.lexeme) };
        own.push(word);
        ownByKey.set(key, word);
      }
    }
    if (!own.some((w) => w.inflected)) continue;
    const seen = new Set<string>();
    for (const piece of form.reverse.split(/[\s()|[\]]+/u)) {
      for (const k of keys(piece)) {
        if (seen.has(k)) continue;
        seen.add(k);
        let nearest = ownByKey.get(k);
        let best = 0;
        if (nearest === undefined) {
          const letters = lettersOf(k);
          best = Infinity;
          for (const w of own) {
            const d = keyboardDistance(letters, w.letters, () => false);
            if (d < best) [nearest, best] = [w, d];
          }
        }
        if (nearest?.inflected === true && best <= Math.max(1, nearest.letters.length / 2)) {
          inflected.add(k);
          pin(k, forms.get(nearest.key)?.values() ?? []);
        }
      }
    }
  }
  // Whose form each word is: the lexemes of the tokens that are one unit of it (a Han token of
  // several characters says nothing of each), and each lemma as the lexicon cites it.
  const lexemeForms = new Map<string, Map<string, LexemeForm>>();
  const write = (k: string, these: readonly LexemeForm[]): void => {
    const all = lexemeForms.get(k) ?? new Map<string, LexemeForm>();
    for (const f of these) all.set(`${f.lexeme}\u0000${f.form}\u0000${f.unwritten ?? ""}`, f);
    lexemeForms.set(k, all);
  };
  const scheme = profile.projection?.from === "reading" ? profile.projection.scheme : undefined;
  const readings = new Map<string, Set<string>>();
  for (const text of texts) {
    for (const t of text.tokens) {
      if (t.kind !== "lexical") continue;
      const ks = keys(t.surface);
      if (ks.length !== 1) continue;
      const k = ks[0] as string;
      const fk = formKey(t);
      const unwritten = lexemesOf(t)
        .filter((l) => l.surface === "")
        .map((l) => l.lexeme)
        .sort()
        .join("+");
      if (fk !== undefined) write(k, lexemesOf(t).map((l) => ({ lexeme: l.lexeme, form: fk, ...(unwritten !== "" && { unwritten }) })));
      const reading = scheme === undefined ? undefined : t.readings?.[scheme as SchemeId];
      if (reading !== undefined) readings.set(k, (readings.get(k) ?? new Set<string>()).add(reading.normalize("NFC")));
    }
  }
  for (const lexeme of allLexemes(course)) {
    for (const cited of lexeme.forms?.[orthography] ?? []) {
      const ks = keys(surfaceOf(cited));
      if (ks.length === 1) write(ks[0] as string, [{ lexeme: lexeme.id, form: lexemeFormKey(lexeme.id) }]);
    }
  }
  // Every form the lexicon's paradigms list (docs/rules-design.md, stage 4), each known as a token
  // that writes it in its cell would be: a word of the course, standing in that form, its lexeme's.
  for (const p of paradigmWords(course.lexicon, orthography, keys)) {
    words.add(p.key);
    pin(p.key, [p.form]);
    if (inflecting.has(p.lexeme)) inflected.add(p.key);
    write(p.key, [p.written]);
  }
  return {
    words,
    inflected,
    forms: new Map([...forms].map(([k, fs]) => [k, [...fs.keys()].sort().map((id) => fs.get(id) as WordForm)])),
    lexemes: new Map([...lexemeForms].map(([k, fs]) => [k, [...fs.values()]])),
    readings: new Map([...readings].map(([k, rs]) => [k, [...rs]])),
  };
};

/**
 * Each course's lexicons by orthography, built once, whatever the number of graders: every session
 * makes one. They are kept with the course's units, which a copy of the course that changes only
 * its media (restrictMedia) shares, and rebuilt only for another profile.
 */
const spellings = new WeakMap<readonly BundleUnit[], Map<string, { readonly profile: CompiledProfile; readonly spellings: Spellings }>>();

/** What a course spells in an orthography, for grading (exported for tests). */
export const spellingsIn = (course: CourseView, orthography: string): Spellings => {
  let byOrthography = spellings.get(course.units);
  if (byOrthography === undefined) {
    byOrthography = new Map();
    spellings.set(course.units, byOrthography);
  }
  const profile = profileOf(course, orthography);
  const built = byOrthography.get(orthography);
  if (built !== undefined && built.profile === profile) return built.spellings;
  const made = buildSpellings(course, orthography);
  byOrthography.set(orthography, { profile, spellings: made });
  return made;
};

/**
 * Builds what grading looks words up in (the course's orthography and its support
 * language's), which the first typed or tiled answer would otherwise wait for: each session makes
 * a grader, and a course of thirty units takes a moment. An app calls it while the learner reads.
 */
export const prepareGrading = (course: CourseView): void => {
  for (const orthography of [course.orthography, course.support]) if (course.profiles.has(orthography)) spellingsIn(course, orthography);
};

/**
 * A grader that knows what the course spells in each orthography (every word it
 * writes there, normalized and case-folded as grade() compares units) so that a
 * typo landing on a real word is WRONG_WORD (erratum 46). The spellings are the
 * course's (built once per course); compiled accept sets are memoized per grader;
 * grading itself stays pure.
 */
export const createGrader = (course: CourseView): Grader => {
  const sets = new Map<string, CompiledAcceptSet>();
  return {
    grade: (orthography, accept, answer) => {
      const key = `${orthography}\u0000${accept}`;
      let set = sets.get(key);
      if (set === undefined) {
        const compiled = compileAcceptSet(accept, profileOf(course, orthography));
        if (!compiled.ok) throw new Error(`accept set does not parse: ${JSON.stringify(compiled.error)}`);
        set = compiled.value;
        sets.set(key, set);
      }
      const { words, inflected, forms, lexemes, readings } = spellingsIn(course, orthography);
      return grade(set, answer, { lexicon: words, inflected, forms, lexemes, readings });
    },
  };
};
