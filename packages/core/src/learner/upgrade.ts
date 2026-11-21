/**
 * Old events in the new shape (docs/migration-design.md, "Old events"). An event of schema 1 names
 * KCs; an event of schema 2 names parts, each credited by a skill (ADR 0146). `upgrade` turns one
 * into the other with the course's alias table (courses/<id>/aliases.yaml, in the bundle), and is
 * the only reader of the old shape: a log is upgraded once, where it is kept, and the fold, the
 * game's replay and the server's projections read schema 2 alone.
 *
 * - A KC that is one part now is that part (a sense its lexeme, a letter itself, a construction
 *   its rule). One that is several parts in some sentences is, in an event that names its sentence
 *   (`exercise.item`), what the table says it stood for there, and its plain part elsewhere.
 * - A form KC that is feature values now is, sentence by sentence, the values it chose there that
 *   the course teaches; where the sentence is not known, nothing: it never invents a part.
 * - A credit takes the skill a card of the event's template exercises its part by (`skillOf`); a
 *   part the card cannot show is given. Two old credits that are one part now are one credit:
 *   wrong if either was, else right if either was.
 * - An old event says nothing of what was displayed, so nothing old counts towards a rule.
 *
 * Pure: the same on the device and the server. An event already of schema 2 comes back as it is.
 */
import type {
  AliasTable,
  AnswerSubmitted,
  AnswerSubmittedV1,
  ExerciseRef,
  ExerciseRefV1,
  LearnerEvent,
  LearnerEventV1,
  OutcomeRevisedV1,
  PartCredit,
  PartId,
  Question,
} from "@nabu/schema";
import type { TemplateId } from "../lesson/exercise.ts";
import { asksOf, skillOf } from "../lesson/templates.ts";

/** The kinds of id an old event may hold, and what each is where the table does not know it. */
const FALLBACK: Readonly<Record<string, string | undefined>> = { sense: "lexeme", grapheme: "grapheme", construction: "rule" };

const kindOfKc = (kc: string): string => kc.slice(0, Math.max(0, kc.indexOf(":")));

/**
 * What an old id is, as one part, where no sentence says more: the table's `part`, or, for an id
 * the table does not have (a KC a course dropped before the switch), the part of its own name
 * (sense:x is lexeme:x). A form KC that is feature values has none.
 */
const partOf = (kc: string, aliases: AliasTable | undefined): PartId | undefined => {
  const alias = aliases?.aliases[kc];
  if (alias !== undefined) return alias.part;
  const kind = FALLBACK[kindOfKc(kc)];
  return kind === undefined ? undefined : `${kind}:${kc.slice(kc.indexOf(":") + 1)}`;
};

/** What an old id stood for in an item (a sentence, a story line): the table's word for it there, else its plain part. */
const partsIn = (kc: string, item: string | undefined, aliases: AliasTable | undefined): readonly PartId[] => {
  const alias = aliases?.aliases[kc];
  const there = item === undefined ? undefined : alias?.byItem?.[item];
  if (there !== undefined) return there;
  const part = partOf(kc, aliases);
  return part === undefined ? [] : [part];
};

const unique = <T>(xs: readonly T[]): T[] => [...new Set(xs)];

/**
 * An old item in the new shape: a word card's item is its KC, which is a lexeme now; a sentence's
 * id, or a story's and a step's, is as it was. A story line's parts are listed under `story#step`,
 * while its card's item is `story/step`: `listed` is the id the table lists it by.
 */
const itemOf = (item: string, aliases: AliasTable | undefined): { readonly item: string; readonly listed: string } => {
  if (kindOfKc(item) in FALLBACK || kindOfKc(item) === "form") return { item: partOf(item, aliases) ?? item, listed: item };
  const slash = item.lastIndexOf("/");
  return { item, listed: slash > 0 && /^\d+$/u.test(item.slice(slash + 1)) ? `${item.slice(0, slash)}#${item.slice(slash + 1)}` : item };
};

/** An exercise's id with the items it names in the new shape (match-pairs names several, joined by +). */
const exerciseIdOf = (id: string, template: string, aliases: AliasTable | undefined): string => {
  const prefix = `${template}:`;
  if (!id.startsWith(prefix)) return id;
  const hash = id.lastIndexOf("#");
  const retry = hash > prefix.length && /^\d+$/u.test(id.slice(hash + 1)) ? id.slice(hash) : "";
  const named = id.slice(prefix.length, id.length - retry.length);
  const renamed = named
    .split("+")
    .map((one) => itemOf(one, aliases).item)
    .join("+");
  return `${prefix}${renamed}${retry}`;
};

const questionOf = (asks: ExerciseRefV1["asks"]): Question | undefined => (asks === undefined ? undefined : asks === "word" ? "lexeme" : "form");

const exerciseOf = (ex: ExerciseRefV1, aliases: AliasTable | undefined): ExerciseRef => {
  const { item, listed } = itemOf(ex.item, aliases);
  const asks = questionOf(ex.asks);
  return {
    id: exerciseIdOf(ex.id, ex.template, aliases),
    template: ex.template,
    item,
    ...(asks === undefined ? {} : { asks }),
    ...(ex.reading === undefined ? {} : { reading: ex.reading }),
    parts: unique(ex.kcs.flatMap((kc) => partsIn(kc, listed, aliases))),
  };
};

const RANK: Readonly<Record<PartCredit["status"], number>> = { given: 0, right: 1, wrong: 2 };

/**
 * Old credits as credits of parts, for an answer to a card of `template` about `item`: each part by
 * the skill the card exercises it by, given where the card cannot show it. Without a template (a
 * revision whose answer is not at hand) a part takes the skill it is first known by.
 */
const creditsOf = (
  credits: AnswerSubmittedV1["outcome"]["kcs"],
  template: TemplateId | undefined,
  listed: string | undefined,
  aliases: AliasTable | undefined,
): PartCredit[] => {
  const out = new Map<PartId, PartCredit>();
  for (const credit of credits) {
    for (const part of partsIn(credit.kc, listed, aliases)) {
      const skill = template === undefined ? (part.startsWith("feature:") ? "read-off" : "recognize") : skillOf(template, part);
      const status = template !== undefined && !asksOf(template, part) ? "given" : credit.status;
      const known = out.get(part);
      if (known === undefined || RANK[status] > RANK[known.status]) out.set(part, { part, skill, status });
    }
  }
  return [...out.values()];
};

/** The event a revision revises, where the caller has it: its template and item say what the old credits were of. */
export type RevisedAnswer = Pick<AnswerSubmittedV1 | AnswerSubmitted, "exercise">;

const revisedOf = (e: OutcomeRevisedV1, aliases: AliasTable | undefined, answer: RevisedAnswer | undefined): LearnerEvent => {
  const listed = answer === undefined ? undefined : itemOf(answer.exercise.item, aliases).listed;
  return {
    ...e,
    schema: 2,
    outcome: { kind: e.outcome.kind, notes: [...e.outcome.notes], labels: [], parts: creditsOf(e.outcome.kcs, answer?.exercise.template, listed, aliases) },
  };
};

/** Whether an event is of the old shape. */
export const isOld = (event: LearnerEventV1 | LearnerEvent): event is LearnerEventV1 => event.schema === 1;

/**
 * One event in the new shape. `aliases`: its course's alias table (undefined for an event that
 * names no course, or a course whose table is not at hand: ids then keep their own names where
 * they can). `answer`: for an `outcome_revised`, the answer it revises, in either shape.
 */
export const upgrade = (event: LearnerEventV1 | LearnerEvent, aliases: AliasTable | undefined, answer?: RevisedAnswer): LearnerEvent => {
  if (!isOld(event)) return event;
  switch (event.type) {
    case "session_started":
    case "progress_reset":
    case "goal_set":
      return { ...event, schema: 2 };
    case "exercise_presented":
    case "exercise_skipped":
    case "answer_reported":
      return { ...event, schema: 2, exercise: exerciseOf(event.exercise, aliases) };
    case "answer_submitted": {
      const exercise = exerciseOf(event.exercise, aliases);
      const { listed } = itemOf(event.exercise.item, aliases);
      return {
        ...event,
        schema: 2,
        exercise,
        outcome: { kind: event.outcome.kind, notes: [...event.outcome.notes], labels: [], parts: creditsOf(event.outcome.kcs, event.exercise.template, listed, aliases) },
      };
    }
    case "outcome_revised":
      return revisedOf(event, aliases, answer);
    case "session_completed": {
      const { seeded, ...rest } = event;
      if (seeded === undefined) return { ...rest, schema: 2 };
      // What a placement seeds is what its nodes introduce: a form KC's values, any other id's part.
      const parts = unique(seeded.flatMap((kc) => aliases?.aliases[kc]?.seeds ?? partsIn(kc, undefined, aliases)));
      return { ...rest, schema: 2, seeded: parts };
    }
    case "sentence_reported":
      return { ...event, schema: 2, item: itemOf(event.item, aliases).item };
  }
};

/**
 * A whole log in the new shape, each event with its course's table (`aliasesOf`: by course id) and
 * each revision with the answer it revises, wherever in the log that is. Events already of schema
 * 2 are kept as they are, so a log part old and part new comes out whole.
 */
export const upgradeLog = (events: readonly (LearnerEventV1 | LearnerEvent)[], aliasesOf: (course: string) => AliasTable | undefined): LearnerEvent[] => {
  const answers = new Map<string, RevisedAnswer>();
  for (const e of events) if (e.type === "answer_submitted") answers.set(e.id, e);
  return events.map((e) => {
    if (!isOld(e)) return e;
    const aliases = e.type === "goal_set" ? undefined : aliasesOf(e.course);
    return upgrade(e, aliases, e.type === "outcome_revised" ? answers.get(e.answer) : undefined);
  });
};
