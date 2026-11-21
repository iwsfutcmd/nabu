/**
 * What a token of a sentence is, in the lexical model (ADR 0145): the lexemes it writes, each with
 * the feature values chosen there. There is no unit between a token and a lexeme: a stem, a clitic
 * and an affix are all lexemes of the token, and one of them is its base, what the others are merged
 * onto. A choice that asks one thing (ADR 0132) asks a token by its base (which lexeme) or by
 * everything else about it (which form). Pure; shared by lessons, stories, credit and the word list.
 */
import type { BundleLexeme, BundleTag, FormKey, LexemeId, PartId, Persons, Question, Token, UdFeatures, WrittenLexeme } from "@nabu/schema";

export type { Question };

const LEXEME = "lexeme:";
const FEATURE = "feature:";

/** Who speaks and who is spoken to in a sentence (ADR 0056), where its tags say: what a prompt shows and voices are cast by. */
export const sentencePersons = (s: { readonly tags?: readonly BundleTag[] | undefined }): Persons | undefined => {
  for (const tag of s.tags ?? []) if ("persons" in tag) return tag.persons;
  return undefined;
};

/** What a part or a teachable is: a lexeme, a feature value, a rule or a letter. */
export type PartKind = "lexeme" | "feature" | "rule" | "grapheme";

export const kindOf = (part: string): PartKind => part.slice(0, part.indexOf(":")) as PartKind;

/** Whether a part is a lexeme itself, not something of it (lexeme:mano, not lexeme:mano|Gender). */
export const isLexeme = (part: string): boolean => part.startsWith(LEXEME) && !part.includes("|");

/** The lexeme, feature value or rule a part is of: the part itself, or what stands before its bar. */
export const nodeOf = (part: PartId): string => {
  const bar = part.indexOf("|");
  return bar < 0 ? part : part.slice(0, bar);
};

/** One value of one feature, as a node introduces it and a card credits it: feature:Tense=Past. */
export const featureId = (name: string, value: string): PartId => `${FEATURE}${name}=${value}`;

/** The lexemes a token writes, in the order it writes them; none for a space, punctuation or a bare word. */
export const lexemesOf = (token: Token): readonly WrittenLexeme[] => token.lexemes ?? [];

/** The ids of the lexemes a token writes, each once, in order. */
export const lexemeIdsOf = (token: Token): readonly LexemeId[] => [...new Set(lexemesOf(token).map((l) => l.lexeme))];

/** The lexeme a token's others are merged onto: the one marked, or its only one. A token of two equals has none. */
export const baseOf = (token: Token): WrittenLexeme | undefined => {
  const lexemes = lexemesOf(token);
  return lexemes.length === 1 ? lexemes[0] : lexemes.find((l) => l.base === true);
};

/** The id of a token's base lexeme. */
export const baseIdOf = (token: Token): LexemeId | undefined => baseOf(token)?.lexeme;

/**
 * Whether a lexeme is written only inside words (an ending, a suffixed pronoun): the course cites
 * no spelling of it in any orthography. A parts card names it by its gloss, and asks it (ADR 0152).
 */
export const bound = (lexeme: BundleLexeme): boolean => Object.values(lexeme.forms ?? {}).every((spellings) => spellings.length === 0);

/** Whether a token is analysed: it names a lexeme. */
export const analysed = (token: Token): boolean => lexemesOf(token).length > 0;

const featsText = (feats: UdFeatures | undefined, join: string): string =>
  Object.keys(feats ?? {})
    .sort()
    .map((name) => `${name}=${(feats ?? {})[name] ?? ""}`)
    .join(join);

/** One lexeme in one form, as a string to key by (schemas/common.schema.json `FormKey`). */
export const lexemeFormKey = (lexeme: LexemeId, feats?: UdFeatures | undefined): FormKey => {
  const said = featsText(feats, ";");
  return said === "" ? lexeme : `${lexeme}|form:${said}`;
};

/**
 * A token's form key: each lexeme it writes, in order, in the form it has there, joined by `+`
 * (lexeme:ra7|form:Aspect=Part;Gender=Masc;Number=Sing, lexeme:badd+lexeme:poss-1sg). It names the
 * pairs a learner has seen (ADR 0146). pipeline/src/nabu/formkey.py is its twin; the conformance
 * vectors of kind `form-key` hold the two together. Undefined for a token that names no lexeme.
 */
export const formKey = (token: Token): FormKey | undefined => {
  const lexemes = lexemesOf(token);
  return lexemes.length === 0 ? undefined : lexemes.map((l) => lexemeFormKey(l.lexeme, l.feats)).join("+");
};

/** A form key's lexemes and their feature values: the inverse of `formKey`. */
export const parseFormKey = (key: FormKey): readonly { readonly lexeme: LexemeId; readonly feats: UdFeatures }[] =>
  key.split("+").map((part) => {
    const at = part.indexOf("|form:");
    const lexeme = at < 0 ? part : part.slice(0, at);
    const said = at < 0 ? "" : part.slice(at + "|form:".length);
    const feats = Object.fromEntries(said === "" ? [] : said.split(";").map((pair) => [pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1)]));
    return { lexeme, feats };
  });

/**
 * The feature values a token's base has there, in all: those chosen on the token, and those its
 * lexeme has of itself (a noun's gender, stored or by a default of its language). la mano and la
 * casa are both feminine singular, though only hermana chooses it.
 */
export const effectiveFeats = (token: Token, lexeme: BundleLexeme | undefined): UdFeatures => ({ ...(lexeme?.feats ?? {}), ...(baseOf(token)?.feats ?? {}) });

/**
 * A token's form signature (ADR 0132): everything it writes but which lexeme its base is, as a
 * sorted list. The other lexemes it writes with it (an ending, a clitic, an article), each with its
 * own values, and the feature values its base has there (`effectiveFeats`), each as Name=Value. A
 * lexeme question's options share the answer's signature and part of speech, so only meaning tells
 * them apart; a form question's share its lexeme, so only grammar does, and the nearest forms are
 * those that share most of it. `lexeme`: the entry of the token's base, for what it has of itself.
 */
export const formSignature = (token: Token, lexeme: BundleLexeme | undefined): readonly string[] => {
  const base = baseOf(token);
  const others = lexemesOf(token)
    .filter((l) => l !== base)
    .map((l) => lexemeFormKey(l.lexeme, l.feats));
  const feats = effectiveFeats(token, lexeme);
  const values = Object.keys(feats).flatMap((name) => (feats[name] ?? "").split(",").map((value) => `${name}=${value}`));
  return [...new Set([...others, ...values])].sort();
};

/**
 * The parts a form question about a token asks (ADR 0132): the other lexemes it writes with its
 * base, and the feature values chosen on its base that the sentence teaches (`taught`: the
 * sentence's parts, where the compiler lists the values the course has introduced by then).
 */
export const formPartsOf = (token: Token, taught: ReadonlySet<PartId>): readonly PartId[] => {
  const base = baseOf(token);
  const others = lexemesOf(token)
    .filter((l) => l !== base)
    .map((l) => l.lexeme);
  const values = Object.entries(base?.feats ?? {}).flatMap(([name, said]) => said.split(",").map((value) => featureId(name, value)));
  return [...new Set([...others, ...values.filter((v) => taught.has(v))])].sort();
};

/**
 * The parts a fill-in's answer is credited to (ADR 0132): its base lexeme where it asked which
 * lexeme (the form was given: every option had it), its form's parts where it asked which form (the
 * lexeme was given).
 */
export const askedOfToken = (token: Token, asks: Question, taught: ReadonlySet<PartId>): readonly PartId[] => {
  if (asks === "form") return formPartsOf(token, taught);
  const base = baseIdOf(token);
  return base === undefined ? [] : [base];
};

/**
 * Whether a lexeme may stand against the answer in a lexeme question (ADR 0132): where the answer
 * has a part of speech, the same one; where it has none, any. What each has of itself beyond that
 * (a classifier's NounType, a noun's gender) is part of the form its token stands in (`formSignature`).
 */
export const sameKind = (answer: BundleLexeme | undefined, candidate: BundleLexeme | undefined): boolean => answer?.pos === undefined || candidate?.pos === answer.pos;
