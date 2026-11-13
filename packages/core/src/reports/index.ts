/**
 * Reports a learner makes, on their way to the course's reviewers (ADR 0055), pure:
 * - **What leaves the device** (`submissionOf`): a correction (sentence_reported) or a claim about
 *   an answer (answer_reported), with no device, user or session id, and only the local date.
 * - **The intake document** (`intakeDocumentOf`): the Firestore document the app creates, one per
 *   report, named by the event's id so a retried send is the same document.
 * - **The GitHub issue** (`issueOf`, `reportSection`): one issue per sentence or story line,
 *   quoting it from the bundle with its accept sets, and one section per report.
 *
 * - **What came of them** (`reportsOf`, status.ts, ADR 0115): each of a device's reports compared
 *   with the course its bundle has now, on the device.
 *
 * Learner text goes into issues inside code spans, so it cannot mention anyone, link an issue or
 * inject markup. Language data is bidi-isolated (FSI…PDI), so right-to-left text stays readable in
 * left-to-right Markdown.
 */
import type { AnswerReported, AnswerSubmission, CorrectionFields, CorrectionSubmission, ReportSubmission, SentenceCorrection, SentenceReported } from "@nabu/schema";
import { correctable } from "../corrections/index.ts";
import { allSentences, type CourseView } from "../lesson/course.ts";
import { graphemes } from "../text/graphemes.ts";
import { surfaceOf } from "../text/tagged-text.ts";

/** The Firestore collection the app writes reports to. */
export const REPORTS_COLLECTION = "nabu_reports";

/** A report as it leaves the device. */
export const submissionOf = (event: SentenceReported | AnswerReported): ReportSubmission => {
  const common = { v: 1 as const, id: event.id, course: event.course, orthography: event.orthography, support: event.support, bundle: event.bundle, reportedOn: event.localDate };
  if (event.type === "sentence_reported") {
    const correction: CorrectionSubmission = {
      ...common,
      kind: "correction",
      item: event.item,
      ...(event.step === undefined ? {} : { step: event.step }),
      shown: event.shown,
      correction: event.correction,
      ...(event.note === undefined ? {} : { note: event.note }),
    };
    return correction;
  }
  const answer: AnswerSubmission = {
    ...common,
    kind: event.claim ?? "accept",
    item: event.exercise.item,
    template: event.exercise.template,
    text: event.text,
    ...(event.note === undefined ? {} : { note: event.note }),
  };
  return answer;
};

/** A Firestore field value (REST encoding). */
type Value = { readonly stringValue: string } | { readonly integerValue: string } | { readonly timestampValue: string };

/**
 * The intake document: a few fields to query and to check in the security rules, and the whole
 * submission as JSON. `createdAt` is the device's clock at sending (the rules hold it to a day of
 * the server's).
 */
export const intakeDocumentOf = (s: ReportSubmission, createdAt: string): { readonly fields: Readonly<Record<string, Value>> } => ({
  fields: {
    v: { integerValue: "1" },
    status: { stringValue: "new" },
    kind: { stringValue: s.kind },
    course: { stringValue: s.course },
    payload: { stringValue: JSON.stringify(s) },
    createdAt: { timestampValue: createdAt },
  },
});

// ------------------------------------------------------------------------------------------ issues

const FSI = "\u2068";
const PDI = "\u2069";

/** Language data, isolated from the Markdown around it. */
const isolate = (text: string): string => `${FSI}${text}${PDI}`;

/**
 * Text someone typed, as an inline code span: no mentions, links or markup. The fence is longer
 * than any run of backticks inside, and line breaks become spaces.
 */
export const code = (text: string): string => {
  const flat = text.replace(/\s*[\r\n]+\s*/gu, " ");
  const longest = Math.max(0, ...Array.from(flat.matchAll(/`+/gu), (m) => m[0].length));
  const fence = "`".repeat(longest + 1);
  const pad = flat.startsWith("`") || flat.endsWith("`") ? " " : "";
  return `${fence}${pad}${isolate(flat)}${pad}${fence}`;
};

/** Accept-set notation as a fenced block (several lines), fenced longer than any backtick run. */
const block = (text: string): string => {
  const longest = Math.max(2, ...Array.from(text.matchAll(/`+/gu), (m) => m[0].length));
  const fence = "`".repeat(longest + 1);
  return `${fence}text\n${text}\n${fence}`;
};

/** One issue per sentence or story line. */
export const issueKeyOf = (s: ReportSubmission): string => `${s.course}/${s.item}${s.kind === "correction" && s.step !== undefined ? `#${String(s.step)}` : ""}`;

const KIND_LABEL: Readonly<Record<ReportSubmission["kind"], string>> = { correction: "correction", accept: "should-accept", reject: "should-reject" };

/** The labels an issue gets for a report. */
export const labelsOf = (s: ReportSubmission): readonly string[] => ["report", `course:${s.course}`, KIND_LABEL[s.kind]];

/** What the bundle says about the item: each orthography's text, the translation, the accept sets. */
interface ItemContext {
  /** A word (ADR 0057): its translation is its gloss, its meaning. */
  readonly word: boolean;
  readonly forms: Readonly<Record<string, string>>;
  readonly translation?: string | undefined;
  readonly reverse: Readonly<Record<string, string>>;
  readonly accept?: string | undefined;
}

const contextOf = (course: CourseView | undefined, s: ReportSubmission): ItemContext | undefined => {
  if (course === undefined) return undefined;
  const step = s.kind === "correction" ? s.step : undefined;
  const found = correctable(course, s.item, step);
  if (found === undefined) return undefined;
  const sentence = step === undefined ? allSentences(course).find((x) => x.id === s.item) : undefined;
  const reverse = Object.fromEntries(Object.entries(sentence?.forms ?? {}).flatMap(([o, f]) => (f.reverse === undefined ? [] : [[o, f.reverse]])));
  return {
    word: found.kind === "word",
    forms: Object.fromEntries(Object.entries(found.forms).map(([o, t]) => [o, surfaceOf(t)])),
    translation: found.translation === undefined ? undefined : surfaceOf(found.translation),
    reverse,
    accept: sentence?.translations[course.supportKey]?.accept,
  };
};

const where = (s: ReportSubmission): string => (s.kind === "correction" && s.step !== undefined ? `${s.item}, step ${String(s.step)}` : s.item);

/** The issue for the first report of an item. `course` is the bundle's view, when it has the course. */
export const issueOf = (s: ReportSubmission, course: CourseView | undefined): { readonly title: string; readonly body: string; readonly labels: readonly string[] } => {
  const context = contextOf(course, s);
  const quote = context?.forms[s.orthography] ?? (s.kind === "correction" ? s.shown.forms?.[s.orthography]?.text : undefined);
  const clusters = quote === undefined ? [] : graphemes(quote);
  const excerpt = quote === undefined ? "" : ` · ${isolate(clusters.length > 80 ? `${clusters.slice(0, 79).join("")}…` : quote)}`;
  const lines = [
    `<!-- nabu-report: ${issueKeyOf(s)} -->`,
    `Learners' reports about **${where(s)}** in the **${s.course}** course. Each report below is one learner's; nothing reaches the course until a reviewer applies it.`,
    "",
  ];
  if (context === undefined) {
    lines.push(`*The current bundle has no ${where(s)} in ${s.course}: the course may have changed since.*`, "");
  } else {
    lines.push("**As the course has it now:**", "");
    for (const [o, text] of Object.entries(context.forms)) lines.push(`- ${o}: ${code(text)}`);
    if (context.translation !== undefined) lines.push(`- ${context.word ? "meaning" : "translation"}: ${code(context.translation)}`);
    lines.push("");
    for (const [o, reverse] of Object.entries(context.reverse)) lines.push(`<details><summary>Accepted answers in ${o}</summary>`, "", block(reverse), "", "</details>", "");
    if (context.accept !== undefined) lines.push("<details><summary>Accepted translations</summary>", "", block(context.accept), "", "</details>", "");
  }
  lines.push(reportSection(s));
  return { title: `[${s.course}] ${where(s)}${excerpt}`, body: lines.join("\n"), labels: labelsOf(s) };
};

const changes = (shown: CorrectionFields, made: CorrectionFields): readonly string[] => {
  const out: string[] = [];
  for (const [o, f] of Object.entries(made.forms ?? {})) {
    const before = shown.forms?.[o];
    if (f.text !== undefined) out.push(`- ${o} text: ${code(before?.text ?? "")} → ${code(f.text)}`);
    for (const r of f.readings ?? []) {
      const was = before?.readings?.find((b) => b.token === r.token && b.scheme === r.scheme)?.reading ?? "";
      out.push(`- ${o} reading of ${code(r.surface)} (${r.scheme}): ${code(was)} → ${code(r.reading)}`);
    }
  }
  if (made.translation !== undefined) out.push(`- translation: ${code(shown.translation ?? "")} → ${code(made.translation)}`);
  return out;
};

/** The row `nabu corrections apply` reads, for a correction. */
export const correctionRowOf = (s: CorrectionSubmission): SentenceCorrection => ({
  id: s.id,
  course: s.course,
  orthography: s.orthography,
  support: s.support,
  bundle: s.bundle,
  item: s.item,
  ...(s.step === undefined ? {} : { step: s.step }),
  shown: s.shown,
  correction: s.correction,
  notes: s.note === undefined ? [] : [s.note],
  status: "pending",
  reports: 1,
  createdAt: `${s.reportedOn}T00:00:00.000Z`,
});

const HEADINGS: Readonly<Record<ReportSubmission["kind"], string>> = {
  correction: "Correction",
  accept: "Should have been accepted",
  reject: "Should have been wrong",
};

/** One report, as a section of the issue or as a comment on it. */
export const reportSection = (s: ReportSubmission): string => {
  const lines = [`### ${HEADINGS[s.kind]} · ${s.reportedOn}`, ""];
  if (s.kind === "correction") {
    const made = changes(s.shown, s.correction);
    lines.push(...(made.length === 0 ? ["*No change to the text: see the note.*"] : made));
  } else {
    lines.push(`- answer (${s.orthography}, \`${s.template}\`): ${code(s.text)}`);
  }
  if (s.note !== undefined) lines.push(`- note: ${code(s.note)}`);
  lines.push("", `<sub>report ${s.id} · bundle ${s.bundle.slice(0, 12)}</sub>`);
  if (s.kind === "correction") {
    lines.push("", "<details><summary>Row for <code>nabu corrections apply</code></summary>", "", "```json", JSON.stringify(correctionRowOf(s)), "```", "", "</details>");
  }
  return lines.join("\n");
};

export { claimStatus, reportsOf, takenUp, type ClaimStatus, type ReportEntry } from "./status.ts";
