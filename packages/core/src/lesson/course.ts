/**
 * A course as the player sees it: the bundle's units plus compiled profiles,
 * for one taught orthography and one support language. Assembling it is pure;
 * the shell fetches the files (gameplan §7.5 stage 9) and passes them in.
 */
import type { BundleAudio, BundleAudioItem, BundleClip, BundleFile, BundleKc, BundleManifest, BundleSentence, BundleUnit, CourseNames, DataTable, Facet, KeyboardLayout, OrthographyProfile, PlacementPolicy, TaggedText } from "@nabu/schema";
import { keyboardDistance } from "../match/compare.ts";
import { compileAcceptSet, grade, lexiconKey, type CompiledAcceptSet, type Grade } from "../match/grade.ts";
import { compileProfile, type CompiledProfile } from "../profile/compile.ts";
import { err, ok, type Result } from "../result.ts";
import { graphemes } from "../text/graphemes.ts";
import { surfaceOf } from "../text/tagged-text.ts";

export interface CourseView {
  readonly id: string;
  /** The course's target language (BCP 47). */
  readonly target?: string | undefined;
  /** What the app calls the course and its orthographies, by language (ADR 0109). */
  readonly names?: CourseNames | undefined;
  readonly units: readonly BundleUnit[];
  /** The orthography the learner chose (one of the course's). */
  readonly orthography: string;
  /** The support orthography (en-Latn/standard) and its translation key (en). */
  readonly support: string;
  readonly supportKey: string;
  readonly profiles: ReadonlyMap<string, CompiledProfile>;
  /** Playable clips by sentence or KC id (gameplan §10); empty for a course without audio. */
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

export type CourseError =
  | { readonly code: "missing-file"; readonly path: string }
  | { readonly code: "unknown-orthography"; readonly orthography: string }
  | { readonly code: "profile"; readonly orthography: string; readonly detail: string };

/** The orthography id a support language key resolves to ("en" → "en-Latn/standard"). */
const supportKeyOf = (orthography: string): string => orthography.split("-")[0] as string;

/** The word (and number) tokens of a text, by index: what clip timings point at. */
const wordTokens = (text: TaggedText): readonly number[] =>
  text.tokens.flatMap((t, i) => (t.kind === "word" || t.kind === "number" ? [i] : []));

/** Each audio item's text in every orthography: sentences, story lines (`story#step`) and KC forms. */
const itemTexts = (units: readonly BundleUnit[]): ReadonlyMap<string, Readonly<Record<string, TaggedText>>> => {
  const out = new Map<string, Readonly<Record<string, TaggedText>>>();
  for (const unit of units) {
    for (const s of unit.sentences) out.set(s.id, Object.fromEntries(Object.entries(s.forms).map(([o, f]) => [o, f.text])));
    for (const story of unit.stories ?? []) {
      story.steps.forEach((step, i) => {
        if ("line" in step && step.line !== undefined) out.set(`${story.id}#${String(i)}`, step.line.forms);
      });
    }
    for (const kc of unit.kcs) {
      const forms = Object.entries(kc.forms ?? {}).flatMap(([o, fs]) => (fs[0] === undefined ? [] : [[o, fs[0]] as const]));
      out.set(kc.id, Object.fromEntries(forms));
    }
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
  orthography: string,
): Readonly<Record<string, BundleAudioItem>> => {
  const texts = itemTexts(units);
  return Object.fromEntries(
    Object.entries(audio).map(([item, a]) => {
      const t = texts.get(item);
      return [item, { normal: retime(a.normal, t, orthography), ...(a.slow === undefined ? {} : { slow: retime(a.slow, t, orthography) }) }];
    }),
  );
};

export const assembleCourse = (bundle: CourseFiles, orthography?: string): Result<CourseView, CourseError> => {
  const { manifest, files } = bundle;
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
  const audio = audioFor((read("audio-index")[0] as BundleAudio | undefined)?.items ?? {}, units, chosen);
  return ok({
    id: manifest.course,
    target: manifest.target,
    ...(manifest.names === undefined ? {} : { names: manifest.names }),
    units,
    orthography: chosen,
    support,
    supportKey: supportKeyOf(support),
    profiles,
    audio,
    ...(manifest.facets === undefined ? {} : { facets: manifest.facets }),
    ...(manifest.audioQuality === undefined ? {} : { audioQuality: manifest.audioQuality }),
    ...(manifest.placement === undefined ? {} : { placement: manifest.placement }),
  });
};

export const profileOf = (course: CourseView, orthography: string): CompiledProfile => {
  const profile = course.profiles.get(orthography);
  if (profile === undefined) throw new Error(`no profile ${orthography} in course ${course.id}`);
  return profile;
};

const sentenceLists = new WeakMap<CourseView, readonly BundleSentence[]>();
const kcLists = new WeakMap<CourseView, readonly BundleKc[]>();

/** Every sentence of the course, in course order (built once per course: planning asks per exercise). */
export const allSentences = (course: CourseView): readonly BundleSentence[] => {
  let list = sentenceLists.get(course);
  if (list === undefined) {
    list = course.units.flatMap((u) => u.sentences);
    sentenceLists.set(course, list);
  }
  return list;
};

/** Every KC of the course, in course order (built once per course). */
export const allKcs = (course: CourseView): readonly BundleKc[] => {
  let list = kcLists.get(course);
  if (list === undefined) {
    list = course.units.flatMap((u) => u.kcs);
    kcLists.set(course, list);
  }
  return list;
};

/** Grades answers against accept sets with the course's compiled profiles (§8.3). */
export interface Grader {
  readonly grade: (orthography: string, accept: string, answer: string) => Grade;
}

/**
 * Every text the course writes in an orthography: its glossary forms, its
 * sentences, and its story lines. Since KC forms are lemmas (ADR 0061), the
 * inflected words a learner types (talabasan, kitobing, وأنا) are only found in
 * the sentences and stories that use them.
 */
const textsOf = function* (course: CourseView, orthography: string): Generator<TaggedText> {
  for (const kc of allKcs(course)) yield* kc.forms?.[orthography] ?? [];
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

/** What grading looks a typed word up in, for one orthography of a course. */
export interface Lexicon {
  /** Every word the course writes in it, as `lexiconKey` has it: a typo landing on one is WRONG_WORD (erratum 46). */
  readonly words: ReadonlySet<string>;
  /**
   * The words the course inflects (ADR 0081): every word of a sense some token pins a form on, so a
   * masculine adjective counts with its feminine, a bare past verb with its b- present.
   */
  readonly inflected: ReadonlySet<string>;
  /**
   * Each inflected word's own forms, the forms its tokens are pinned as, for contrasts limited to
   * some (ADR 0084): a verb's infinitive is no perfect, whatever else its sense is pinned as.
   */
  readonly forms: ReadonlyMap<string, readonly string[]>;
}

interface OwnWord {
  readonly key: string;
  readonly letters: readonly string[];
  readonly inflected: boolean;
}

const buildLexicon = (course: CourseView, orthography: string): Lexicon => {
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

  const tokens = texts.flatMap((text) => text.tokens.filter((t) => t.kind === "word" && t.sense !== undefined));
  const senses = new Set(tokens.filter((t) => t.form !== undefined).map((t) => t.sense));
  const inflected = new Set<string>();
  const forms = new Map<string, Set<string>>();
  const pin = (k: string, these: Iterable<string>): void => {
    const all = forms.get(k) ?? new Set<string>();
    for (const f of these) all.add(f);
    forms.set(k, all);
  };
  for (const t of tokens) {
    if (!senses.has(t.sense)) continue;
    for (const k of keys(t.surface)) {
      inflected.add(k);
      if (t.form !== undefined) pin(k, [t.form]);
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
      if (t.kind !== "word" || t.sense === undefined) continue;
      for (const key of keys(t.surface)) {
        if (ownByKey.has(key)) continue;
        const word: OwnWord = { key, letters: lettersOf(key), inflected: senses.has(t.sense) };
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
          pin(k, forms.get(nearest.key) ?? []);
        }
      }
    }
  }
  return { words, inflected, forms: new Map([...forms].map(([k, fs]) => [k, [...fs].sort()])) };
};

/**
 * Each course's lexicons by orthography, built once, whatever the number of graders: every session
 * makes one. They are kept with the course's units, which a copy of the course that changes only
 * its media (restrictMedia) shares, and rebuilt only for another profile.
 */
const lexicons = new WeakMap<readonly BundleUnit[], Map<string, { readonly profile: CompiledProfile; readonly lexicon: Lexicon }>>();

/** A course's lexicon for an orthography (exported for tests). */
export const lexiconOf = (course: CourseView, orthography: string): Lexicon => {
  let byOrthography = lexicons.get(course.units);
  if (byOrthography === undefined) {
    byOrthography = new Map();
    lexicons.set(course.units, byOrthography);
  }
  const profile = profileOf(course, orthography);
  const built = byOrthography.get(orthography);
  if (built !== undefined && built.profile === profile) return built.lexicon;
  const lexicon = buildLexicon(course, orthography);
  byOrthography.set(orthography, { profile, lexicon });
  return lexicon;
};

/**
 * Builds the lexicons grading looks words up in (the course's orthography and its support
 * language's), which the first typed or tiled answer would otherwise wait for: each session makes
 * a grader, and a course of thirty units takes a moment. An app calls it while the learner reads.
 */
export const prepareGrading = (course: CourseView): void => {
  for (const orthography of [course.orthography, course.support]) if (course.profiles.has(orthography)) lexiconOf(course, orthography);
};

/**
 * A grader with a per-orthography lexicon (every word the course writes in it,
 * normalized and case-folded as grade() compares units) so that a typo landing
 * on a real word is WRONG_WORD (erratum 46). The lexicons are the course's (built
 * once per course); compiled accept sets are memoized per grader; grading itself
 * stays pure.
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
      const { words, inflected, forms } = lexiconOf(course, orthography);
      return grade(set, answer, { lexicon: words, inflected, forms });
    },
  };
};
