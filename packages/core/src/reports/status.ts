/**
 * What came of a device's reports (ADR 0115), pure. The device compares each report with the course
 * as the bundle it has now holds it; nothing leaves the device, and no server is asked.
 *
 * - **A correction** (`correctionStatus`, @nabu/core/corrections): in the course now, still as the
 *   learner saw it, changed some other way, or gone.
 * - **A claim about an answer** (`claimStatus`): the answer graded again, with the course's grader,
 *   against the accept set it was graded against. A claim that it should have been accepted is
 *   taken up once the grader accepts it; one that it should have been wrong, once the grader marks
 *   it wrong. Only answers the accept set grades whole can be checked: typed or built from tiles,
 *   in either direction, or written down from a clip. A choice is graded by its place among the
 *   options, a filled blank leaves the rest of the sentence out of the claim, a story line has no
 *   accept set and a spoken answer's claim is about the scoring: those are `unchecked`.
 */
import type { AnswerReported, LearnerEvent, SentenceReported } from "@nabu/schema";
import { literalAccept } from "../accept/notation.ts";
import { correctionStatus, latestCorrections, later, type CorrectionStatus } from "../corrections/index.ts";
import { allKcs, allSentences, type CourseView, type Grader } from "../lesson/course.ts";
import { surfaceOf } from "../text/tagged-text.ts";

/**
 * What the course makes of a claimed answer now:
 * - `accepted`: the learner said it should have been accepted, and the course accepts it now;
 * - `rejected`: the learner said it should have been wrong, and the course marks it wrong now;
 * - `pending`: the course grades it as it did;
 * - `gone`: the course no longer has the item;
 * - `unchecked`: the device cannot tell (see above).
 */
export type ClaimStatus = "accepted" | "rejected" | "pending" | "gone" | "unchecked";

/** Templates whose claimed text is the whole answer an accept set grades. */
const CHECKED: ReadonlySet<string> = new Set(["translate-type.l1-l2", "translate-tap.l1-l2", "translate-tap.l2-l1", "listen-type", "listen-tap"]);

/** Whether the course still has the item: a sentence, a word (KC), or a story (its questions' items are "story/step"). */
const present = (course: CourseView, item: string): boolean =>
  allSentences(course).some((s) => s.id === item) ||
  allKcs(course).some((k) => k.id === item) ||
  course.units.some((u) => (u.stories ?? []).some((s) => item === s.id || item.startsWith(`${s.id}/`)));

/** The accept set the claimed answer is graded against, as the course has it now, and its orthography. */
const acceptOf = (course: CourseView, report: AnswerReported): { readonly orthography: string; readonly accept: string } | undefined => {
  const sentence = allSentences(course).find((s) => s.id === report.exercise.item);
  const form = sentence?.forms[report.orthography];
  switch (report.exercise.template) {
    // Into the target language: the form's `reverse` (as the lesson templates grade it).
    case "translate-type.l1-l2":
    case "translate-tap.l1-l2":
      return form?.reverse === undefined ? undefined : { orthography: report.orthography, accept: form.reverse };
    // Into the support language: its translation's accept set.
    case "translate-tap.l2-l1": {
      const accept = report.support === course.supportKey ? sentence?.translations[course.supportKey]?.accept : undefined;
      return accept === undefined ? undefined : { orthography: course.support, accept };
    }
    // Written down from a clip: the sentence itself.
    case "listen-type":
    case "listen-tap":
      return form === undefined ? undefined : { orthography: report.orthography, accept: literalAccept(surfaceOf(form.text)) };
    default:
      return undefined;
  }
};

/** What the course makes of a claimed answer now: the answer graded again, as the course has the item. */
export const claimStatus = (course: CourseView, report: AnswerReported, grader: Grader): ClaimStatus => {
  if (!present(course, report.exercise.item)) return "gone";
  if (!CHECKED.has(report.exercise.template)) return "unchecked";
  const against = acceptOf(course, report);
  if (against === undefined || !course.profiles.has(against.orthography)) return "unchecked";
  const right = grader.grade(against.orthography, against.accept, report.text).verdict.startsWith("CORRECT");
  if (report.claim === "reject") return right ? "pending" : "rejected";
  return right ? "accepted" : "pending";
};

/** A report of this device's, with what the course makes of it now. */
export type ReportEntry =
  | { readonly kind: "correction"; readonly report: SentenceReported; readonly status: CorrectionStatus }
  | { readonly kind: "claim"; readonly report: AnswerReported; readonly status: ClaimStatus };

/** Whether the course took the report up: a correction in it, or a claimed answer graded as the learner said. */
export const takenUp = (entry: ReportEntry): boolean => entry.status === "adopted" || entry.status === "accepted" || entry.status === "rejected";

/**
 * This device's reports in a course, newest first: its latest correction of each item (a later one
 * replaces an earlier, ADR 0051), and each claim, once per answer text claimed the same way.
 */
export const reportsOf = (course: CourseView, events: readonly LearnerEvent[], grader: Grader): readonly ReportEntry[] => {
  const claims = new Map<string, AnswerReported>();
  for (const e of events) {
    if (e.type !== "answer_reported" || e.course !== course.id) continue;
    const key = [e.exercise.template, e.exercise.item, e.orthography, e.claim ?? "accept", e.text].join("\u0000");
    const before = claims.get(key);
    if (before === undefined || later(e, before)) claims.set(key, e);
  }
  const entries: ReportEntry[] = [
    ...[...latestCorrections(events, course.id).values()].map((report): ReportEntry => ({ kind: "correction", report, status: correctionStatus(course, report) })),
    ...[...claims.values()].map((report): ReportEntry => ({ kind: "claim", report, status: claimStatus(course, report, grader) })),
  ];
  return entries.sort((a, b) => (later(a.report, b.report) ? -1 : later(b.report, a.report) ? 1 : 0));
};
