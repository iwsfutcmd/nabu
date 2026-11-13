/**
 * The session planner (gameplan §9.4). Pure and seeded: the same request,
 * state, bundle and seed give the same plan.
 *
 * 1. Targets: the node's new KCs, plus due facets (R below desired retention).
 * 2. Candidates: every (template, item) the templates can make, where every
 *    KC that is not a target has been seen before (the i+1 rule at runtime).
 * 3. Score: expected memory gain (more for a skill a word has yet to show, ADR
 *    0101), plus closeness of the session's mean p̂ to the target success rate,
 *    minus repetition of the same template or item.
 * 4. Greedy selection with hard constraints: excluded templates, at most three
 *    of a template (two speaking turns), a new KC is recognized before it is
 *    produced or read, every new KC of a lesson is presented in it, and a few
 *    cards, spread through the session, have words show the skills they lack
 *    (typing them, hearing them; ADR 0101).
 * 5. Order: selection order (new words first), ending on a likely success.
 */
import type { BundleKc, BundleSentence, KcId } from "@nabu/schema";
import { courseExclusions, lessonNodes, sentencesOf, speechExclusions, type SpeechSupport } from "../lesson/build.ts";
import { allKcs, allSentences, type CourseView } from "../lesson/course.ts";
import type { Exercise, Facet, TemplateId } from "../lesson/exercise.ts";
import { seededRng } from "../lesson/rng.ts";
import { scriptCandidates, scriptNodes } from "../lesson/script.ts";
import { KC_LISTENING, KC_TEMPLATES, makeMatchPairs, makeSelectImage, SENTENCE_TEMPLATES, type MakeContext } from "../lesson/templates.ts";
import { askedKcs, creditedKcs, facetOf } from "./credit.ts";
import { PERFORMANCE_MODEL, predict } from "./performance.ts";
import { runTest } from "../lesson/adaptive.ts";
import { placementTest, type PlacementTest } from "./placement.ts";
import { cardKey, DESIRED_RETENTION, meanRetrievability, parseCardKey, retrievability, type LearnerState } from "./state.ts";
import { skillsAsked } from "./words.ts";

export const PLANNER = `planner@1+${PERFORMANCE_MODEL}`;

export type SessionRequest =
  | { readonly mode: "lesson"; readonly node: string }
  | { readonly mode: "review" }
  | { readonly mode: "mistakes" }
  | { readonly mode: "placement" };

export interface PlanOptions {
  /** The device clock, ISO 8601: retrievability is computed at this time. */
  readonly now: string;
  readonly seed: number;
  /** Target success rate (§9.4): 0.85 by default, a tunable heuristic. */
  readonly targetSuccess?: number;
  readonly size?: number;
  readonly exclude?: ReadonlySet<TemplateId>;
  readonly desiredRetention?: number;
  /** What the app can do with speech (scored speaking, tone exercises); without it, tier 0 only. */
  readonly speech?: SpeechSupport | undefined;
  /**
   * The learner's local date (YYYY-MM-DD), as events stamp it: a word met today shows no skill
   * before tomorrow (ADR 0100), so sessions aim at the skills of words met before it. The date
   * of `now` where the caller has none.
   */
  readonly today?: string | undefined;
}

export interface SessionPlan {
  readonly request: SessionRequest;
  readonly exercises: readonly Exercise[];
  /** p̂ for each exercise, logged in shadow mode (§9.3). */
  readonly predictions: readonly number[];
  readonly planner: string;
  /**
   * Placement only (ADR 0077): the adaptive test. `exercises` are what it asks first; the player
   * asks the rest as the answers decide, and `predictions` covers every exercise it may ask.
   */
  readonly placement?: PlacementTest & { readonly predictions: Readonly<Record<string, number>> };
}

interface Candidate {
  readonly ex: Exercise;
  readonly p: number;
  readonly order: number;
}

/**
 * How strongly the session's mean p̂ is pulled toward the target (tuned on test/simulation.test.ts).
 * 90 since uz speaks with Navoiy (ADR 0059): far more uz clips pass the round trip, so its lessons
 * carry more listening exercises, which are hard for a weak learner. The weakest uz-Latn learner
 * still sets the weight (79.6% at 70, 81.5% at 80, 82.0% at 90; every other run 83.7–86.6%).
 */
const CALIBRATION_WEIGHT = 90;

/** Variety (§9.4): no template more than three times a session, and at most two speaking turns. */
const MAX_PER_TEMPLATE_DEFAULT = 3;
const MAX_PER_TEMPLATE: Readonly<Partial<Record<TemplateId, number>>> = {
  // Self-rated speaking checks nothing (P5): one card a session, never a filler (L6).
  "speak.tier-0": 1,
  speak: 2,
  "listen-speak": 2,
  "match-pairs": 1,
  "select-image": 2,
  "listen-tap": 2,
  "listen-type": 2,
  "listen-select": 2,
  "minimal-pair": 1,
  "letter-pairs": 1,
  "letter-read": 4,
  // A word's pronunciation in its sentence (ADR 0054, 0095): one card of each a session.
  vocalize: 1,
  transcribe: 1,
};

/**
 * Review inside a lesson (ADR 0097): earlier sentences to bring back, and the share of a lesson's
 * cards they may take (a quarter, at least one).
 */
const REVIEW_SENTENCES = 6;
const REVIEW_SHARE = 0.25;
/**
 * A lesson running well under the target success (its mean p̂ more than REVIEW_SHORTFALL below) may
 * give review up to REVIEW_SHARE_STRUGGLING of its cards: a learner who struggles gets more
 * repetition of what they have met, not a harder lesson (the review's L6; adaptive pacing builds on it).
 */
const REVIEW_SHARE_STRUGGLING = 0.5;
const REVIEW_SHORTFALL = 0.1;

/**
 * A review session (L3): a card for each word that needs one (a due card, or a skill to show), at
 * least REVIEW_SESSION_MIN and at most REVIEW_SESSION_MAX, so a larger backlog gets a longer
 * session. It plans from what needs review most, never from every studied sentence (R3): the
 * sentences that practise the most forgotten words and lacking skills (twice the session's cards),
 * the words' own cards (three times), and a few the learner knows well to balance it.
 */
const REVIEW_SESSION_MIN = 5;
const REVIEW_SESSION_MAX = 15;

/**
 * Skills to show (ADR 0101): a card is worth NEED_GAIN more for each word it exercises in a skill
 * the course asks of it (ADR 0100) that the word, met on an earlier day, has yet to show.
 */
const NEED_GAIN = 0.5;
/**
 * The skills a session has words show (ADR 0101): typing a word met on an earlier day that has not
 * shown it can be produced, and hearing one that has not shown it is heard (where the course's voice
 * may be relied on). These are the hardest cards, which the calibration alone rarely picks, so each
 * session spreads a few through it and balances them with the rest: this share of the session for a
 * skill whose cards predict at least SKILL_EASY for this learner, one for a skill they find harder.
 * Each comes in only where the session can still reach the target success with it (the cards
 * chosen, the gentlest such card, the easiest of the rest): a session the rest cannot balance gets
 * fewer, and a learner who struggles is not pushed into them yet.
 */
const SKILL_SHARES: readonly { readonly facet: Facet; readonly share: number }[] = [
  { facet: "produce", share: 0.2 },
  { facet: "listen", share: 0.15 },
];
const SKILL_EASY = 0.65;

/**
 * Sentences a lesson may lean on (ADR 0101): the BALANCE_SENTENCES earlier sentences whose words the
 * learner recognizes best, offered as review beside those picked by need. Their cards gain little,
 * so the calibration picks them only to bring a lesson that runs hard back toward its target: the
 * extra repetition a learner who struggles needs, and room for the cards that have words show
 * their skills.
 */
const BALANCE_SENTENCES = 3;

/** The earlier sentences whose words this learner recognizes best now, leaving out `taken`. */
const wellKnownSentences = (
  past: readonly BundleSentence[],
  taken: readonly BundleSentence[],
  seen: ReadonlySet<string>,
  recall: (kc: string) => number,
): readonly BundleSentence[] =>
  past
    .filter((s) => s.kcs.length > 0 && !taken.includes(s) && s.kcs.every((kc) => seen.has(kc)))
    .map((s) => ({ s, r: s.kcs.reduce((a, kc) => a + recall(kc), 0) / s.kcs.length }))
    .sort((a, b) => b.r - a.r)
    .slice(0, BALANCE_SENTENCES)
    .map((x) => x.s);

/** The skills (card keys) that words met before `today` have yet to show and may show today (ADR 0100). */
const skillNeeds = (course: CourseView, state: LearnerState, today: string): ReadonlySet<string> => {
  const asked = skillsAsked(course);
  const out = new Set<string>();
  for (const [kc, met] of Object.entries(state.met)) {
    if (met >= today) continue;
    for (const skill of asked(kc)) {
      const k = cardKey(kc, skill, course.orthography);
      if (state.shown[k] === undefined && (state.missed[k] ?? "") < today) out.add(k);
    }
  }
  return out;
};

/**
 * The earlier sentences a lesson brings back (ADR 0097), from the lessons before it on the path (a
 * later lesson's sentence is new, whatever its words): chosen greedily by the due words they would
 * practise, the most forgotten first (desired retention minus recall, per due recognize or produce
 * card), and the skills their words have yet to show (NEED_GAIN each, ADR 0101), each card counted
 * once. So review goes where it is needed, across every unit, never to the course's first sentences
 * because their common words are always due somewhere; and a sentence just reviewed is no longer
 * due, so it does not come back lesson after lesson.
 */
const reviewSentences = (
  course: CourseView,
  past: readonly BundleSentence[],
  seen: ReadonlySet<string>,
  due: ReadonlyMap<string, number>,
  needs: ReadonlySet<string>,
  desired: number,
  key: (kc: string, facet: Facet) => string,
  count = REVIEW_SENTENCES,
): readonly BundleSentence[] => {
  const worth = (k: string): number => (due.has(k) ? desired - (due.get(k) ?? desired) : 0) + (needs.has(k) ? NEED_GAIN : 0);
  // Each sentence's cards that need review, worked out once.
  const pool = past
    .filter((s) => s.kcs.length > 0 && s.kcs.every((kc) => seen.has(kc)))
    .map((s) => ({ s, cards: s.kcs.flatMap((kc) => [key(kc, "recognize"), key(kc, "produce"), key(kc, "listen")]).filter((k) => due.has(k) || needs.has(k)) }))
    .filter((x) => x.cards.length > 0);
  const covered = new Set<string>();
  const need = (cards: readonly string[]): number => cards.reduce((sum, k) => (covered.has(k) ? sum : sum + worth(k)), 0);
  const picked: BundleSentence[] = [];
  const taken = new Set<BundleSentence>();
  while (picked.length < count) {
    let best: (typeof pool)[number] | undefined;
    let most = 0;
    for (const x of pool) {
      if (taken.has(x.s)) continue;
      const n = need(x.cards);
      if (n > most + 1e-12) [best, most] = [x, n];
    }
    if (best === undefined) break;
    picked.push(best.s);
    taken.add(best.s);
    for (const k of best.cards) covered.add(k);
  }
  return picked;
};

/** Pronunciation cards (ADR 0054): a word's vowel marks or its reading. */
const PRONOUNCE: ReadonlySet<TemplateId> = new Set<TemplateId>(["vocalize", "transcribe"]);

// On a script track (ADR 0088), a new letter is read before it is written.
const RECOGNITION = new Set<TemplateId>(["select-image", "match-pairs", "choose-translation", "translate-tap.l2-l1", "translate-tap.l1-l2", "letter-read", "letter-pairs", "word-read"]);

/** p̂ for an exercise in this state, in the course's orthography, at `now`. */
export const predictExercise = (state: LearnerState, ex: Exercise, orthography: string, now: string): number => {
  const facet = facetOf(ex.template);
  // Recall of what the answer is credited to: a blank's word, not the sentence shown around it.
  return predict(state.performance, { template: ex.template, facet, item: ex.item, kcs: ex.kcs, r: meanRetrievability(state, creditedKcs(ex), facet, orthography, now) });
};

/** A KC is seen once any of its facets has a card. */
const seenKcs = (state: LearnerState): ReadonlySet<string> => new Set(Object.keys(state.cards).map((k) => parseCardKey(k).kc));

/**
 * Due facets (R < desired retention) of seen KCs, most forgotten first. Script
 * facets count only in the orthography being learned.
 */
export const dueFacets = (state: LearnerState, orthography: string, now: string, desired = DESIRED_RETENTION): readonly { readonly key: string; readonly r: number }[] =>
  Object.keys(state.cards)
    .flatMap((key) => {
      const ref = parseCardKey(key);
      if (ref.orthography !== undefined && ref.orthography !== orthography) return [];
      return [{ key, r: retrievability(state, ref.kc, ref.facet, orthography, now) }];
    })
    .filter((f) => f.r < desired)
    .sort((a, b) => a.r - b.r || (a.key < b.key ? -1 : 1));

/** What plans leave out: the caller's exclusions, the speech support's, and the course's (facets, voice). */
const exclusionsOf = (course: CourseView, options: { readonly exclude?: ReadonlySet<TemplateId> | undefined; readonly speech?: SpeechSupport | undefined }): ReadonlySet<TemplateId> =>
  new Set([...(options.exclude ?? []), ...speechExclusions(options.speech), ...courseExclusions(course)]);

/**
 * The open mistakes rebuilt as their exercises, most recent first: those whose template is not
 * excluded, whose item the course still makes that exercise from, and whose KCs are all seen.
 */
const mistakeExercises = (ctx: MakeContext, state: LearnerState, exclude: ReadonlySet<TemplateId>, seen: ReadonlySet<string>): Exercise[] => {
  const byId = new Map(allSentences(ctx.course).map((s) => [s.id, s]));
  const kcById = new Map(allKcs(ctx.course).map((k) => [k.id as string, k]));
  const out: Exercise[] = [];
  for (const m of [...state.mistakes].reverse()) {
    if (exclude.has(m.template)) continue;
    const s = byId.get(m.item);
    const kc = kcById.get(m.item);
    const ex = s !== undefined ? SENTENCE_TEMPLATES[m.template]?.(ctx, s) : kc !== undefined ? KC_TEMPLATES[m.template]?.(ctx, kc) : undefined;
    if (ex !== undefined && ex.kcs.every((k) => seen.has(k)) && !out.some((e) => e.id === ex.id)) out.push(ex);
  }
  return out;
};

/**
 * The open mistakes a mistakes session can practise now, most recent first. A mistake is left
 * out while its template is (a listening or speaking break, speech the app cannot score, a facet
 * the course does not practise), once the course no longer makes it (its item was removed or
 * changed), or while it needs a word this learner has not seen. Count these, not
 * `state.mistakes`: a session plans from exactly these (at most ten at a time).
 */
export const practicableMistakes = (
  course: CourseView,
  state: LearnerState,
  options: { readonly exclude?: ReadonlySet<TemplateId> | undefined; readonly speech?: SpeechSupport | undefined } = {},
): readonly Exercise[] => mistakeExercises({ course, rng: seededRng(1), introduced: [] }, state, exclusionsOf(course, options), seenKcs(state));

const candidatesFor = (ctx: MakeContext, sentences: readonly BundleSentence[], kcs: readonly BundleKc[], exclude: ReadonlySet<TemplateId>): Exercise[] => {
  const out: Exercise[] = [];
  const ids = new Set<string>();
  const add = (ex: Exercise | undefined): void => {
    if (ex === undefined || exclude.has(ex.template) || ids.has(ex.id)) return;
    ids.add(ex.id);
    out.push(ex);
  };
  if (!exclude.has("select-image")) for (const kc of kcs) add(makeSelectImage(ctx, kc));
  for (const kc of kcs) for (const make of KC_LISTENING) add(make(ctx, kc));
  if (!exclude.has("match-pairs") && kcs.length >= 3) add(makeMatchPairs(ctx, kcs));
  for (const s of sentences) {
    for (const [template, make] of Object.entries(SENTENCE_TEMPLATES)) {
      if (!exclude.has(template as TemplateId)) add(make(ctx, s));
    }
  }
  return out;
};

/**
 * Whether the course can plan this request. A lesson request names one of the course's lesson or
 * script nodes; an old link may name one a newer course no longer has, which `plan` refuses.
 */
export const plannable = (course: CourseView, request: SessionRequest): boolean =>
  request.mode !== "lesson" || scriptNodes(course).some((n) => n.node.id === request.node) || lessonNodes(course).some((n) => n.node.id === request.node);

export const plan = (course: CourseView, state: LearnerState, request: SessionRequest, options: PlanOptions): SessionPlan => {
  const rng = seededRng(options.seed);
  const target = options.targetSuccess ?? 0.85;
  const desired = options.desiredRetention ?? DESIRED_RETENTION;
  const exclude = exclusionsOf(course, options);
  const { now } = options;
  const orthography = course.orthography;
  if (request.mode === "placement") {
    const placement = placementTest(course, options.seed, exclude);
    const all = placement.test.blocks.flatMap((b) => [...b.exercises, ...b.steps.map((s) => s.exercise)]);
    const predictions: Record<string, number> = Object.fromEntries(all.map((ex) => [ex.id, predictExercise(state, ex, orthography, now)]));
    const exercises = runTest(placement.test, new Map()).next;
    return { request, exercises, predictions: exercises.map((ex) => predictions[ex.id] as number), planner: PLANNER, placement: { ...placement, predictions } };
  }
  const key = (kc: string, facet: Facet): string => cardKey(kc, facet, orthography);
  const seen = seenKcs(state);
  const due = new Map(dueFacets(state, orthography, now, desired).map((f) => [f.key, f.r]));
  // Skills words have yet to show (ADR 0100, 0101), and the words to type: a mistakes session
  // practises its mistakes only.
  const needs = request.mode === "mistakes" ? new Set<string>() : skillNeeds(course, state, options.today ?? now.slice(0, 10));
  const focus = new Set([...needs].flatMap((k) => (parseCardKey(k).facet === "produce" ? [parseCardKey(k).kc] : [])));

  // ---- 1–2. targets and candidates
  let introduced: readonly KcId[] = [];
  // Items a lesson brings back for review (ADR 0097): their cards are capped and marked.
  const reviewItems = new Set<string>();
  let pool: Exercise[];
  let size: number;
  const script = request.mode === "lesson" ? scriptNodes(course).find((n) => n.node.id === request.node) : undefined;
  if (script !== undefined) {
    // A script track's node (ADR 0088): its letters and words, nothing else.
    introduced = script.node.introduces;
    pool = [...scriptCandidates({ course, rng, introduced }, script, exclude)];
    size = options.size ?? 10;
  } else if (request.mode === "lesson") {
    const found = lessonNodes(course).find((n) => n.node.id === request.node);
    if (found === undefined) throw new Error(`no lesson node ${request.node} in ${course.id}`);
    const { unit, node } = found;
    introduced = node.introduces;
    const ctx: MakeContext = { course, rng, introduced, focus };
    const fresh = node.introduces.flatMap<BundleKc>((id) => allKcs(course).find((k) => k.id === id) ?? []);
    const pairsPool = fresh.length >= 3 ? fresh : [...fresh, ...unit.kcs.filter((k) => !fresh.includes(k) && seen.has(k.id))];
    const own = sentencesOf(course, unit, node);
    // Interleave: the earlier sentences that need review most (ADR 0097), marked as review.
    const lessons = lessonNodes(course);
    const past = lessons.slice(0, lessons.indexOf(found)).flatMap((n) => sentencesOf(course, n.unit, n.node));
    const picked = reviewSentences(course, past, seen, due, needs, desired, key);
    const earlier = [...picked, ...wellKnownSentences(past, picked, seen, (kc) => retrievability(state, kc, "recognize", orthography, now))];
    for (const s of earlier) reviewItems.add(s.id);
    // Earlier words to be heard (ADR 0101): a word's own clip is the gentlest way to show it.
    const unheard = allKcs(course).filter((k) => needs.has(key(k.id, "listen")) && !node.introduces.includes(k.id));
    const hearing = unheard.flatMap((kc) => KC_LISTENING.flatMap((make) => make(ctx, kc) ?? [])).filter((ex) => !exclude.has(ex.template));
    for (const ex of hearing) reviewItems.add(ex.item);
    pool = [...candidatesFor(ctx, own, pairsPool, exclude), ...candidatesFor(ctx, earlier, [], exclude), ...hearing];
    size = options.size ?? Math.min(14, Math.max(10, own.length * 2));
  } else if (request.mode === "review") {
    const ctx: MakeContext = { course, rng, introduced: [], focus };
    const studied = allSentences(course).filter((s) => s.forms[course.orthography] !== undefined && s.kcs.length > 0 && s.kcs.every((kc) => seen.has(kc)));
    // How much each word needs review: how far its due cards have fallen, and the skills it lacks.
    const worth = new Map<string, number>();
    for (const [k, r] of due) worth.set(parseCardKey(k).kc, (worth.get(parseCardKey(k).kc) ?? 0) + (desired - r));
    for (const k of needs) worth.set(parseCardKey(k).kc, (worth.get(parseCardKey(k).kc) ?? 0) + NEED_GAIN);
    size = options.size ?? Math.max(REVIEW_SESSION_MIN, Math.min(REVIEW_SESSION_MAX, worth.size));
    const neediest = new Set([...worth].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 3 * size).map(([kc]) => kc));
    const picked = reviewSentences(course, studied, seen, due, needs, desired, key, 2 * size);
    const recall = (kc: string): number => retrievability(state, kc, "recognize", orthography, now);
    const sentences = [...picked, ...wellKnownSentences(studied, picked, seen, recall)];
    // Due facets have the highest gain; the well-known sentences are what the calibration can pick
    // to keep the session near the target success rate.
    pool = candidatesFor(ctx, sentences, allKcs(course).filter((k) => seen.has(k.id) && neediest.has(k.id)), exclude);
  } else {
    pool = mistakeExercises({ course, rng, introduced: [] }, state, exclude, seen);
    size = Math.min(options.size ?? 10, pool.length);
  }

  // i+1 at runtime: every KC that is not new in this lesson has been seen.
  const targets = new Set(introduced);
  const admissible = pool.filter((ex) => ex.kcs.every((kc) => targets.has(kc) || seen.has(kc)));
  const candidates: Candidate[] = admissible.map((ex, order) => ({ ex, p: predictExercise(state, ex, orthography, now), order }));

  // ---- 3–4. greedy selection
  const chosen: Candidate[] = [];
  const covered = new Set<string>(); // (KC, facet) exercised so far in this plan
  const recognized = new Set<string>(); // new KCs recognized so far in this plan
  const gain = (c: Candidate): number => {
    const facet = facetOf(c.ex.template);
    // What the answer is credited to: a blank's word, a pronunciation card's word, else every KC.
    const parts = creditedKcs(c.ex).map((kc) => {
      const k = key(kc, facet);
      // A word met in this lesson is first recognized; producing it counts once it is shown in a later
      // session (D2), so here it is worth no more than any other new card.
      const fresh = targets.has(kc) ? (facet === "produce" ? 0.5 : 1) : 0.5;
      const base = state.cards[k] === undefined ? fresh : due.has(k) ? 0.6 + (desired - (due.get(k) ?? 0)) : 0.15;
      // A skill the word has yet to show (ADR 0101) is worth more, once a session.
      return covered.has(k) ? base * 0.3 : base + (needs.has(k) ? NEED_GAIN : 0);
    });
    return parts.length === 0 ? 0 : parts.reduce((a, b) => a + b, 0) / parts.length;
  };
  // Whether the session runs well under the target success so far (self-rated speaking aside).
  const struggling = (): boolean => {
    const counted = chosen.filter((x) => x.ex.template !== "speak.tier-0");
    const meanP = counted.length === 0 ? target : counted.reduce((a, x) => a + x.p, 0) / counted.length;
    return meanP < target - REVIEW_SHORTFALL;
  };
  // A lesson's review is a small share of its cards (ADR 0097, D1), more while the lesson runs short
  // of the target success.
  const reviewCap = (): number => Math.max(1, Math.floor(size * (struggling() ? REVIEW_SHARE_STRUGGLING : REVIEW_SHARE)));
  // A card that has a word show a skill it lacks (ADR 0101): of that facet, credited to such a word
  // not yet exercised so in this plan.
  const shows = (c: Candidate, facet: Facet): boolean => facetOf(c.ex.template) === facet && creditedKcs(c.ex).some((kc) => needs.has(key(kc, facet)) && !covered.has(key(kc, facet)));
  // How many a session: a share for a skill this learner does well, one for a skill they find hard.
  const quotas = SKILL_SHARES.flatMap(({ facet, share }) => {
    const ps = candidates.filter((c) => shows(c, facet)).map((c) => c.p);
    const words = [...needs].filter((k) => parseCardKey(k).facet === facet).length;
    if (ps.length === 0 || words === 0) return [];
    const easy = ps.reduce((a, b) => a + b, 0) / ps.length >= SKILL_EASY;
    return [{ facet, quota: easy ? Math.min(words, Math.max(1, Math.round(size * share))) : 1, picked: 0 }];
  });
  const quota = quotas.reduce((a, q) => a + q.quota, 0);
  const allowed = (c: Candidate): boolean => {
    const same = chosen.filter((x) => x.ex.template === c.ex.template).length;
    if (same >= (MAX_PER_TEMPLATE[c.ex.template] ?? MAX_PER_TEMPLATE_DEFAULT)) return false;
    if (reviewItems.has(c.ex.item) && chosen.filter((x) => reviewItems.has(x.ex.item)).length >= reviewCap()) return false;
    if (RECOGNITION.has(c.ex.template)) return true;
    // A new KC is recognized before it is produced or read. A pronunciation card asks about one word
    // of its sentence (ADR 0095): that word must have been recognized; the rest is context.
    const gated = PRONOUNCE.has(c.ex.template) || c.ex.template === "char-read" ? (askedKcs(c.ex) ?? c.ex.kcs) : c.ex.kcs;
    return gated.every((kc) => !targets.has(kc) || recognized.has(kc) || state.cards[key(kc, "recognize")] !== undefined);
  };
  // Aim the session's mean p̂ at the target (§9.4): easy and hard items can balance each other.
  // A self-rated speaking card is no verdict (L6): it neither pulls the session's mean p̂ toward the
  // target nor away, so the calibration never reaches for it as an easy card.
  const selfRated = (c: Candidate): boolean => c.ex.template === "speak.tier-0";
  const score = (c: Candidate): number => {
    const counted = chosen.filter((x) => !selfRated(x));
    const sumP = counted.reduce((a, x) => a + x.p, 0);
    const meanP = selfRated(c) ? (counted.length === 0 ? target : sumP / counted.length) : (sumP + c.p) / (counted.length + 1);
    const calibration = -CALIBRATION_WEIGHT * Math.abs(meanP - target) - (selfRated(c) ? 0 : 2 * Math.abs(c.p - target));
    const sameTemplate = chosen.filter((x) => x.ex.template === c.ex.template).length;
    const sameItem = chosen.filter((x) => x.ex.item === c.ex.item).length;
    const newCoverage = c.ex.kcs.some((kc) => targets.has(kc) && !recognized.has(kc)) && RECOGNITION.has(c.ex.template) ? 0.4 : 0;
    return gain(c) + newCoverage + calibration - 0.15 * sameTemplate - 0.5 * sameItem;
  };
  // Whether the session can take a card of this skill and still come near its target: the cards
  // chosen, the gentlest such card, and the easiest of the rest for the places left (self-rated
  // speaking aside).
  const affordable = (facet: Facet, remaining: readonly Candidate[]): boolean => {
    const open = remaining.filter((c) => allowed(c) && !selfRated(c));
    const gentlest = open.filter((c) => shows(c, facet)).sort((a, b) => b.p - a.p)[0];
    if (gentlest === undefined) return false;
    const counted = chosen.filter((x) => !selfRated(x));
    const rest = open
      .filter((c) => c !== gentlest)
      .map((c) => c.p)
      .sort((a, b) => b - a)
      .slice(0, Math.max(0, size - chosen.length - 1));
    const sum = counted.reduce((a, x) => a + x.p, 0) + gentlest.p + rest.reduce((a, p) => a + p, 0);
    return sum / (counted.length + 1 + rest.length) >= target;
  };
  // Every new KC is presented in its lesson (a hard constraint): while a new KC an allowed exercise
  // can present is not yet in the plan, only such exercises qualify (new words first, as ordered
  // below); the scores choose among them, and then fill the session. A card presents the words it
  // is credited to: a word that is only the context of a pronunciation card's word gets no card of
  // its own from it, so it is not presented there.
  const presents = (c: Candidate): readonly KcId[] => creditedKcs(c.ex);
  const presentable = new Set(candidates.flatMap((c) => presents(c).filter((kc) => targets.has(kc))));
  const presented = new Set<string>();
  const remaining = [...candidates];
  const showing = new Set<Candidate>();
  while (chosen.length < size && remaining.length > 0) {
    const missing = [...presentable].filter((kc) => !presented.has(kc));
    const mustPresent = missing.length > 0 && remaining.some((c) => allowed(c) && presents(c).some((kc) => missing.includes(kc)));
    // Once new words are presented, at each spread-out place a card that has a word show a skill it
    // lacks (ADR 0101): of the skill furthest from its quota.
    const shown = quotas.reduce((a, q) => a + q.picked, 0);
    const slot = !mustPresent && shown < quota && chosen.length >= Math.floor(((shown + 1) * size) / (quota + 1));
    const owed = slot
      ? quotas.filter((q) => q.picked < q.quota && affordable(q.facet, remaining)).sort((a, b) => a.picked / a.quota - b.picked / b.quota)[0]
      : undefined;
    let best = -1;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const [i, c] of remaining.entries()) {
      if (!allowed(c)) continue;
      if (mustPresent && !presents(c).some((kc) => missing.includes(kc))) continue;
      if (owed !== undefined && !shows(c, owed.facet)) continue;
      const s = score(c);
      if (s > bestScore + 1e-12) {
        best = i;
        bestScore = s;
      }
    }
    if (best < 0) break;
    const [pick] = remaining.splice(best, 1);
    if (pick === undefined) break;
    for (const q of quotas)
      if (shows(pick, q.facet)) {
        q.picked += 1;
        showing.add(pick);
      }
    chosen.push(pick);
    const facet = facetOf(pick.ex.template);
    for (const kc of presents(pick)) presented.add(kc);
    if (RECOGNITION.has(pick.ex.template)) for (const kc of pick.ex.kcs) if (targets.has(kc)) recognized.add(kc);
    for (const kc of creditedKcs(pick.ex)) covered.add(key(kc, facet));
  }

  // A word's pronunciation as its script leaves it out, in its sentence (ADR 0054, 0095): one card a
  // lesson where the course can make one (a hard card, which the calibration alone rarely picks). When
  // the plan is full, it takes the place of the last card no new word depends on.
  if (request.mode === "lesson" && !chosen.some((c) => PRONOUNCE.has(c.ex.template))) {
    const pick = remaining.filter((c) => PRONOUNCE.has(c.ex.template) && allowed(c)).sort((a, b) => score(b) - score(a) || a.order - b.order)[0];
    if (pick !== undefined) {
      const presentedBy = (kc: KcId, except: Candidate): boolean => chosen.some((c) => c !== except && presents(c).includes(kc));
      const spare = [...chosen].reverse().find((c) => !showing.has(c) && presents(c).every((kc) => !targets.has(kc) || presentedBy(kc, c)));
      if (chosen.length < size) chosen.push(pick);
      else if (spare !== undefined) chosen.splice(chosen.indexOf(spare), 1, pick);
    }
  }

  // ---- 5. end on a likely success
  if (chosen.length > 2) {
    const tail = chosen.slice(-3);
    const easiest = tail.reduce((a, b) => (b.p > a.p ? b : a));
    chosen.splice(chosen.indexOf(easiest), 1);
    chosen.push(easiest);
  }
  const marked = (ex: Exercise): Exercise => (reviewItems.has(ex.item) ? { ...ex, review: true } : ex);
  return { request, exercises: chosen.map((c) => marked(c.ex)), predictions: chosen.map((c) => c.p), planner: PLANNER };
};
