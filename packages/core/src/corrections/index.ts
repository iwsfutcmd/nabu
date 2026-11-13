/**
 * Corrections to course content (ADR 0051), pure: a learner marks a sentence, a story line or a
 * word as incorrect and says what it should be.
 *
 * - **What can be corrected.** Every sentence and story line the course source holds, in every
 *   orthography it pins: the text, each word's pinned readings (Jyutping), and the translation
 *   as displayed. Generated sentences (the CLDR number drills) are not in the source. A word
 *   (ADR 0057) is a KC with forms: its first form in each orthography (what word exercises
 *   show), and its gloss as the translation. Match-pairs offers each of its pairs' words.
 * - **What a correction holds.** `shown` is everything the device displayed, so the reviewer's
 *   tool can check the source still says it; `correction` holds only what the learner changed,
 *   NFC and trimmed. A note alone is a report too.
 * - **A device's own.** A later report of the same item replaces an earlier one; the device
 *   exports its latest as the rows `nabu corrections apply` reads.
 * - **What came of it** (ADR 0115). The device compares its correction with the course its
 *   bundle has now: in the course, still as the learner saw it, changed otherwise, or gone.
 *
 * Tokens are addressed by their place among the form's words (its source tokens: not spaces or
 * punctuation), with the word's surface, so a reading never lands on another word.
 */
import type { BundleKc, BundleStory, BundleUnit, CorrectionFields, CorrectedForm, LearnerEvent, OrthographyId, SchemeId, SentenceCorrection, SentenceReported, TaggedText, TokenReading } from "@nabu/schema";
import type { EventMeta } from "../learner/events.ts";
import type { CourseView } from "../lesson/course.ts";
import type { Exercise } from "../lesson/exercise.ts";
import { err, ok, type Result } from "../result.ts";
import { graphemeCount } from "../text/graphemes.ts";
import { surfaceOf, wordIndexes } from "../text/tagged-text.ts";

/** A sentence, a story line or a word, in every orthography the course pins. */
export interface Correctable {
  readonly kind: "sentence" | "line" | "word";
  /** A sentence id, a story id (with `step`), or a word's KC id. */
  readonly item: string;
  /** For a story line: its step in the story (every step counted). */
  readonly step?: number | undefined;
  readonly forms: Readonly<Record<string, TaggedText>>;
  /** The translation in the support language, as displayed; for a word, its gloss. */
  readonly translation: TaggedText | undefined;
}

export interface UnitCorrectables {
  readonly unit: BundleUnit;
  readonly sentences: readonly Correctable[];
  readonly stories: readonly { readonly story: BundleStory; readonly lines: readonly Correctable[] }[];
}

/** The key of an item on a device: a sentence id, or "story#step". */
export const correctionKey = (item: string, step?: number): string => (step === undefined ? item : `${item}#${String(step)}`);

/** Generated sentences (the CLDR number drills) have no course source to correct. */
const generated = (id: string): boolean => id.startsWith("drill.");

const sentencesOf = (course: CourseView, unit: BundleUnit): readonly Correctable[] =>
  unit.sentences
    .filter((s) => !generated(s.id))
    .map((s) => ({
      kind: "sentence" as const,
      item: s.id,
      forms: Object.fromEntries(Object.entries(s.forms).map(([o, f]) => [o, f.text])),
      translation: s.translations[course.supportKey]?.text,
    }));

const linesOf = (course: CourseView, story: BundleStory): readonly Correctable[] =>
  story.steps.flatMap((s, step) => (s.line === undefined ? [] : [{ kind: "line" as const, item: story.id, step, forms: s.line.forms, translation: s.line.translations[course.supportKey] }]));

/** A word: a KC's first form in each orthography (what word exercises show) and its gloss. */
const wordOf = (course: CourseView, kc: BundleKc): Correctable | undefined => {
  const forms = Object.fromEntries(Object.entries(kc.forms ?? {}).flatMap(([o, fs]) => (fs[0] === undefined ? [] : [[o, fs[0]]])));
  return Object.keys(forms).length === 0 ? undefined : { kind: "word", item: kc.id, forms, translation: kc.gloss?.[course.supportKey] };
};

/** Everything a learner can correct, unit by unit: the sentences, then each story's lines. */
export const correctablesByUnit = (course: CourseView): readonly UnitCorrectables[] =>
  course.units.map((unit) => ({ unit, sentences: sentencesOf(course, unit), stories: (unit.stories ?? []).map((story) => ({ story, lines: linesOf(course, story) })) }));

/** One sentence (by id) or story line (story id and step), if the course has it and it can be corrected. */
export const correctable = (course: CourseView, item: string, step?: number): Correctable | undefined => {
  for (const unit of course.units) {
    if (step === undefined) {
      const found = sentencesOf(course, unit).find((c) => c.item === item);
      if (found !== undefined) return found;
      const kc = unit.kcs.find((k) => k.id === item);
      if (kc !== undefined) return wordOf(course, kc);
    } else {
      const story = unit.stories?.find((s) => s.id === item);
      if (story !== undefined) return linesOf(course, story).find((c) => c.step === step);
    }
  }
  return undefined;
};

/**
 * What a learner can correct from an exercise: the sentence or word it was built from; for
 * match-pairs, every pair's word.
 */
export const correctablesOf = (course: CourseView, ex: Pick<Exercise, "template" | "item" | "kcs">): readonly Correctable[] =>
  (ex.template === "match-pairs" ? ex.kcs : [ex.item]).flatMap((item) => correctable(course, item) ?? []);

/** Each word's pinned readings, in the order the form's words come. */
const readingsOf = (text: TaggedText): readonly TokenReading[] =>
  wordIndexes(text).flatMap((at, token) => {
    const t = text.tokens[at];
    if (t === undefined) return [];
    return Object.entries(t.readings ?? {}).flatMap(([scheme, reading]) => (reading === undefined ? [] : [{ token, surface: t.surface, scheme: scheme as SchemeId, reading }]));
  });

/** Every orthography's text and readings, and the translation: what the device shows. */
export const shownOf = (c: Correctable): CorrectionFields => {
  const forms = Object.fromEntries(
    Object.entries(c.forms).map(([o, text]): [string, CorrectedForm] => {
      const readings = readingsOf(text);
      return [o, { text: surfaceOf(text), ...(readings.length === 0 ? {} : { readings }) }];
    }),
  );
  return { forms, ...(c.translation === undefined ? {} : { translation: surfaceOf(c.translation) }) };
};

/** What the correction form edits: every field, starting from what was shown. */
export interface CorrectionDraft {
  /** Per orthography: the text, and the readings in the order `shown` lists them. */
  readonly forms: Readonly<Record<string, { readonly text: string; readonly readings: readonly string[] }>>;
  readonly translation: string;
  readonly note: string;
}

export const draftFrom = (shown: CorrectionFields): CorrectionDraft => ({
  forms: Object.fromEntries(Object.entries(shown.forms ?? {}).map(([o, f]) => [o, { text: f.text ?? "", readings: (f.readings ?? []).map((r) => r.reading) }])),
  translation: shown.translation ?? "",
  note: "",
});

/** Where a draft went wrong, by field: "text:<orthography>", "reading:<orthography>:<n>", "translation", "note". */
export type CorrectionError = { readonly code: "unchanged" } | { readonly code: "empty"; readonly field: string } | { readonly code: "too-long"; readonly field: string };

/** Longest values, in graphemes (what a learner sees). */
export const CORRECTION_LIMITS = { text: 500, translation: 500, reading: 50, note: 500 } as const;
/**
 * Storage bounds: the schema's maxLength (which counts code points) for each field. A UTF-16
 * length within it keeps every event valid, so no report can stop a device's sync.
 */
const STORAGE = { text: 2000, translation: 2000, reading: 200, note: 1000 } as const;

const clean = (s: string): string => s.normalize("NFC").trim();

const check = (value: string, kind: keyof typeof CORRECTION_LIMITS, field: string, optional = false): CorrectionError | undefined => {
  if (value === "") return optional ? undefined : { code: "empty", field };
  return graphemeCount(value) > CORRECTION_LIMITS[kind] || value.length > STORAGE[kind] ? { code: "too-long", field } : undefined;
};

/**
 * The correction a draft makes to what was shown: only the fields it changes, NFC and trimmed.
 * A draft that changes nothing and has no note is not a report.
 */
export const correctionOf = (shown: CorrectionFields, draft: CorrectionDraft): Result<{ readonly correction: CorrectionFields; readonly note?: string }, CorrectionError> => {
  const forms: Record<string, CorrectedForm> = {};
  for (const [o, before] of Object.entries(shown.forms ?? {})) {
    const edited = draft.forms[o];
    if (edited === undefined) continue;
    const text = clean(edited.text);
    const textError = check(text, "text", `text:${o}`);
    if (textError !== undefined) return err(textError);
    const readings: TokenReading[] = [];
    for (const [n, r] of (before.readings ?? []).entries()) {
      const reading = clean(edited.readings[n] ?? r.reading);
      const readingError = check(reading, "reading", `reading:${o}:${String(n)}`);
      if (readingError !== undefined) return err(readingError);
      if (reading !== r.reading) readings.push({ ...r, reading });
    }
    const changedText = text !== before.text;
    if (changedText || readings.length > 0) forms[o] = { ...(changedText ? { text } : {}), ...(readings.length === 0 ? {} : { readings }) };
  }
  let translation: string | undefined;
  if (shown.translation !== undefined) {
    const t = clean(draft.translation);
    const translationError = check(t, "translation", "translation");
    if (translationError !== undefined) return err(translationError);
    if (t !== shown.translation) translation = t;
  }
  const note = clean(draft.note);
  const noteError = check(note, "note", "note", true);
  if (noteError !== undefined) return err(noteError);
  const correction: CorrectionFields = { ...(Object.keys(forms).length === 0 ? {} : { forms }), ...(translation === undefined ? {} : { translation }) };
  if (Object.keys(correction).length === 0 && note === "") return err({ code: "unchanged" });
  return ok({ correction, ...(note === "" ? {} : { note }) });
};

/** The sentence_reported event, stamped by the shell like any other (EventMeta). */
export const sentenceReportedOf = (
  course: CourseView,
  target: { readonly item: string; readonly step?: number | undefined },
  shown: CorrectionFields,
  made: { readonly correction: CorrectionFields; readonly note?: string | undefined },
  meta: EventMeta,
): SentenceReported => ({
  id: meta.id,
  type: "sentence_reported",
  schema: 1,
  device: meta.device,
  ...(meta.user === undefined ? {} : { user: meta.user }),
  course: course.id,
  orthography: course.orthography as OrthographyId,
  support: course.supportKey,
  bundle: meta.bundle,
  session: meta.session,
  clientTime: meta.clientTime,
  localDate: meta.localDate,
  tz: meta.tz,
  item: target.item,
  ...(target.step === undefined ? {} : { step: target.step }),
  shown,
  correction: made.correction,
  ...(made.note === undefined ? {} : { note: made.note }),
});

/** Whether event `a` came after `b`: by the device's clock, then by id. */
export const later = (a: Pick<LearnerEvent, "clientTime" | "id">, b: Pick<LearnerEvent, "clientTime" | "id">): boolean =>
  Date.parse(b.clientTime) < Date.parse(a.clientTime) || (b.clientTime === a.clientTime && b.id < a.id);

/** A device's corrections in a course: the latest report of each item, by correctionKey. */
export const latestCorrections = (events: readonly LearnerEvent[], course: string): ReadonlyMap<string, SentenceReported> => {
  const latest = new Map<string, SentenceReported>();
  for (const e of events) {
    if (e.type !== "sentence_reported" || e.course !== course) continue;
    const key = correctionKey(e.item, e.step);
    const before = latest.get(key);
    if (before === undefined || later(e, before)) latest.set(key, e);
  }
  return latest;
};

// ------------------------------------------------------------------------- what came of it (ADR 0115)

/**
 * What the course made of a device's correction, by the bundle the device has now (ADR 0115):
 * - `adopted`: every field the correction changed reads as the learner suggested;
 * - `pending`: every field it changed still reads as the learner saw it;
 * - `changed`: the course changed them some other way since (for a note alone, the item reads
 *   otherwise than the learner saw it);
 * - `gone`: the course no longer has the item.
 */
export type CorrectionStatus = "adopted" | "pending" | "changed" | "gone";

/** One field a correction is about: what the learner saw, what they suggested, what the course says now. */
interface Compared {
  readonly was: string | undefined;
  readonly suggested?: string | undefined;
  readonly now: string | undefined;
  /** How the field compares: as written (NFC), or by its letters alone. */
  readonly key: (text: string) => string;
}

const asWritten = (text: string): string => text.normalize("NFC");

const readingAt = (form: CorrectedForm | undefined, r: Pick<TokenReading, "token" | "scheme">): string | undefined =>
  form?.readings?.find((x) => x.token === r.token && x.scheme === r.scheme)?.reading;

/**
 * The fields a correction is about: the ones it changed, or every field shown for a note alone.
 * Texts compare as written, but where the learner changed letters, the vowel marks the profile
 * lists are left out on both sides, as `nabu corrections apply` compares: the course source has
 * the letters, and its vocalization adds the marks (ADR 0053). A translation in another support
 * language than the course's cannot be compared, and is left out.
 */
const comparedFields = (course: CourseView, report: SentenceReported, now: CorrectionFields): readonly Compared[] => {
  const { shown, correction } = report;
  const translations = report.support === course.supportKey;
  const fields: Compared[] = [];
  if (Object.keys(correction.forms ?? {}).length === 0 && correction.translation === undefined) {
    for (const [o, form] of Object.entries(shown.forms ?? {})) {
      fields.push({ was: form.text, now: now.forms?.[o]?.text, key: asWritten });
      for (const r of form.readings ?? []) fields.push({ was: r.reading, now: readingAt(now.forms?.[o], r), key: asWritten });
    }
    if (translations && shown.translation !== undefined) fields.push({ was: shown.translation, now: now.translation, key: asWritten });
    return fields;
  }
  for (const [o, fix] of Object.entries(correction.forms ?? {})) {
    const before = shown.forms?.[o];
    const current = now.forms?.[o];
    if (fix.text !== undefined) {
      const strip = course.profiles.get(o)?.marks?.strip;
      const letters = (text: string): string => (strip === undefined ? asWritten(text) : strip(text));
      const lettersChanged = before?.text === undefined || letters(fix.text) !== letters(before.text);
      fields.push({ was: before?.text, suggested: fix.text, now: current?.text, key: lettersChanged ? letters : asWritten });
    }
    for (const r of fix.readings ?? []) fields.push({ was: readingAt(before, r), suggested: r.reading, now: readingAt(current, r), key: asWritten });
  }
  if (translations && correction.translation !== undefined) fields.push({ was: shown.translation, suggested: correction.translation, now: now.translation, key: asWritten });
  return fields;
};

/**
 * What the course made of a correction, comparing it with the item as the course has it now
 * (`target`, if the caller has it already). Nothing leaves the device (ADR 0115).
 */
export const correctionStatus = (course: CourseView, report: SentenceReported, target: Correctable | undefined = correctable(course, report.item, report.step)): CorrectionStatus => {
  if (target === undefined) return "gone";
  const fields = comparedFields(course, report, shownOf(target));
  const reads = (f: Compared, value: string | undefined): boolean => f.now !== undefined && value !== undefined && f.key(f.now) === f.key(value);
  if (fields.length > 0 && fields.every((f) => reads(f, f.suggested))) return "adopted";
  return fields.every((f) => reads(f, f.was)) ? "pending" : "changed";
};

/**
 * The device's correction of an item while it is still open (pending): the form starts from it and
 * offers to change it. One the course took up, or moved past, leaves a new report to start afresh.
 */
export const openCorrection = (course: CourseView, corrections: ReadonlyMap<string, SentenceReported>, item: string, step?: number): SentenceReported | undefined => {
  const report = corrections.get(correctionKey(item, step));
  return report !== undefined && correctionStatus(course, report) === "pending" ? report : undefined;
};

/** As the rows `nabu corrections apply` reads: a device's own suggestions, pending review. */
export const correctionRows = (reports: Iterable<SentenceReported>): readonly SentenceCorrection[] =>
  [...reports]
    .sort((a, b) => (a.item === b.item ? (a.step ?? -1) - (b.step ?? -1) : a.item < b.item ? -1 : 1))
    .map((e) => ({
      id: e.id,
      course: e.course,
      orthography: e.orthography,
      support: e.support,
      bundle: e.bundle,
      item: e.item,
      ...(e.step === undefined ? {} : { step: e.step }),
      shown: e.shown,
      correction: e.correction,
      notes: e.note === undefined ? [] : [e.note],
      status: "pending",
      reports: 1,
      createdAt: new Date(Date.parse(e.clientTime)).toISOString(),
    }));

/** JSON Lines: one row per line. */
export const jsonLines = (rows: readonly SentenceCorrection[]): string => rows.map((r) => `${JSON.stringify(r)}\n`).join("");
export { draftCount, sentenceSignoffText, signedOff, storySignoffText, type SignOffKind } from "./signoff.ts";
