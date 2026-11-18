/**
 * What a word of a sentence is, for a choice that asks one thing (ADR 0132): its sense, and its form
 * signature, the KCs of its form. A word question's options share the answer's signature and part of
 * speech, so only meaning tells them apart; a form question's share its sense, so only grammar does.
 * Pure; shared by lessons (gap-fill), stories (complete) and credit.
 */
import type { Asks, BundleKc, KcId, Token } from "@nabu/schema";

export type { Asks };

/** The token's sense KC, where it names one. */
export const senseKcOf = (token: Token): KcId | undefined => (token.sense === undefined ? undefined : (`sense:${token.sense}` as KcId));

/**
 * The token's form signature: its morph KCs other than its sense (an ending, a clitic, an article
 * written with it) and the form its source pins it as (es, grc, hbo); sorted, each once. A bare word's
 * is empty.
 */
export const formSignature = (token: Token): readonly KcId[] => {
  const sense = senseKcOf(token);
  const kcs = new Set<KcId>((token.morphs ?? []).map((m) => m.kc).filter((kc) => kc !== sense));
  if (token.form !== undefined) kcs.add(token.form);
  return [...kcs].sort();
};

/** The form signature as one string, to compare and index by. */
export const signatureKey = (token: Token): string => formSignature(token).join(" ");

/**
 * The KCs a fill-in's answer is credited to (ADR 0132): its sense where it asked which word (the form
 * was given: every option had it), its form signature where it asked which form (the word was given).
 */
export const askedOfToken = (token: Token, asks: Asks): readonly KcId[] => {
  if (asks === "form") return formSignature(token);
  const sense = senseKcOf(token);
  return sense === undefined ? [] : [sense];
};

const sameFeatures = (a: BundleKc["features"], b: BundleKc["features"]): boolean => {
  const ak = Object.keys(a ?? {});
  const bk = Object.keys(b ?? {});
  return ak.length === bk.length && ak.every((k) => a?.[k] === b?.[k]);
};

/**
 * Whether a word may stand against the answer in a word question (ADR 0132): where the answer's KC
 * has a part of speech, the same part of speech and exactly the same UD features (a classifier only
 * against classifiers); where it has none, any (the form signature alone decides).
 */
export const sameKind = (answer: BundleKc | undefined, candidate: BundleKc | undefined): boolean =>
  answer?.pos === undefined || (candidate?.pos === answer.pos && sameFeatures(answer.features, candidate.features));
