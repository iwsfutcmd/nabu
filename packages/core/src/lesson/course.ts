/**
 * A course as the player sees it: the bundle's units plus compiled profiles,
 * for one taught orthography and one support language. Assembling it is pure;
 * the shell fetches the files (gameplan §7.5 stage 9) and passes them in.
 */
import type { BundleAudio, BundleAudioItem, BundleKc, BundleManifest, BundleSentence, BundleUnit, DataTable, Facet, KeyboardLayout, OrthographyProfile, PlacementPolicy, TaggedText } from "@nabu/schema";
import { keyboardDistance } from "../match/compare.ts";
import { compileAcceptSet, grade, lexiconKey, type CompiledAcceptSet, type Grade } from "../match/grade.ts";
import { compileProfile, type CompiledProfile } from "../profile/compile.ts";
import { err, ok, type Result } from "../result.ts";
import { graphemes } from "../text/graphemes.ts";
import { surfaceOf } from "../text/tagged-text.ts";

export interface CourseView {
  readonly id: string;
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
  const audio = (read("audio-index")[0] as BundleAudio | undefined)?.items ?? {};
  return ok({
    id: manifest.course,
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

/**
 * A grader with a per-orthography lexicon (every word the course writes in it,
 * normalized and case-folded as grade() compares units) so that a typo landing
 * on a real word is WRONG_WORD (erratum 46). Compiled accept sets are
 * memoized; grading itself stays pure.
 */
export const createGrader = (course: CourseView): Grader => {
  const sets = new Map<string, CompiledAcceptSet>();
  const lexicons = new Map<string, ReadonlySet<string>>();
  const lexicon = (orthography: string): ReadonlySet<string> => {
    let words = lexicons.get(orthography);
    if (words === undefined) {
      const profile = profileOf(course, orthography);
      const found = new Set<string>();
      for (const text of textsOf(course, orthography)) {
        for (const unit of profile.units(profile.normalize(surfaceOf(text)))) found.add(lexiconKey(profile, unit));
      }
      words = found;
      lexicons.set(orthography, words);
    }
    return words;
  };
  // The words the course inflects (ADR 0081): every word of a sense some token pins a form on,
  // so a masculine adjective counts with its feminine, a bare past verb with its b- present.
  // And each word's own forms, the forms its tokens are pinned as, for contrasts limited to some
  // (ADR 0084): a verb's infinitive is no perfect, whatever else its sense is pinned as.
  interface Inflections {
    readonly words: ReadonlySet<string>;
    readonly forms: ReadonlyMap<string, readonly string[]>;
  }
  const inflections = new Map<string, Inflections>();
  const inflected = (orthography: string): Inflections => {
    let found = inflections.get(orthography);
    if (found === undefined) {
      const profile = profileOf(course, orthography);
      const tokens = [...textsOf(course, orthography)].flatMap((text) => text.tokens.filter((t) => t.kind === "word" && t.sense !== undefined));
      const senses = new Set(tokens.filter((t) => t.form !== undefined).map((t) => t.sense));
      const keys = (text: string): string[] => profile.units(profile.normalize(text)).map((unit) => lexiconKey(profile, unit));
      const words = new Set<string>();
      const forms = new Map<string, Set<string>>();
      const pin = (k: string, these: Iterable<string>): void => {
        const all = forms.get(k) ?? new Set<string>();
        for (const f of these) all.add(f);
        forms.set(k, all);
      };
      for (const t of tokens) {
        if (!senses.has(t.sense)) continue;
        for (const k of keys(t.surface)) {
          words.add(k);
          if (t.form !== undefined) pin(k, [t.form]);
        }
      }
      // A sentence's accept set spells its words other ways too (be2ra beside b2ra): each of
      // those words counts as inflected when the nearest word of the sentence is, with its forms.
      for (const s of allSentences(course)) {
        const form = s.forms[orthography];
        if (form?.reverse === undefined) continue;
        const own = form.text.tokens
          .filter((t) => t.kind === "word" && t.sense !== undefined)
          .flatMap((t) => keys(t.surface).map((k) => ({ key: k, letters: graphemes(k), inflected: senses.has(t.sense) })));
        if (!own.some((w) => w.inflected)) continue;
        for (const piece of form.reverse.split(/[\s()|[\]]+/u)) {
          for (const k of keys(piece)) {
            const letters = graphemes(k);
            let nearest: (typeof own)[number] | undefined;
            let best = Infinity;
            for (const w of own) {
              const d = keyboardDistance(letters, w.letters, () => false);
              if (d < best) [nearest, best] = [w, d];
            }
            if (nearest?.inflected === true && best <= Math.max(1, nearest.letters.length / 2)) {
              words.add(k);
              pin(k, forms.get(nearest.key) ?? []);
            }
          }
        }
      }
      found = { words, forms: new Map([...forms].map(([k, fs]) => [k, [...fs].sort()])) };
      inflections.set(orthography, found);
    }
    return found;
  };
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
      const { words, forms } = inflected(orthography);
      return grade(set, answer, { lexicon: lexicon(orthography), inflected: words, forms });
    },
  };
};
