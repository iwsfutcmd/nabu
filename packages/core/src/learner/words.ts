/**
 * The words a learner has learned in a course (the word list): every word KC (kinds sense and
 * form) with a written form in the orthography being learned, practised at least once. A word
 * is practised when any of its cards has a review: the language's facets (shared by every
 * orthography) or the script facets of this orthography (§6.3).
 *
 * Pure: the state is the replayed log, `now` the caller's clock.
 */
import type { BundleKc, TaggedText } from "@nabu/schema";
import type { CourseView } from "../lesson/course.ts";
import type { Facet } from "../lesson/exercise.ts";
import { surfaceOf } from "../text/tagged-text.ts";
import { parseCardKey, retrievability, type LearnerState } from "./state.ts";

export interface LearnedWord {
  readonly kc: string;
  /** The unit that teaches it (the first, if several list it). */
  readonly unit: string;
  /** Its lemma, as word cards show it, in the orthography being learned. */
  readonly form: TaggedText;
  /** Its meaning in the support language, where the course gives one. */
  readonly gloss: TaggedText | undefined;
  /** How likely it is remembered now: the mean recall probability of its practised facets (0–1). */
  readonly strength: number;
  /** Whether a practised facet is due for review. */
  readonly due: boolean;
  /** Reviews of all its facets together. */
  readonly reviews: number;
}

const WORD_KINDS: ReadonlySet<BundleKc["kind"]> = new Set(["sense", "form"]);

/** The facets of `kc` this learner has practised, for the cards this orthography reads. */
const practisedFacets = (state: LearnerState, kc: string, orthography: string): { readonly facet: Facet; readonly reps: number; readonly due: string }[] =>
  Object.entries(state.cards).flatMap(([key, card]) => {
    const ref = parseCardKey(key);
    if (ref.kc !== kc || card.reps === 0) return [];
    if (ref.orthography !== undefined && ref.orthography !== orthography) return [];
    return [{ facet: ref.facet, reps: card.reps, due: card.due }];
  });

/** Every learned word of the course, in course order (unit, then the unit's own order). */
export const learnedWords = (course: CourseView, state: LearnerState, now: string): readonly LearnedWord[] => {
  const orthography = course.orthography;
  const seen = new Set<string>();
  const out: LearnedWord[] = [];
  // One pass over the cards for every KC: a learner's state has far fewer cards than a course has KCs.
  const practised = new Set(
    Object.entries(state.cards)
      .filter(([, card]) => card.reps > 0)
      .map(([key]) => parseCardKey(key).kc),
  );
  for (const unit of course.units) {
    for (const kc of unit.kcs) {
      if (seen.has(kc.id) || !WORD_KINDS.has(kc.kind) || !practised.has(kc.id)) continue;
      const form = kc.forms?.[orthography]?.[0];
      if (form === undefined) continue;
      const facets = practisedFacets(state, kc.id, orthography);
      if (facets.length === 0) continue;
      seen.add(kc.id);
      const strength = facets.reduce((sum, f) => sum + retrievability(state, kc.id, f.facet, orthography, now), 0) / facets.length;
      out.push({
        kc: kc.id,
        unit: unit.id,
        form,
        gloss: kc.gloss?.[course.supportKey],
        strength,
        due: facets.some((f) => f.due <= now),
        reviews: facets.reduce((sum, f) => sum + f.reps, 0),
      });
    }
  }
  return out;
};

export type WordOrder = "course" | "alphabetical" | "weakest";

/**
 * The words in an order: the course's; alphabetical by the target language's own collation
 * (Intl.Collator for the form's tag, never code points); or weakest first (due words, then by
 * strength, course order breaking ties).
 */
export const orderWords = (words: readonly LearnedWord[], order: WordOrder): readonly LearnedWord[] => {
  if (order === "course") return words;
  const position = new Map(words.map((w, i) => [w.kc, i]));
  const tie = (a: LearnedWord, b: LearnedWord): number => (position.get(a.kc) ?? 0) - (position.get(b.kc) ?? 0);
  if (order === "weakest") return [...words].sort((a, b) => (a.due === b.due ? a.strength - b.strength || tie(a, b) : a.due ? -1 : 1));
  const lang = words[0]?.form.lang;
  const collator = new Intl.Collator(lang, { sensitivity: "base" });
  return [...words].sort((a, b) => collator.compare(surfaceOf(a.form), surfaceOf(b.form)) || tie(a, b));
};

/**
 * Whether a word matches what the learner typed: in its form as the orthography compares letters
 * (normalized, vowel marks stripped, variants keyed, case folded: سلام finds سَلام), or in its
 * gloss, case-folded in the gloss's own language. An empty query matches every word.
 */
export const wordMatcher = (course: CourseView, query: string): ((word: LearnedWord) => boolean) => {
  const q = query.normalize("NFC").trim();
  if (q === "") return () => true;
  const profile = course.profiles.get(course.orthography);
  const targetKey = (text: string): string => {
    if (profile === undefined) return text.normalize("NFC");
    const normalized = profile.normalize(text);
    const bare = profile.marks?.strip(normalized) ?? normalized;
    return profile.fold(profile.variants?.key(bare) ?? bare);
  };
  const target = targetKey(q);
  return (word) => {
    if (targetKey(surfaceOf(word.form)).includes(target)) return true;
    if (word.gloss === undefined) return false;
    const lang = word.gloss.lang;
    return surfaceOf(word.gloss).normalize("NFC").toLocaleLowerCase(lang).includes(q.toLocaleLowerCase(lang));
  };
};
