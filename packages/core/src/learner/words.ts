/**
 * The words a learner has met in a course (the word list): every word KC (kinds sense and form)
 * with a written form in the orthography being learned, practised at least once. A word is
 * practised when any of its cards has a review: the language's facets (shared by every
 * orthography) or the script facets of this orthography (§6.3).
 *
 * A practised word is known once it has shown every skill the course asks of it (ADR 0100), and
 * is being learned until then.
 *
 * Pure: the state is the replayed log, `now` the caller's clock.
 */
import type { BundleKc, TaggedText } from "@nabu/schema";
import { courseExclusions } from "../lesson/build.ts";
import type { CourseView } from "../lesson/course.ts";
import type { Facet, TemplateId } from "../lesson/exercise.ts";
import { TEMPLATES } from "../lesson/templates.ts";
import { surfaceOf } from "../text/tagged-text.ts";
import { cardKey, DESIRED_RETENTION, parseCardKey, retrievability, type LearnerState } from "./state.ts";

/** A skill a word is known by (ADR 0100): recognizing it, producing it, hearing it. */
export type Skill = "recognize" | "produce" | "listen";

export interface WordSkill {
  readonly skill: Skill;
  /** Shown: a first try right on a later day than the word was met, and not missed since. */
  readonly shown: boolean;
}

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
  /**
   * Whether it is due for review: a practised facet's recall has dropped below the target (the
   * planner's `dueFacets`, so the word list and the course page agree, W8).
   */
  readonly due: boolean;
  /** Reviews of all its facets together. */
  readonly reviews: number;
  /** Every skill the course asks of it shown (ADR 0100); until then it is being learned. */
  readonly known: boolean;
  /** The skills the course asks of it, in the order recognize, produce, listen, each shown or not. */
  readonly skills: readonly WordSkill[];
}

const WORD_KINDS: ReadonlySet<BundleKc["kind"]> = new Set(["sense", "form"]);

/**
 * The skills a course asks of each of its words (ADR 0100): recognizing it; producing it where a
 * sentence uses it (a word is produced by typing a sentence); and hearing it where the course plans
 * listening (its facets, ADR 0071; a good voice, ADR 0091) and the word can be heard, in its own clip
 * or in a sentence's.
 */
const skillsOf = (course: CourseView): ((kc: string) => readonly Skill[]) => {
  const excluded = courseExclusions(course);
  const wordKcs = new Set(course.units.flatMap((u) => u.kcs.filter((k) => WORD_KINDS.has(k.kind)).map((k) => k.id as string)));
  const plans = (skill: Skill): boolean => (Object.keys(TEMPLATES) as TemplateId[]).some((t) => TEMPLATES[t].facet === skill && !excluded.has(t));
  const written = new Set<string>();
  const heard = new Set<string>(Object.keys(course.audio));
  for (const unit of course.units)
    for (const s of unit.sentences) {
      if (s.forms[course.orthography] === undefined) continue;
      for (const kc of s.kcs) written.add(kc);
      if (course.audio[s.id] !== undefined) for (const kc of s.kcs) heard.add(kc);
    }
  const recognize = plans("recognize");
  const produce = plans("produce");
  const listen = plans("listen");
  return (kc) =>
    wordKcs.has(kc)
      ? [...(recognize ? (["recognize"] as const) : []), ...(produce && written.has(kc) ? (["produce"] as const) : []), ...(listen && heard.has(kc) ? (["listen"] as const) : [])]
      : [];
};

const asked = new WeakMap<CourseView, (kc: string) => readonly Skill[]>();

/** The same, memoised per course: planning asks it on every plan. */
export const skillsAsked = (course: CourseView): ((kc: string) => readonly Skill[]) => {
  const cached = asked.get(course);
  if (cached !== undefined) return cached;
  const made = skillsOf(course);
  asked.set(course, made);
  return made;
};

interface Practised {
  readonly facet: Facet;
  readonly reps: number;
}

/**
 * Every practised word of the course, in course order (unit, then the unit's own order); due where
 * a facet's recall at `now` is below `desired` (the learner's target retention).
 */
export const learnedWords = (course: CourseView, state: LearnerState, now: string, desired: number = DESIRED_RETENTION): readonly LearnedWord[] => {
  const orthography = course.orthography;
  const asked = skillsAsked(course);
  // One pass over the cards, by KC: the language's facets, and the script facets of this orthography.
  const practised = new Map<string, Practised[]>();
  for (const [key, card] of Object.entries(state.cards)) {
    const ref = parseCardKey(key);
    if (card.reps === 0 || (ref.orthography !== undefined && ref.orthography !== orthography)) continue;
    practised.set(ref.kc, [...(practised.get(ref.kc) ?? []), { facet: ref.facet, reps: card.reps }]);
  }
  const seen = new Set<string>();
  const out: LearnedWord[] = [];
  for (const unit of course.units) {
    for (const kc of unit.kcs) {
      const facets = practised.get(kc.id);
      const form = kc.forms?.[orthography]?.[0];
      if (seen.has(kc.id) || !WORD_KINDS.has(kc.kind) || facets === undefined || form === undefined) continue;
      seen.add(kc.id);
      const recall = facets.map((f) => retrievability(state, kc.id, f.facet, orthography, now));
      const strength = recall.reduce((sum, r) => sum + r, 0) / recall.length;
      const skills = asked(kc.id).map((skill) => ({ skill, shown: state.shown[cardKey(kc.id, skill, orthography)] !== undefined }));
      out.push({
        kc: kc.id,
        unit: unit.id,
        form,
        gloss: kc.gloss?.[course.supportKey],
        strength,
        due: recall.some((r) => r < desired),
        reviews: facets.reduce((sum, f) => sum + f.reps, 0),
        known: skills.length > 0 && skills.every((s) => s.shown),
        skills,
      });
    }
  }
  return out;
};

/** How many of the words are known, how many still being learned, and how many are due for review. */
export const wordCounts = (words: readonly LearnedWord[]): { readonly known: number; readonly learning: number; readonly due: number } => {
  const known = words.filter((w) => w.known).length;
  return { known, learning: words.length - known, due: words.filter((w) => w.due).length };
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

/** A reading as search compares it: lowercase, without marks, spaces or (unless typed) tone digits. */
const readingKey = (reading: string, digits: boolean): string => {
  const bare = reading.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("und").replace(/[\s'’-]/gu, "");
  return (digits ? bare : bare.replace(/\p{Nd}/gu, "")).normalize("NFC");
};

/** The readings its form's tokens pin (Jyutping, pinyin, SBL, sitelen Lasina). */
const readingsOf = (form: TaggedText): readonly string[] => form.tokens.flatMap((t) => Object.values(t.readings ?? {}));

/**
 * Whether a word matches what the learner typed: in its form as the orthography compares letters
 * (normalized, vowel marks stripped, variants keyed, case folded: سلام finds سَلام); in its readings,
 * with or without tone digits and marks (zousan and zou2 find 早晨 zou2 san4); or in its gloss,
 * case-folded in the gloss's own language. An empty query matches every word.
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
  const digits = /\p{Nd}/u.test(q);
  const reading = readingKey(q, digits);
  return (word) => {
    if (targetKey(surfaceOf(word.form)).includes(target)) return true;
    if (reading !== "" && readingKey(readingsOf(word.form).join(""), digits).includes(reading)) return true;
    if (word.gloss === undefined) return false;
    const lang = word.gloss.lang;
    return surfaceOf(word.gloss).normalize("NFC").toLocaleLowerCase(lang).includes(q.toLocaleLowerCase(lang));
  };
};
