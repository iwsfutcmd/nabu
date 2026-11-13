/**
 * Pseudo-locales derived from the English catalog (gameplan §17 decision 10):
 *
 * - en-XA, "accented": every ASCII letter becomes an accented look-alike, each
 *   message is bracketed and padded by about 40% so truncation and
 *   concatenation show up.
 * - ar-XB, "mirrored": every word is wrapped in RLM + RLO … PDF + RLM, so the
 *   English reads right to left inside RTL chrome, the way Android's ar-XB does.
 *
 * Only literal text in the MF2 data model is transformed. Placeholders,
 * markup, declarations and variant keys are untouched, so plural selection and
 * bidi isolation behave exactly as in English.
 */
import type { Model } from "messageformat";

export type PseudoLocale = "en-XA" | "ar-XB";
export const PSEUDO_LOCALES: readonly PseudoLocale[] = ["en-XA", "ar-XB"];

const ACCENTED: Readonly<Record<string, string>> = Object.fromEntries(
  [
    ..."abcdefghijklmnopqrstuvwxyz".split("").map((c, i) => [c, "åƀçðéƒĝĥîĵķļɱñöþǫŕšţûṽŵẋýž"[i]]),
    ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((c, i) => [c, "ÅƁÇÐÉƑĜĤÎĴĶĻṀÑÖÞǪŔŠŢÛṼŴẊÝŽ"[i]]),
  ].filter((pair): pair is [string, string] => pair[1] !== undefined),
);
const FILLER = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

const accent = (text: string): string => text.replace(/[A-Za-z]/g, (c) => ACCENTED[c] ?? c);

/** Filler that lengthens a message by ~40% (at least one word). */
const padding = (letters: number): string => {
  const target = Math.max(3, Math.ceil(letters * 0.4));
  const words: string[] = [];
  let length = 0;
  for (let i = 0; length < target; i++) {
    const word = FILLER[i % FILLER.length] as string;
    words.push(word);
    length += word.length + 1;
  }
  return words.join(" ");
};

const RLM = "\u200F";
const RLO = "\u202E";
const PDF = "\u202C";
const mirror = (text: string): string => text.replace(/[^\s]+/gu, (word) => `${RLM}${RLO}${word}${PDF}${RLM}`);

const transformPattern = (pattern: Model.Pattern, locale: PseudoLocale): Model.Pattern => {
  const out: Model.Pattern = pattern.map((part) =>
    typeof part !== "string" ? part : locale === "en-XA" ? accent(part) : mirror(part),
  );
  if (locale === "en-XA") {
    const letters = pattern.reduce((n, p) => n + (typeof p === "string" ? (p.match(/[A-Za-z]/g) ?? []).length : 4), 0);
    out.unshift("[");
    out.push(` ${padding(letters)}]`);
  }
  return out;
};

/** Pseudo-localizes plain text as a message's literal text is: a name from course data (ADR 0109). */
export const pseudoLocalizeText = (text: string, locale: PseudoLocale): string =>
  transformPattern([text], locale)
    .map((part) => (typeof part === "string" ? part : ""))
    .join("");

/** Pseudo-localizes one MF2 message (data model in, data model out). */
export const pseudoLocalizeMessage = (message: Model.Message, locale: PseudoLocale): Model.Message =>
  message.type === "message"
    ? { ...message, pattern: transformPattern(message.pattern, locale) }
    : { ...message, variants: message.variants.map((v) => ({ ...v, value: transformPattern(v.value, locale) })) };
