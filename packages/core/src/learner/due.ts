/**
 * What is due, and the cards that can clear it (the owner's ruling of 2026-11-22): a facet makes a
 * word due only where the course can make a card that credits that facet for that word, and a
 * review's card for a due facet is one of those cards. "Due" is a promise that a review can clear it.
 *
 * What a card credits is what the player logs for an answer exactly right (`rightCredits`, through
 * `creditOf`): its parts by its skill, and a typed sentence's words' spellings where they have a
 * leftover (ADR 0148). A facet is askable where some card the course can make credits it, given what
 * is lasting: the course's exclusions (its `facets`, its voice, its parts cards), the facets the
 * learner turned off for good (D41, D45) and their reading tradition (ADR 0138). A break does not
 * make a facet stop being due: it only leaves cards out of the sessions planned meanwhile.
 *
 * Whether a facet is askable is found by making the cards that could credit it, the cheapest
 * first, from the sentences and words that carry its part, until one does; once per course, facet
 * and setting (memoised on the CourseView), so the course page and the word list pay for it once.
 * The review planner finds its cards for due facets the same way (`cardCrediting`), from the
 * sentences it may use, so whatever is counted due, a review can plan a card for.
 *
 * Pure: the state is the replayed log, `now` the caller's clock.
 */
import type { BundleSentence, SchemeId, Token } from "@nabu/schema";
import { allSentences, lexemesById, type CourseView } from "../lesson/course.ts";
import type { Exercise, Facet, Skill, TemplateId } from "../lesson/exercise.ts";
import { courseExclusions, speechExclusions } from "../lesson/exclusions.ts";
import { kindOf, lexemeIdsOf } from "../lesson/lexemes.ts";
import { seededRng } from "../lesson/rng.ts";
import { chosenTraditionKey, readingTradition } from "../lesson/traditions.ts";
import { asksOf, LEXEME_LISTENING, makeSelectImage, SENTENCE_TEMPLATES, skillOf, TEMPLATES, type MakeContext } from "../lesson/templates.ts";
import { askedParts, practised, readingOf, rightCredits } from "./credit.ts";
import { cardKey, DESIRED_RETENTION, parseCardKey, retrievability, type LearnerState } from "./state.ts";

/** No facet turned off: every function's default. */
const NONE: ReadonlySet<Facet> = new Set<Facet>();

const keysOf = new WeakMap<Exercise, readonly string[]>();

/**
 * The cards (keys, `cardKey`) an answer exactly right to this card is credited to (`rightCredits`):
 * a script skill's in the course's orthography, a reading's in the card's tradition (ADR 0138). Per
 * exercise: the planner asks it of every candidate as it scores.
 */
export const creditedKeys = (course: CourseView, ex: Exercise): readonly string[] => {
  let keys = keysOf.get(ex);
  if (keys === undefined) {
    const reading = readingOf(ex);
    keys = [...new Set(rightCredits(course, ex).map((c) => cardKey(c.part, c.skill, course.orthography, c.skill === "read-script" ? reading : undefined)))];
    keysOf.set(ex, keys);
  }
  return keys;
};

/**
 * The templates no session of this learner can ever make in this course: the course's own
 * exclusions (ADR 0071, 0091, 0152), those of the facets turned off for good (D41, D45), and scored
 * speech and tones, which depend on what the app can do (self-rated speaking stands in for them).
 */
export const lastingExclusions = (course: CourseView, facetsOff: ReadonlySet<Facet> = NONE): ReadonlySet<TemplateId> =>
  new Set([
    ...courseExclusions(course),
    ...speechExclusions(undefined),
    ...(Object.keys(TEMPLATES) as TemplateId[]).filter((t) => facetsOff.has(TEMPLATES[t].facet)),
  ]);

/**
 * The sentence templates in the order a search tries them: the cheapest to make first (a typed
 * sentence, speaking, a typed clip are made at once; a fill-in grades its options), so that finding a
 * card for a facet costs little where a cheap card credits it; then every other sentence template.
 */
const CHEAP_FIRST: readonly TemplateId[] = ["translate-type.l1-l2", "speak.tier-0", "speak", "listen-speak", "listen-type", "complete-translation", "transcribe", "vocalize", "vocalize-build"];
const SEARCH_ORDER: readonly TemplateId[] = [...CHEAP_FIRST, ...(Object.keys(SENTENCE_TEMPLATES) as TemplateId[]).filter((t) => !CHEAP_FIRST.includes(t))];

/** The typed templates, which credit a word's spelling leftover beside their own skill (ADR 0148). */
const TYPED: ReadonlySet<TemplateId> = new Set<TemplateId>(["translate-type.l1-l2", "listen-type"]);

/** Whether a card of this template could credit this part by this skill (what `creditOf` can give it). */
const mayCredit = (template: TemplateId, part: string, skill: Skill): boolean =>
  asksOf(template, part) && (skillOf(template, part) === skill || (skill === "write-script" && TYPED.has(template) && kindOf(part) === "lexeme"));

/** Each part's sentences in the course's orthography, in course order. Per course. */
const carriers = new WeakMap<CourseView, ReadonlyMap<string, readonly BundleSentence[]>>();
export const sentencesCarrying = (course: CourseView): ReadonlyMap<string, readonly BundleSentence[]> => {
  let found = carriers.get(course);
  if (found === undefined) {
    const map = new Map<string, BundleSentence[]>();
    for (const s of allSentences(course)) {
      if (s.forms[course.orthography] === undefined) continue;
      // A sentence's parts list every lexeme its tokens write (the compiler's), bound ones too.
      for (const part of new Set<string>(s.parts)) {
        const list = map.get(part);
        if (list === undefined) map.set(part, [s]);
        else list.push(s);
      }
    }
    found = map;
    carriers.set(course, found);
  }
  return found;
};

/** The tokens of a sentence's form that write the part: the words a one-word card may be asked about. */
const tokensCarrying = (course: CourseView, s: BundleSentence, part: string): readonly Token[] =>
  (s.forms[course.orthography]?.text.tokens ?? []).filter((t) => t.kind === "lexical" && lexemeIdsOf(t).includes(part as never));

/**
 * A card crediting a facet (its key), made from these sentences in their order, then from the part's
 * own lexeme (never a letter's script card: ADR 0149): each sentence's templates the cheapest first, a card about one word asked
 * about each word carrying the part where the card made without asking does not credit it. None of a
 * template in `exclude`, nor one `ready` refuses (a card the learner may not be asked yet: a reading
 * typed before it was chosen). The one search for both halves: whether a facet is askable
 * (`askable`, over every sentence carrying the part) and the card a review takes for a due facet
 * (over the sentences it may use).
 */
export const cardCrediting = (
  ctx: MakeContext,
  key: string,
  sentences: readonly BundleSentence[],
  exclude: ReadonlySet<TemplateId>,
  ready: (ex: Exercise) => boolean = () => true,
): Exercise | undefined => {
  const { course } = ctx;
  const ref = parseCardKey(key);
  const { part, skill } = ref;
  if (part.includes("|") || (ref.orthography !== undefined && ref.orthography !== course.orthography) || !practised(course, skill)) return undefined;
  const credits = (ex: Exercise | undefined): ex is Exercise => ex !== undefined && !exclude.has(ex.template) && creditedKeys(course, ex).includes(key) && ready(ex);
  const templates = SEARCH_ORDER.filter((t) => !exclude.has(t) && SENTENCE_TEMPLATES[t] !== undefined && mayCredit(t, part, skill));
  if (templates.length > 0)
    for (const s of sentences) {
      for (const t of templates) {
        const make = SENTENCE_TEMPLATES[t];
        if (make === undefined) continue;
        const made = make(ctx, s);
        if (credits(made)) return made;
        // A card about one word of its sentence (`askedParts`) is asked about each word carrying the part.
        if (made !== undefined && askedParts(made) === undefined) continue;
        for (const token of tokensCarrying(course, s, part)) {
          const asked = make({ ...ctx, ask: [...new Set(lexemeIdsOf(token).map(String))].sort(), asks: undefined }, s);
          if (credits(asked)) return asked;
        }
      }
    }
  // A word's own cards: its picture, its clip.
  const lexeme = lexemesById(course).get(part);
  if (lexeme !== undefined) {
    const pictured = exclude.has("select-image") ? undefined : makeSelectImage(ctx, lexeme);
    if (credits(pictured)) return pictured;
    for (const make of LEXEME_LISTENING) {
      const heard = make(ctx, lexeme);
      if (credits(heard)) return heard;
    }
  }
  // A letter has no card here: no script card comes back in a review, and a letter has no schedule
  // (ADR 0149; ADR 0088 as built). So a letter's facet is never askable, and never due.
  return undefined;
};

/** The cards that read a whole sentence and credit each of its parts by recognizing it (or reading a form off). */
const READ_WHOLE: readonly TemplateId[] = ["choose-translation", "translate-tap.l2-l1", "translate-tap.l1-l2"];

/**
 * A shortcut for `askable` (making a tap card the first time costs a course's tables): a part a
 * sentence carries is recognized (a feature value read off) by a card that reads the whole sentence,
 * which any sentence with its translation makes. The due tests hold it to the search.
 */
const readByWhole = (course: CourseView, exclude: ReadonlySet<TemplateId>, part: string, skill: Skill, sentences: readonly BundleSentence[]): boolean =>
  (skill === "recognize" || skill === "read-off") &&
  READ_WHOLE.some((t) => !exclude.has(t) && mayCredit(t, part, skill)) &&
  sentences.some((s) => s.parts.includes(part) && s.translations[course.supportKey] !== undefined);

/** Per course, per setting (facets off, tradition): whether each facet asked about is askable. */
const askableOf = new WeakMap<CourseView, Map<string, Map<string, boolean>>>();

/**
 * Whether the course can make a card crediting a facet (its key), given what is lasting: the
 * course's exclusions, the facets turned off for good (`facetsOff`) and the learner's reading
 * tradition (`reading`; the first where unset). A facet of a part the course no longer has, of a
 * skill the course does not practise, or of a tradition the learner does not read, is not.
 * Memoised per course and setting: each facet is looked for once.
 */
export const askable = (course: CourseView, facetsOff: ReadonlySet<Facet> = NONE, reading?: SchemeId | false): ((key: string) => boolean) => {
  const scheme = readingTradition(course, reading);
  const tradition = chosenTraditionKey(course, reading);
  const setting = `${[...facetsOff].sort().join(" ")}|${scheme ?? ""}`;
  let bySetting = askableOf.get(course);
  if (bySetting === undefined) {
    bySetting = new Map();
    askableOf.set(course, bySetting);
  }
  let known = bySetting.get(setting);
  if (known === undefined) {
    known = new Map();
    bySetting.set(setting, known);
  }
  const memo = known;
  const exclude = lastingExclusions(course, facetsOff);
  const ctx: MakeContext = { course, rng: seededRng(1), introduced: [], ...(scheme === undefined ? {} : { reading: scheme }) };
  return (key) => {
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    const ref = parseCardKey(key);
    const sentences = sentencesCarrying(course).get(ref.part) ?? [];
    const yes =
      !(facetsOff as ReadonlySet<string>).has(ref.skill) &&
      (ref.skill !== "read-script" || ref.reading === tradition) &&
      (readByWhole(course, exclude, ref.part, ref.skill, sentences) || cardCrediting(ctx, key, sentences, exclude) !== undefined);
    memo.set(key, yes);
    return yes;
  };
};

/**
 * Due facets (R < desired retention) that a card can clear, most forgotten first: script facets
 * only in the orthography being learned, readings only in the learner's tradition (`reading`, as
 * the learner chose it: ADR 0138), facets turned off for good (D41) not at all, and only facets
 * the course can make a card for (`askable`).
 */
export const dueFacets = (
  course: CourseView,
  state: LearnerState,
  now: string,
  desired = DESIRED_RETENTION,
  facetsOff: ReadonlySet<Facet> = NONE,
  reading?: SchemeId | false,
): readonly { readonly key: string; readonly r: number }[] => {
  const can = askable(course, facetsOff, reading);
  return Object.keys(state.cards)
    .flatMap((key) => {
      const ref = parseCardKey(key);
      if (ref.orthography !== undefined && ref.orthography !== course.orthography) return [];
      const r = retrievability(state, ref.part, ref.skill, course.orthography, now, ref.reading);
      return r < desired && can(key) ? [{ key, r }] : [];
    })
    .sort((a, b) => a.r - b.r || (a.key < b.key ? -1 : 1));
};
