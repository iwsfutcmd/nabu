/**
 * A lexeme's forms as the bundle lists them (docs/rules-design.md, stage 4; the owner's answer 3:
 * the compiler lists forms, the device looks them up). The lexicon's `cells` name, per category, the
 * cells its paradigms list (a form key's feature part: Aspect=Imp;Mood=Ind;…); each lexeme's
 * `paradigm` holds, per orthography, each cell's spelling or, where the orthography has a marked
 * layer, the spelling and the marked text, or null where the rules give none.
 *
 * Read here and only here: what grading knows of a course's words (`paradigmForms`), the forms a
 * word is shown with after its lemma (`principalParts`), and the Data page's table (`paradigmRows`).
 * Nothing on the device realises or spells: the forms are the compiler's, checked there.
 *
 * Pure: the lexicon and the course are passed in.
 */
import type { BundleLexeme, BundleLexicon, BundleParadigmForm, LexemeId, PartOfSpeech, TaggedText, UdFeatures } from "@nabu/schema";
import type { WordForm } from "../match/compare.ts";
import type { LexemeForm } from "../match/grade.ts";
import { lexemeFormKey } from "./lexemes.ts";

/** A cell's feature values from its key (Aspect=Imp;Mood=Ind → { Aspect: "Imp", Mood: "Ind" }). */
export const cellFeats = (cell: string): UdFeatures =>
  Object.fromEntries(
    cell
      .split(";")
      .filter((pair) => pair.includes("="))
      .map((pair) => [pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1)]),
  );

/** One form a paradigm lists, in one orthography. */
export interface ParadigmForm {
  readonly lexeme: LexemeId;
  readonly pos: PartOfSpeech;
  /** The cell, as the lexicon keys it. */
  readonly cell: string;
  readonly feats: UdFeatures;
  /** The spelling the orthography's `spell` writes: what grading keys. */
  readonly spelling: string;
  /** The marked text, where the orthography has a marked layer (apc's vowel marks). */
  readonly marked?: string;
}

const formOf = (entry: BundleParadigmForm | undefined): { readonly spelling: string; readonly marked?: string } | undefined => {
  if (entry === null || entry === undefined) return undefined;
  if (typeof entry === "string") return { spelling: entry };
  const [spelling, marked] = entry;
  return spelling === undefined ? undefined : marked === undefined ? { spelling } : { spelling, marked };
};

/** A lexeme's forms in one orthography, cell by cell (those the rules give: none for a null). */
export const formsOfLexeme = (lexicon: Pick<BundleLexicon, "cells">, lexeme: BundleLexeme, orthography: string): readonly ParadigmForm[] => {
  const row = lexeme.paradigm?.[orthography];
  const pos = lexeme.pos;
  const cells = pos === undefined ? undefined : lexicon.cells?.[pos];
  if (row === undefined || pos === undefined || cells === undefined) return [];
  return cells.flatMap((cell, k) => {
    const form = formOf(row[k]);
    return form === undefined ? [] : [{ lexeme: lexeme.id, pos, cell, feats: cellFeats(cell), ...form }];
  });
};

/** Every form the lexicon's paradigms list in an orthography: what grading adds to the words a course writes. */
export const paradigmForms = (lexicon: Pick<BundleLexicon, "cells" | "lexemes">, orthography: string): readonly ParadigmForm[] =>
  lexicon.cells === undefined ? [] : lexicon.lexemes.flatMap((lexeme) => formsOfLexeme(lexicon, lexeme, orthography));

/**
 * The forms a word is shown with after its lemma wherever it is presented as itself (a new word, the
 * word list, a tapped word's meaning): its category's principal parts (the language's
 * `principalParts`; apc: a verb's he-present after its he-past), each the paradigm's form, in order.
 * Each a text of its own whose one token names the lexeme and the cell, so `<T>` renders it as the
 * lemma (`like`: its language, marks and direction) and what it shows is logged as that form (ADR
 * 0146). The marked text where the paradigm has one, as the lemma's own text carries its marks.
 * None where its category has none, or the rules give none of them.
 */
export const principalParts = (lexicon: Pick<BundleLexicon, "cells" | "principalParts">, lexeme: BundleLexeme | undefined, orthography: string): readonly TaggedText[] => {
  const pos = lexeme?.pos;
  if (lexeme === undefined || pos === undefined) return [];
  const parts = lexicon.principalParts?.[pos];
  const like = lexeme.forms?.[orthography]?.[0];
  if (parts === undefined || like === undefined) return [];
  const forms = new Map(formsOfLexeme(lexicon, lexeme, orthography).map((f) => [f.cell, f]));
  return parts.flatMap((cell) => {
    const form = forms.get(cell);
    if (form === undefined) return [];
    const surface = (form.marked ?? form.spelling).normalize("NFC");
    const text: TaggedText = {
      lang: like.lang,
      orthography: like.orthography,
      tokens: [{ kind: "lexical", surface, tileGroup: 0, lexemes: [{ lexeme: lexeme.id, feats: form.feats }] }],
    };
    return [text];
  });
};

/** One row of a lexeme's paradigm table: a cell, and its form in each orthography (undefined: none). */
export interface ParadigmRow {
  readonly cell: string;
  readonly feats: UdFeatures;
  readonly forms: Readonly<Record<string, { readonly spelling: string; readonly marked?: string } | undefined>>;
  /** Where realising with blocking off gives another form (ADR 0145: regularised), by orthography. */
  readonly regularised?: Readonly<Record<string, { readonly spelling: string; readonly marked?: string }>>;
}

/** A lexeme's paradigm as a table: its category's cells, each with its form in every orthography the paradigm lists. */
export const paradigmRows = (lexicon: Pick<BundleLexicon, "cells">, lexeme: BundleLexeme): readonly ParadigmRow[] => {
  const pos = lexeme.pos;
  const cells = pos === undefined ? undefined : lexicon.cells?.[pos];
  if (cells === undefined || lexeme.paradigm === undefined) return [];
  const orthographies = Object.keys(lexeme.paradigm).sort();
  return cells.map((cell, k) => {
    const regularised = Object.fromEntries(
      orthographies.flatMap((o) => {
        const form = formOf(lexeme.regularised?.[o]?.[cell]);
        return form === undefined ? [] : [[o, form] as const];
      }),
    );
    return {
      cell,
      feats: cellFeats(cell),
      forms: Object.fromEntries(orthographies.map((o) => [o, formOf(lexeme.paradigm?.[o]?.[k])])),
      ...(Object.keys(regularised).length > 0 && { regularised }),
    };
  });
};

/** A paradigm's form as grading knows a word: its key, the form it stands in, and whose form it is. */
export interface ParadigmWord {
  readonly key: string;
  readonly lexeme: LexemeId;
  /** Its part of speech and feature values: its lexeme's own, then the cell's. */
  readonly form: WordForm;
  /** Its lexeme and the form key of the cell (lexeme:shereb|form:Aspect=Imp;…), as a token in that form would give. */
  readonly written: LexemeForm;
}

/**
 * The words a lexicon's paradigms add to what grading knows of a course in an orthography (docs/
 * rules-design.md, section 6: "a grader that knows every form the rules give"): each form that is one
 * unit as the profile keys it (`keys`), as a token that writes it in that cell would be known. A typed
 * word that is an unwritten form of the answer's own lexeme is then another form of it (grammatical),
 * one of another lexeme's is another word (lexical), as for a form some token writes.
 */
export const paradigmWords = (lexicon: Pick<BundleLexicon, "cells" | "lexemes">, orthography: string, keys: (text: string) => readonly string[]): readonly ParadigmWord[] => {
  const own = new Map(lexicon.lexemes.map((l) => [l.id, l.feats] as const));
  return paradigmForms(lexicon, orthography).flatMap((f) => {
    const ks = keys(f.spelling);
    if (ks.length !== 1) return [];
    return [{ key: ks[0] as string, lexeme: f.lexeme, form: { pos: f.pos, feats: { ...(own.get(f.lexeme) ?? {}), ...f.feats } }, written: { lexeme: f.lexeme, form: lexemeFormKey(f.lexeme, f.feats) } }];
  });
};
