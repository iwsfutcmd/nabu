/**
 * Whether the judge may still accept an answer (ADR 0148): the server judges this course
 * orthography (`judge`, with an account to ask it with), the answer is one the judge is asked of
 * (`judgeable`; before the answer is recorded, a typed card of a judged kind graded WRONG), and it
 * has not answered no (`refused`). Its feedback holds back lexical, grammatical and order until
 * then, so a learner is not told "another word" and then "right". An answer queued while the
 * server is unreachable stays held: the judge may yet accept it.
 */
import type { Verdict } from "@nabu/core";
import { JUDGED_TEMPLATES, judgeable } from "@nabu/core/ai";
import type { Exercise } from "@nabu/core/lesson";
import type { AnswerSubmitted } from "@nabu/schema";

export const judgeMayAccept = (
  judge: boolean,
  signedIn: boolean,
  refused: ReadonlySet<string>,
  ex: Pick<Exercise, "id" | "template">,
  verdict: Verdict,
  answer: AnswerSubmitted | undefined,
): boolean => judge && signedIn && verdict === "WRONG" && JUDGED_TEMPLATES.has(ex.template) && (answer === undefined || judgeable(answer)) && !refused.has(ex.id);
