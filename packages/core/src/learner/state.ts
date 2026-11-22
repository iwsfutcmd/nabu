/**
 * Learner state as a projection of the event log (gameplan §1 decision 5):
 * FSRS cards per part and skill (ADR 0146), the performance model, XP, path
 * progress and open mistakes. `replay` is a pure fold: the same events, in any
 * order and with any duplicates, give the same state. It reads one shape of
 * event (schema 2): an older log is upgraded before it is folded (upgrade.ts).
 */
import type { AnswerSubmitted, DisplayedLexeme, ExerciseSkipped, FormKey, LearnerEvent, LexemeId, PartCredit, Question, SessionCompleted, Skill, UdFeatures } from "@nabu/schema";
import { createEmptyCard, fsrs, generatorParameters, Rating as FsrsRating, type Card, type FSRS, type Grade } from "ts-fsrs";
import type { SkillRef, TemplateId } from "../lesson/exercise.ts";
import { kindOf, lexemeFormKey } from "../lesson/lexemes.ts";
import { asksOf, skillOf, SPEAKING, TEMPLATES } from "../lesson/templates.ts";
import { ratingOf, type Pace, type Rating } from "./credit.ts";
import { initialPerformance, learn, type Performance, type PerformanceDraft } from "./performance.ts";
import { withRevisions } from "./revisions.ts";

/** An FSRS card as plain JSON: dates as ISO strings. */
export interface StoredCard {
  readonly due: string;
  readonly stability: number;
  readonly difficulty: number;
  readonly elapsed_days: number;
  readonly scheduled_days: number;
  readonly learning_steps: number;
  readonly reps: number;
  readonly lapses: number;
  readonly state: number;
  readonly last_review?: string | undefined;
}

export interface Mistake {
  readonly item: string;
  readonly template: TemplateId;
  readonly at: string;
  /**
   * The word the card asked about, where it asked about one word of its sentence (a blank, a word's
   * marks or reading): the parts its answer credited, sorted. A mistakes session asks that word again,
   * and only an answer about it closes the mistake. Absent where the card asked the whole sentence.
   */
  readonly ask?: readonly string[];
  /**
   * What a fill-in (gap-fill) asked of that word (ADR 0132): which lexeme (`ask` is its base) or
   * which form (`ask` is what its form credits). It is asked again as the same question, and only an
   * answer to that question closes it. Absent on other cards, and on a fill-in's mistake from before
   * ADR 0132, whose `ask` is everything the word carried.
   */
  readonly asks?: Question;
}

/**
 * The word an answer was about (`Mistake.ask`): the parts credited right or wrong, where the rest of
 * the sentence was given; undefined where nothing the card could ask was given (the whole sentence
 * was asked: a part it cannot show, such as a lexeme's own gender, is always given).
 */
export const askOf = (credits: readonly PartCredit[]): readonly string[] | undefined =>
  credits.some((c) => c.status === "given" && !c.part.includes("|")) ? [...new Set(credits.filter((c) => c.status !== "given").map((c) => String(c.part)))].sort() : undefined;

/** Whether two mistakes ask the same thing: the same word, or both the whole sentence. */
export const sameAsk = (a: readonly string[] | undefined, b: readonly string[] | undefined): boolean =>
  a === undefined || b === undefined ? a === b : a.length === b.length && a.every((part, i) => part === b[i]);

/**
 * Whether an answer (its `ask` and `asks`) is about what a mistake asked: the same word and, for a
 * fill-in, the same question (ADR 0132). A fill-in's mistake from before ADR 0132 asked the word and
 * its form at once: an answer to either question about that word closes it.
 */
export const sameQuestion = (mistake: Pick<Mistake, "ask" | "asks">, ask: readonly string[] | undefined, asks: Question | undefined): boolean => {
  if (mistake.asks === undefined && asks !== undefined) {
    const before = mistake.ask;
    return before !== undefined && ask !== undefined && ask.length > 0 && ask.every((part) => before.includes(part));
  }
  return mistake.asks === asks && sameAsk(mistake.ask, ask);
};

export interface LearnerState {
  readonly cards: Readonly<Record<string, StoredCard>>;
  readonly performance: Performance;
  readonly xp: { readonly total: number; readonly byDate: Readonly<Record<string, number>> };
  readonly completedNodes: readonly string[];
  readonly mistakes: readonly Mistake[];
  /**
   * Recent first-try answer times per template, per unit of length (ms per (PACE_OVERHEAD + parts)): the
   * learner's usual, which an answer's pace is judged against (§9.2, ADR 0096).
   */
  readonly latencies: Readonly<Partial<Record<TemplateId, readonly number[]>>>;
  /** Cards already rated in the current session: each at most once per session (§9.2). */
  readonly rated: { readonly session: string; readonly keys: readonly string[] };
  /** Known words (ADR 0100): the local date each part was first met (its first answer). */
  readonly met: Readonly<Record<string, string>>;
  /**
   * Known words (ADR 0100): the local date each skill (a recognize, produce or listen card of a
   * lexeme; a feature value read off or chosen) was last shown: a first try right, not self-rated,
   * on a later day than the part was met and than the skill was last missed. A miss takes it away. A
   * word's reading (read-script, a reading card) is witnessed the same way (ADR 0131): its ruby
   * fades once shown, though no word needs it to be known.
   */
  readonly shown: Readonly<Record<string, string>>;
  /** The local date each skill was last missed (a first try wrong, or the answer revealed). */
  readonly missed: Readonly<Record<string, string>>;
  /**
   * The last RECENT_WINDOW graded first tries, right or not, oldest first (self-ratings left out, a
   * revealed answer counted as missed): how recent practice went, for the learning pace (ADR 0105).
   */
  readonly recent: readonly boolean[];
  /**
   * Misses per correspondence (ADR 0148, "A letter's rule is counted, not scheduled"): by its id
   * (`<orthography>:<id>`, an answer's `outcome.correspondences`), how many answers not accepted
   * missed it and when the last did. Counted, never scheduled: no card, no memory.
   */
  readonly letters: Readonly<Record<string, LetterMisses>>;
  /**
   * The pairs the learner has seen (ADR 0146: seen is the app's doing): for each lexeme, each form a
   * card or a story line displayed it in (`lexemeFormKey`), with the local date it was first
   * displayed. A record of exposure, not a memory: no card, no schedule, nothing due. Only events
   * that say what they displayed count (`displayed`): nothing logged before seen was logged does.
   */
  readonly seen: Readonly<Record<LexemeId, Readonly<Record<FormKey, string>>>>;
}

/** How often a correspondence was missed, and when last (an answer's device time). */
export interface LetterMisses {
  readonly missed: number;
  readonly last: string;
}

/** How many graded first tries the learning pace looks back over (ADR 0105): about four sessions. */
export const RECENT_WINDOW = 60;

export const DESIRED_RETENTION = 0.9;
/**
 * XP as the game's default rules pay it (ADR 0107; the game projection is the one the app shows): a
 * point a right answer; a point a card for a finished session, up to `session`; `perfect` more for a
 * session of at least `perfectFrom` cards all right the first time; a lesson done before, its answers only.
 */
export const XP = { answer: 1, session: 10, perfect: 5, perfectFrom: 5 } as const;
const LATENCY_WINDOW = 25;
/**
 * Pace (ADR 0096). An answer's time is compared per unit of length, its parts plus a fixed part for
 * reading the card and deciding (PACE_OVERHEAD parts' worth), against the learner's usual for the
 * template: more than PACE_SLOW times it is slow (Hard), at most PACE_FAST times it is fast (Easy
 * on a typed card already sure). Being slower than one's own median, as before, made half of all
 * right answers Hard.
 */
const PACE_OVERHEAD = 2;
const PACE_SLOW = 2;
const PACE_FAST = 0.5;
/** Easy only for a card this sure before the answer: a new or fading card earns Good at most. */
const EASY_RECALL = 0.9;
const STORY_TEMPLATES: ReadonlySet<TemplateId> = new Set(["story-choose", "story-complete", "story-arrange"]);
const MISTAKES_KEPT = 50;

export const emptyLearnerState = (): LearnerState => ({
  cards: {},
  performance: initialPerformance(),
  xp: { total: 0, byDate: {} },
  completedNodes: [],
  mistakes: [],
  latencies: {},
  rated: { session: "", keys: [] },
  met: {},
  shown: {},
  missed: {},
  recent: [],
  letters: {},
  seen: {},
});

/**
 * Skills keyed to the language are shared by every orthography of a course;
 * read-script and write-script are tracked per orthography (§6.3), so switching
 * scripts keeps what was learned about the language.
 */
export const SCRIPT_FACETS: ReadonlySet<Skill> = new Set<Skill>(["read-script", "write-script"]);

/** Every skill a card is kept by (ADR 0146): the six facets, and a feature value chosen or read off. */
export const SKILLS: ReadonlySet<string> = new Set<Skill>(["recognize", "produce", "listen", "speak", "read-script", "write-script", "choose", "read-off"]);

/**
 * The card of a part and a skill: "part|skill", or "part|skill|orthography" for a script facet; a
 * reading in one of several traditions (ADR 0138) is "part|read-script|orthography|tradition".
 */
export const cardKey = (part: string, skill: Skill, orthography: string, reading?: string): string =>
  !SCRIPT_FACETS.has(skill) ? `${part}|${skill}` : skill === "read-script" && reading !== undefined ? `${part}|${skill}|${orthography}|${reading}` : `${part}|${skill}|${orthography}`;

export interface CardRef {
  readonly part: string;
  readonly skill: Skill;
  readonly orthography?: string | undefined;
  /** The reading tradition of a read-script card, where its orthography has several (ADR 0138). */
  readonly reading?: string | undefined;
}

/**
 * A card key's part and skill. A part may hold a bar itself (lexeme:mano|Gender): the skill is the
 * first segment after the part's first that names one.
 */
export const parseCardKey = (key: string): CardRef => {
  const segments = key.split("|");
  const found = segments.findIndex((segment, i) => i > 0 && SKILLS.has(segment));
  const at = found < 0 ? 1 : found;
  const orthography = segments[at + 1];
  const reading = segments[at + 2];
  return { part: segments.slice(0, at).join("|"), skill: (segments[at] ?? "") as Skill, orthography, ...(reading === undefined ? {} : { reading }) };
};

const scheduler: FSRS = fsrs(generatorParameters({ request_retention: DESIRED_RETENTION, enable_fuzz: false }));

const toCard = (c: StoredCard): Card => {
  const { last_review, ...rest } = c;
  return last_review === undefined ? { ...rest, due: new Date(c.due) } : { ...rest, due: new Date(c.due), last_review: new Date(last_review) };
};

const fromCard = (c: Card): StoredCard => ({
  due: c.due.toISOString(),
  stability: c.stability,
  difficulty: c.difficulty,
  elapsed_days: c.elapsed_days,
  scheduled_days: c.scheduled_days,
  learning_steps: c.learning_steps,
  reps: c.reps,
  lapses: c.lapses,
  state: c.state,
  last_review: c.last_review?.toISOString(),
});

/** FSRS retrievability of a part by a skill in an orthography (and reading tradition, ADR 0138) at `now`: 0 when never practised. */
export const retrievability = (state: LearnerState, part: string, skill: Skill, orthography: string, now: string, reading?: string): number => {
  const card = state.cards[cardKey(part, skill, orthography, reading)];
  return card === undefined ? 0 : scheduler.get_retrievability(toCard(card), new Date(now), false);
};

/** The mean of it over parts, each by its own skill. */
export const meanRetrievability = (state: LearnerState, refs: readonly SkillRef[], orthography: string, now: string, reading?: string): number =>
  refs.length === 0 ? 0 : refs.reduce((sum, ref) => sum + retrievability(state, ref.part, ref.skill, orthography, now, reading), 0) / refs.length;

const GRADES: Readonly<Record<Rating, Grade>> = { again: FsrsRating.Again, hard: FsrsRating.Hard, good: FsrsRating.Good, easy: FsrsRating.Easy };

const median = (xs: readonly number[]): number | undefined => {
  if (xs.length < 5) return undefined;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

/**
 * Mutable working copy used inside one fold: a deep copy of the state it starts from, changed in
 * place event by event (ADR 0119), and handed back as the new state when the fold is done.
 */
interface Draft {
  cards: Record<string, StoredCard>;
  performance: PerformanceDraft;
  xp: { total: number; byDate: Record<string, number> };
  completedNodes: string[];
  mistakes: Mistake[];
  latencies: Partial<Record<TemplateId, number[]>>;
  rated: { session: string; keys: string[] };
  met: Record<string, string>;
  shown: Record<string, string>;
  missed: Record<string, string>;
  recent: boolean[];
  letters: Record<string, { missed: number; last: string }>;
  seen: Record<LexemeId, Record<FormKey, string>>;
}

const draftOf = (s: LearnerState): Draft => structuredClone(s) as Draft;

const addXp = (d: Draft, date: string, amount: number): void => {
  d.xp.total += amount;
  d.xp.byDate[date] = (d.xp.byDate[date] ?? 0) + amount;
};

const rate = (d: Draft, e: AnswerSubmitted | ExerciseSkipped, part: string, skill: Skill, rating: Rating): void => {
  const { session, clientTime: at } = e;
  if (d.rated.session !== session) d.rated = { session, keys: [] };
  const key = cardKey(part, skill, e.orthography, e.exercise.reading);
  if (d.rated.keys.includes(key)) return; // within-session repetitions are learning steps
  d.rated.keys.push(key);
  const now = new Date(at);
  const card = d.cards[key] === undefined ? createEmptyCard(now) : toCard(d.cards[key]);
  // Easy is for recall that was already sure (ADR 0096): a new or fading card earns Good at most.
  const sure = d.cards[key] !== undefined && scheduler.get_retrievability(card, now, false) >= EASY_RECALL;
  const grade = rating === "easy" && !sure ? "good" : rating;
  d.cards[key] = fromCard(scheduler.next(card, now, GRADES[grade]).card);
};

/**
 * The skills a part is known by (ADR 0100, 0146): a lexeme by recognizing it, producing it and
 * hearing it; a feature value by reading it off a form and choosing it.
 */
export const SKILL_FACETS: ReadonlySet<Skill> = new Set<Skill>(["recognize", "produce", "listen", "read-off", "choose"]);

/**
 * The skills a first try shows or misses: those a part is known by; reading a word (ADR 0131: a
 * reading card in context or a word's reading card), which says when its reading's ruby may fade;
 * and writing it (ADR 0148: a spelling card, or a typed word right), which says when a word's
 * spelling leftover is shown. Neither is a skill a word needs to be known.
 */
export const WITNESSED_FACETS: ReadonlySet<Skill> = new Set<Skill>([...SKILL_FACETS, "read-script", "write-script"]);

/**
 * A skill shown or missed (ADR 0100). It is shown only on a later day than the part was met and
 * than the skill was last missed: after a night, and again after a night once it slips (D2, D3).
 */
const witness = (d: Draft, e: AnswerSubmitted | ExerciseSkipped, part: string, skill: Skill, right: boolean): void => {
  if (!WITNESSED_FACETS.has(skill)) return;
  const key = cardKey(part, skill, e.orthography, e.exercise.reading);
  if (!right) {
    delete d.shown[key];
    d.missed[key] = e.localDate;
    return;
  }
  const met = d.met[part];
  const missed = d.missed[key];
  if (met !== undefined && e.localDate > met && (missed === undefined || e.localDate > missed)) d.shown[key] = e.localDate;
};

/**
 * A first try (or a wrong retry) on a card: a mistake on the same item, template and word closes,
 * and a wrong answer opens one. A card about another word of the sentence leaves it open.
 */
const noteMistake = (d: Draft, item: string, template: TemplateId, at: string, wrong: boolean, ask: readonly string[] | undefined, asks?: Question): void => {
  d.mistakes = d.mistakes.filter((m) => !(m.item === item && m.template === template && sameQuestion(m, ask, asks)));
  if (wrong) d.mistakes = [...d.mistakes, { item, template, at, ...(ask === undefined ? {} : { ask }), ...(asks === undefined ? {} : { asks }) }].slice(-MISTAKES_KEPT);
};

/** What a fill-in's answer asked of its word (ADR 0132), where it asked about one word. */
const questionOf = (e: AnswerSubmitted): Question | undefined => (askOf(e.outcome.parts) === undefined ? undefined : e.exercise.asks);

/** An exercise's parts a card of its template can show, each with the skill it shows it by. */
const shownBy = (template: TemplateId, parts: readonly string[]): readonly SkillRef[] => parts.filter((part) => asksOf(template, part)).map((part) => ({ part, skill: skillOf(template, part) }));

const answered = (d: Draft, e: AnswerSubmitted): void => {
  const { template, item, parts } = e.exercise;
  const facet = TEMPLATES[template].facet;
  const correct = e.outcome.kind.startsWith("CORRECT");
  // The performance model learns from first tries only; retries are biased. Its memory feature is
  // the recall of what the answer is credited to (a blank's word), as the planner predicts it.
  if (e.attempt === 1) {
    const credited: readonly SkillRef[] = e.outcome.parts.filter((c) => c.status !== "given").map((c) => ({ part: c.part, skill: c.skill }));
    const r = meanRetrievability(d, credited.length > 0 ? credited : shownBy(template, parts), e.orthography, e.clientTime, e.exercise.reading);
    learn(d.performance, { template, facet, item, parts, r }, correct);
  }
  // Pace: this answer's time per unit of length against the learner's usual for the template. Only
  // first tries make the usual (a retry is quicker for having just seen the answer).
  const recent = d.latencies[template] ?? [];
  const typical = median(recent);
  const perUnit = e.input.latencyMs / (PACE_OVERHEAD + parts.length);
  const pace: Pace = typical === undefined ? "usual" : perUnit > PACE_SLOW * typical ? "slow" : perUnit <= PACE_FAST * typical ? "fast" : "usual";
  if (e.attempt === 1) d.latencies[template] = [...recent, perUnit].slice(-LATENCY_WINDOW);
  const typed = TEMPLATES[template].modality.input === "text";
  // A word's meaning looked up on the card before answering (D16): a hint, except on a speaking card,
  // which shows what the sentence means anyway and asks for it to be said (D16c).
  const hinted = e.input.hinted === true && !SPEAKING.has(template);
  for (const credit of e.outcome.parts) {
    const rating = ratingOf(credit.status, e.outcome.kind, e.outcome.notes, pace, e.input.selfRating, typed, hinted);
    if (rating !== undefined) rate(d, e, credit.part, credit.skill, rating);
  }
  // Known words (ADR 0100): which skills a first try showed or missed, then what the learner has met.
  // A miss counts against a word only where the grading pins it there: a word card, or a sentence
  // with other words right. A sentence missed as a whole says nothing about which word failed. A
  // hinted first try (D16) shows no skill and misses none; it still counts in recent practice.
  if (e.attempt === 1 && e.input.selfRating === undefined) {
    d.recent = [...d.recent, correct].slice(-RECENT_WINDOW);
    const credited = e.outcome.parts.filter((c) => c.status !== "given");
    const pinned = credited.length === 1 || credited.some((c) => c.status === "right");
    if (!hinted) for (const c of credited) if (c.status === "right" || pinned) witness(d, e, c.part, c.skill, c.status === "right");
  }
  for (const credit of e.outcome.parts) d.met[credit.part] ??= e.localDate;
  // A correspondence an answer missed (ADR 0148): counted, once an answer, never scheduled.
  if (!correct) for (const id of new Set(e.outcome.correspondences ?? [])) d.letters[id] = { missed: (d.letters[id]?.missed ?? 0) + 1, last: e.clientTime };
  if (correct) addXp(d, e.localDate, XP.answer);
  // A mistake stays open through the lesson's own retry; a later first try that is right closes it.
  // Story questions are not mistakes to practice: they only make sense inside their story.
  if (template !== "speak.tier-0" && template !== "match-pairs" && template !== "letter-pairs" && !STORY_TEMPLATES.has(template) && (!correct || e.attempt === 1))
    noteMistake(d, item, template, e.clientTime, !correct, askOf(e.outcome.parts), questionOf(e));
};

const skipped = (d: Draft, e: ExerciseSkipped): void => {
  if (e.reason !== "skip") return; // can't listen / can't speak: no update
  const { template, parts } = e.exercise;
  if (e.attempt === 1) d.recent = [...d.recent, false].slice(-RECENT_WINDOW);
  const shown = shownBy(template, parts);
  for (const { part, skill } of shown) {
    rate(d, e, part, skill, "again"); // the answer was revealed
    if (shown.length === 1) witness(d, e, part, skill, false); // pinned on the word (ADR 0100)
  }
  for (const part of parts) d.met[part] ??= e.localDate;
  // A revealed answer records no credit, so not which word the card asked: the sentence's default one.
  noteMistake(d, e.exercise.item, e.exercise.template, e.clientTime, true, undefined);
};

/**
 * The skill a part is first known by, on the reading side: a feature value read off a form, anything
 * else recognized. What a placement seeds (ADR 0111), and what "recognized before produced" asks.
 */
export const readingSkill = (part: string): Skill => (kindOf(part) === "feature" ? "read-off" : "recognize");

/** The skills of the language a part can be known by (ADR 0146), script facets aside. */
export const languageSkills = (part: string): readonly Skill[] => (kindOf(part) === "feature" ? ["read-off", "choose"] : ["recognize", "produce", "listen"]);

const completed = (d: Draft, e: SessionCompleted): void => {
  // A placement test marks the nodes the learner placed out of as done (§9.5), and seeds what they
  // introduce (ADR 0111): a card each (a lexeme, a rule or a letter recognized, a feature value read
  // off a form), as if recalled with ease at the end of the test, so the planner counts them as
  // seen, review brings them back at long intervals and the word list shows them. A part with a card
  // already keeps it. A test the learner stopped part-way places by its answers so far too (D9), as
  // a stopped session: without the session's XP below.
  if (e.mode === "placement") {
    for (const node of e.placed ?? []) if (!d.completedNodes.includes(node)) d.completedNodes.push(node);
    const at = new Date(e.clientTime);
    for (const part of e.seeded ?? []) {
      d.met[part] ??= e.localDate;
      const key = cardKey(part, readingSkill(part), e.orthography);
      if (d.cards[key] === undefined) d.cards[key] = fromCard(scheduler.next(createEmptyCard(at), at, GRADES.easy).card);
    }
  }
  if (!e.summary.completed) return;
  const { exercises, correctFirstTry } = e.summary;
  const replay = (e.mode === "lesson" || e.mode === "story") && e.node !== undefined && d.completedNodes.includes(e.node);
  if (!replay) addXp(d, e.localDate, Math.min(XP.session, exercises) + (exercises >= XP.perfectFrom && correctFirstTry === exercises ? XP.perfect : 0));
  if ((e.mode === "lesson" || e.mode === "story") && e.node !== undefined && !d.completedNodes.includes(e.node)) d.completedNodes.push(e.node);
};

/**
 * The learner started the course over (progress_reset): what they know, the lessons done,
 * placement, mistakes and the performance model go back to the start. XP stays, as it records
 * practice that happened (the game state's streak and achievements are untouched too). A state
 * is one course's, so this forgets everything folded so far.
 */
const startOver = (d: Draft): void => {
  const fresh = draftOf(emptyLearnerState());
  d.cards = fresh.cards;
  d.performance = fresh.performance;
  d.completedNodes = fresh.completedNodes;
  d.mistakes = fresh.mistakes;
  d.latencies = fresh.latencies;
  d.rated = fresh.rated;
  d.met = fresh.met;
  d.shown = fresh.shown;
  d.missed = fresh.missed;
  d.recent = fresh.recent;
  d.letters = fresh.letters;
  d.seen = fresh.seen;
};

/**
 * What an event displayed (ADR 0146), into the pairs seen: each form keeps the earliest local date
 * it was displayed on, whatever order the events come in.
 */
const see = (d: Draft, e: { readonly displayed?: readonly DisplayedLexeme[] | undefined; readonly localDate: string }): void => {
  for (const p of e.displayed ?? []) {
    const forms = (d.seen[p.lexeme] ??= {});
    const key = lexemeFormKey(p.lexeme, p.feats);
    const was = forms[key];
    if (was === undefined || e.localDate < was) forms[key] = e.localDate;
  }
};

/** Whether an event displayed a pair the state has not seen, or seen only later: what folding it would change. */
const seesNew = (state: LearnerState, e: LearnerEvent): boolean =>
  (e.type === "exercise_presented" || e.type === "story_line_read") &&
  (e.displayed ?? []).some((p) => {
    const was = state.seen[p.lexeme]?.[lexemeFormKey(p.lexeme, p.feats)];
    return was === undefined || e.localDate < was;
  });

const applyOne = (d: Draft, e: LearnerEvent): void => {
  switch (e.type) {
    case "answer_submitted":
      see(d, e);
      answered(d, e);
      return;
    case "exercise_skipped":
      skipped(d, e);
      return;
    case "session_completed":
      completed(d, e);
      return;
    case "progress_reset":
      startOver(d);
      return;
    // What a card or a story line displayed (ADR 0146): the pairs seen, and nothing else.
    case "exercise_presented":
    case "story_line_read":
      see(d, e);
      return;
    // Revisions rewrite earlier answers: replay applies them (withRevisions), not this fold. The
    // weekly goal is the game's (ADR 0107): it changes nothing the learner model holds.
    case "session_started":
    case "answer_reported":
    case "sentence_reported":
    case "outcome_revised":
    case "goal_set":
      return;
  }
};

/**
 * Whether the learner has seen a lexeme in a form (ADR 0146): a card or a story line displayed it so,
 * since seen was logged. No `feats`: the lexeme as the lexicon spells it, or a token choosing none.
 */
export const seenIn = (state: LearnerState, lexeme: LexemeId, feats?: UdFeatures): boolean => state.seen[lexeme]?.[lexemeFormKey(lexeme, feats)] !== undefined;

/** The forms a lexeme has been seen in (`lexemeFormKey`s), in the order the fold met them; none if never. */
export const formsSeen = (state: LearnerState, lexeme: LexemeId): readonly FormKey[] => Object.keys(state.seen[lexeme] ?? {});

/** Event order: device time, then id (UUIDv7 ids are time-ordered too). */
export const compareEvents = (a: LearnerEvent, b: LearnerEvent): number => {
  const t = Date.parse(a.clientTime) - Date.parse(b.clientTime);
  return t !== 0 ? t : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

/**
 * Which events the fold reads (applyOne); the rest change nothing it holds. Revisions reach it
 * through replay's withRevisions. Every event type is listed, so a new one has to be placed here.
 * A presentation and a story line are read only where they display a pair not seen yet (`seesNew`):
 * the rest change nothing, and the state is not copied for them.
 */
const FOLDS: Readonly<Record<LearnerEvent["type"], boolean>> = {
  answer_submitted: true,
  exercise_skipped: true,
  session_completed: true,
  progress_reset: true,
  session_started: false,
  exercise_presented: false,
  answer_reported: false,
  sentence_reported: false,
  outcome_revised: false,
  goal_set: false,
  story_line_read: false,
};

/** Whether an event displayed anything at all. */
const displays = (e: LearnerEvent): boolean => (e.type === "exercise_presented" || e.type === "story_line_read") && (e.displayed ?? []).length > 0;

/**
 * Applies new events, in order, to a state: the events a device has just recorded, which are the
 * newest in its log. An event appears once however often it is given here, but one the state has
 * already folded in would count again: the state keeps no record of the events it holds (R1 in
 * the 2026-11 review: copying that record cost every recorded event as much as the whole log). A
 * log that may repeat events, arrive late or hold revisions is replayed. Events that change nothing
 * (an exercise shown, a report) give back the same state, uncopied.
 */
export const applyEvents = (state: LearnerState, events: readonly LearnerEvent[]): LearnerState => {
  // After a reset in the same batch, what the state has seen is forgotten: every pair counts again.
  const reset = events.some((e) => e.type === "progress_reset");
  const folded = events.filter((e) => FOLDS[e.type] || (reset ? displays(e) : seesNew(state, e)));
  if (folded.length === 0) return state;
  const d = draftOf(state);
  const applied = new Set<string>();
  for (const e of folded) {
    if (applied.has(e.id)) continue;
    applied.add(e.id);
    applyOne(d, e);
  }
  return d;
};

/** The state a whole event log projects to: order-independent and idempotent (a duplicate counts once). */
export const replay = (events: readonly LearnerEvent[]): LearnerState => applyEvents(emptyLearnerState(), withRevisions(events).sort(compareEvents));
