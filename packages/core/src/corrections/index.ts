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

/** A device's corrections in a course: the latest report of each item, by correctionKey. */
export const latestCorrections = (events: readonly LearnerEvent[], course: string): ReadonlyMap<string, SentenceReported> => {
  const latest = new Map<string, SentenceReported>();
  for (const e of events) {
    if (e.type !== "sentence_reported" || e.course !== course) continue;
    const key = correctionKey(e.item, e.step);
    const before = latest.get(key);
    if (before === undefined || Date.parse(before.clientTime) < Date.parse(e.clientTime) || (before.clientTime === e.clientTime && before.id < e.id)) latest.set(key, e);
  }
  return latest;
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
