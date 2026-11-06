/**
 * Sign-off (ADR 0071), pure: a reviewer reads a sentence or a whole story and finds it right.
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
import type { BundleSentence, BundleStory, Provenance, TaggedText } from "@nabu/schema";
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
