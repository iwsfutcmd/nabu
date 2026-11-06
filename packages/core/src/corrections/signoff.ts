/**
 * Sign-off (ADR 0072), pure: a reviewer reads a sentence or a whole story and finds it right.
 * What they saw is pinned by `signoffText`, which the app hashes (sha256) into the sign-off's
 * `shown`; `nabu review apply` builds the same text from its own compile of the course and applies
 * a sign-off only while the two agree. The text is every orthography's form and every
 * translation, as compiled (vowel marks and all), one line each, NFC:
 *
 *   sentence <id>                         story <id>
 *   form <orthography> <text>             line <step>
 *   translation <support> <text>          form <orthography> <text>
 *                                         translation <support> <text>
 *                                         line <step> …
 *
 * Fields are separated by tabs, lines by "\n"; orthographies and supports in code-point order.
 * pipeline/src/nabu/review keeps the Python twin: change both, with the test that pins them.
 */
import type { BundleSentence, BundleStory, BundleUnit, Provenance, TaggedText } from "@nabu/schema";
import { surfaceOf } from "../text/tagged-text.ts";

export type SignOffKind = "sentence" | "story";

const byKey = <T>(record: Readonly<Record<string, T>>): [string, T][] => Object.entries(record).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

const text = (t: TaggedText): string => surfaceOf(t).normalize("NFC");

const block = (forms: Readonly<Record<string, TaggedText>>, translations: Readonly<Record<string, TaggedText>>): string[] => [
  ...byKey(forms).map(([orthography, form]) => `form\t${orthography}\t${text(form)}`),
  ...byKey(translations).map(([support, translation]) => `translation\t${support}\t${text(translation)}`),
];

/** What a reviewer saw of a sentence, as the text its sign-off fingerprints. */
export const sentenceSignoffText = (s: BundleSentence): string =>
  [
    `sentence\t${s.id}`,
    ...block(
      Object.fromEntries(Object.entries(s.forms).map(([o, f]) => [o, f.text])),
      Object.fromEntries(Object.entries(s.translations).map(([k, t]) => [k, t.text])),
    ),
  ].join("\n");

/** What a reviewer saw of a story: every line, in order (its questions are not content to sign off). */
export const storySignoffText = (story: BundleStory): string =>
  [`story\t${story.id}`, ...story.steps.flatMap((step, i) => (step.line === undefined ? [] : [`line\t${String(i)}`, ...block(step.line.forms, step.line.translations)]))].join("\n");

/** Whether an item's provenance says a reviewer has signed it off already. */
export const signedOff = (provenance: Provenance | undefined): boolean => provenance?.status === "reviewed" || provenance?.status === "published";

/**
 * How much of a course no reviewer has signed off yet, in sentences: its own, and its stories'
 * lines (a story is signed off whole). A release build (ADR 0073) has none; the demo shows the count.
 */
export const draftCount = (units: readonly BundleUnit[]): { readonly drafts: number; readonly total: number } => {
  let drafts = 0;
  let total = 0;
  for (const unit of units) {
    for (const s of unit.sentences) {
      total += 1;
      if (!signedOff(s.provenance)) drafts += 1;
    }
    for (const story of unit.stories ?? []) {
      const lines = story.steps.filter((step) => step.line !== undefined).length;
      total += lines;
      if (!signedOff(story.provenance)) drafts += lines;
    }
  }
  return { drafts, total };
};
