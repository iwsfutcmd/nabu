/**
 * A lexeme's forms, as a tapped word's glossary entry lists them (ADR 0157). Where the lexicon's
 * rules give the lexeme a paradigm (apc's verbs and adjectives: `formsOfLexeme`), every cell it
 * lists; otherwise every form the course's sentences and story lines write. Each form is named as
 * the language names it (`labelOf`), and the cell the tapped word stands in is found the same way
 * (`formCellAt`), so the entry can say which of them the word is.
 *
 * A form is the lexeme with one set of feature values (ADR 0145): those its token chooses on it and,
 * where it is the token's base, those its endings realise (uz ич·а·ман: Tense=Pres, Number=Sing,
 * Person=1; yue 佢·哋: Number=Plur). Endings that realise values belong to the form, which is then
 * the whole token as written, its readings with it. A clitic, an article or a suffixed pronoun written
 * with the lexeme is another lexeme: the form is the lexeme's own letters (بَدّ in بَدّي, גָּן in הַגָּן).
 *
 * Nothing is realised or spelled here: a paradigm's forms are the compiler's, the rest the course's
 * own tokens. Pure; built once per course view and orthography.
 */
import type { BundleLexeme, LexemeId, SchemeId, TaggedText, Token, UdFeatures, WrittenLexeme } from "@nabu/schema";
import { lexiconKey } from "../match/grade.ts";
import { readingProjection } from "../profile/schemes.ts";
import { compareByReading } from "../project/by-reading.ts";
import type { CompiledProfile } from "../profile/index.ts";
import { surfaceOf } from "../text/tagged-text.ts";
import { labelOf, lexemesById, type CourseView } from "./course.ts";
import { baseIdOf, bound, lexemesOf } from "./lexemes.ts";
import { formsOfLexeme } from "./paradigms.ts";
import { caseForTiles } from "./tiles.ts";

/** One form of a lexeme. */
export interface LexemeFormRow {
  /** Its feature values as the lexicon keys a cell (Aspect=Imp;Mood=Ind;…); "" for a form no value sets apart. */
  readonly cell: string;
  readonly feats: UdFeatures;
  /** What the language calls it, in the support language, where it names it (`labelOf`, with the lexeme's own values). */
  readonly label?: TaggedText | undefined;
  /**
   * The form as the orthography writes it, each a text of one token naming the lexeme and the cell: one
   * text a way, the ways its profile states as one spelling merged (the most written kept), most written first.
   */
  readonly texts: readonly TaggedText[];
  /** A sentence or story line of the course writes it (a paradigm's other cells are the rules' alone). */
  readonly attested: boolean;
}

export interface LexemeForms {
  readonly lexeme: LexemeId;
  /** Where the forms come from: the paradigm the compiler lists, or the words the course writes. */
  readonly source: "paradigm" | "written";
  readonly rows: readonly LexemeFormRow[];
}

/** A cell's key from its feature values, as the lexicon writes cells (names sorted, `;` between). */
const cellOf = (feats: UdFeatures): string =>
  Object.keys(feats)
    .sort()
    .map((name) => `${name}=${feats[name] ?? ""}`)
    .join(";");

/** An ending that realises feature values (an affix the script writes only inside words: uz -а, -ман; yue 哋). */
const realising = (lexeme: BundleLexeme | undefined): lexeme is BundleLexeme & { readonly realises: UdFeatures } =>
  lexeme !== undefined && lexeme.realises !== undefined && bound(lexeme);

/** How a token writes one of its lexemes: the form's values, its letters, and whether nothing else is written with it. */
/**
 * How well a way of writing a form witnesses it: the whole token (the token writes the lexeme and its
 * endings alone, readings and all); the lexeme's letters with nothing written after them (after an
 * article or a preposition: מָּקוֹם of בַּמָּקוֹם); or a stem cut before a clitic or suffix (מְקוֹמ of
 * מְקוֹמוֹ), the least.
 */
type Witness = "whole" | "final" | "stem";

const WITNESS_RANK: Readonly<Record<Witness, number>> = { whole: 0, final: 1, stem: 2 };

interface Written {
  readonly feats: UdFeatures;
  readonly text: TaggedText;
  readonly witness: Witness;
}

const writtenIn = (lexemes: ReadonlyMap<string, BundleLexeme>, text: TaggedText, at: number, lexeme: LexemeId): Written | undefined => {
  const token = text.tokens[at];
  if (token === undefined || token.kind !== "lexical") return undefined;
  const written = lexemesOf(token);
  const own = written.find((l) => l.lexeme === lexeme);
  if (own === undefined) return undefined;
  const isBase = own.base === true || written.length === 1;
  const endings = isBase ? written.filter((l) => l !== own && realising(lexemes.get(l.lexeme))) : [];
  const feats: UdFeatures = endings.reduce<UdFeatures>((all, l) => ({ ...all, ...(lexemes.get(l.lexeme)?.realises ?? {}) }), { ...(own.feats ?? {}) });
  if (written.every((l) => l === own || endings.includes(l))) {
    const { tileGroup: _tile, ...alone } = token;
    return { feats, text: { ...text, tokens: [{ ...alone, tileGroup: 0 }] }, witness: "whole" };
  }
  // The lexeme's own letters and its endings', in the token's order: a token's lexemes' surfaces concatenate to its own.
  const surface = written
    .filter((l) => l === own || endings.includes(l))
    .map((l: WrittenLexeme) => l.surface ?? "")
    .join("")
    .normalize("NFC");
  if (surface === "") return undefined;
  const alone: Token = { kind: "lexical", surface, tileGroup: 0, lexemes: [{ lexeme, ...(Object.keys(feats).length > 0 && { feats }) }] };
  // Something the script writes after it that is no ending of its form: a clitic or a suffixed pronoun.
  const after = written.slice(written.indexOf(own) + 1).some((l) => !endings.includes(l) && l.surface !== "");
  return { feats, text: { lang: text.lang, orthography: text.orthography, tokens: [alone] }, witness: after ? "stem" : "final" };
};

/** One way the course writes a form: the text, how well it witnesses the form, how often. */
interface Way {
  text: TaggedText;
  witness: Witness;
  count: number;
  readonly first: number;
}

interface Cell {
  readonly feats: UdFeatures;
  readonly first: number;
  /** Each way it is written, by its comparison key. */
  readonly ways: Map<string, Way>;
}

/**
 * Whether two ways of writing a form are one spelling of it, as the orthography's profile states it:
 * - spellings alike once folded and stripped of the profile's marks (vowel points, accents): بَدّ and
 *   بَدَّ, ἐστί, ἐστὶ and ἐστι, the marks a word takes from its neighbours;
 * - where the sound is a token's pinned reading (chg-Arab, hbo-Hebr), two whole tokens that pin the
 *   same reading, the scribes' letters free (عالمینکزلار and عالمینکیزلار, ʿāliminizlar), or a
 *   paradigm's form whose letters the scheme reads as such a token's reading (עֹמֵד beside עוֹמֵד);
 * - where it is the spelling's, two spellings apart only by free correspondences (bar -n/-en).
 * Anything else (es buen beside bueno, grc ἐστι beside ἐστιν) is two ways a learner should see.
 */
const sameForm = (profile: CompiledProfile | undefined): ((a: Way, b: Way) => boolean) => {
  if (profile === undefined) return () => false;
  const bare = (w: Way): string => {
    const folded = profile.fold(surfaceOf(w.text).normalize("NFC"));
    return (profile.marks?.strip(folded) ?? folded).normalize("NFC");
  };
  const projection = profile.projection;
  const sounds: (a: Way, b: Way) => boolean =
    projection === undefined
      ? () => false
      : projection.from === "reading"
        ? (a, b) => {
            const reading = (w: Way): string | undefined => (w.witness === "whole" ? w.text.tokens[0]?.readings?.[projection.scheme as SchemeId]?.normalize("NFC") : undefined);
            const ra = reading(a);
            const rb = reading(b);
            if (ra !== undefined || rb !== undefined) {
              if (ra !== undefined && rb !== undefined) return ra === rb;
              // A paradigm's form pins no reading: it is one spelling of a word whose reading its letters
              // spell, by the scheme's statement, the scribes' letters free (hbo עֹמֵד beside עוֹמֵד, ʿōmēḏ).
              const scheme = readingProjection(projection.scheme);
              const [read, unread] = ra !== undefined ? [a, b] : [b, a];
              const c = scheme === undefined ? undefined : compareByReading(scheme, [ra ?? rb ?? ""], surfaceOf(read.text), surfaceOf(unread.text));
              return c !== undefined && c.same && (c.differs.length === 0 || c.free);
            }
            return false;
          }
        : (a, b) => projection.compare(surfaceOf(a.text), surfaceOf(b.text)).free;
  return (a, b) => bare(a) === bare(b) || sounds(a, b);
};

/**
 * A form's ways as one list, most written first: the ways that are one spelling of it merged (the most
 * written kept). Only the best witnesses count: where a token writes the form as a word of its own,
 * those tokens; else the one way written most, the lexeme's letters with nothing after them before a
 * stem cut before a suffix.
 */
const keptWays = (cell: Cell, same: (a: Way, b: Way) => boolean): readonly Way[] => {
  const all = [...cell.ways.values()];
  const best = Math.min(...all.map((w) => WITNESS_RANK[w.witness]));
  const kept: Way[] = [];
  for (const way of all.filter((w) => WITNESS_RANK[w.witness] === best).sort((a, b) => b.count - a.count || a.first - b.first)) {
    const like = kept.find((k) => same(k, way));
    if (like === undefined) kept.push({ ...way });
    else like.count += way.count;
  }
  const ordered = kept.sort((a, b) => b.count - a.count || a.first - b.first);
  return best === WITNESS_RANK.whole ? ordered : ordered.slice(0, 1);
};

const waysOf = (cell: Cell, same: (a: Way, b: Way) => boolean): readonly TaggedText[] => keptWays(cell, same).map((w) => w.text);

/**
 * A paradigm's form beside the ways the course writes its cell: the form first, with the pinned
 * readings of a word the course writes that is one spelling of it (hbo בֵּן's), then the course's other
 * words of the form (es buen beside bueno, sk vo beside v). A stem cut before a suffix is never one.
 */
const besideParadigm = (form: TaggedText, cell: Cell | undefined, same: (a: Way, b: Way) => boolean): readonly TaggedText[] => {
  if (cell === undefined) return [form];
  const way = (text: TaggedText): Way => ({ text, witness: "whole", count: 0, first: -1 });
  // The readings of a word the course writes as the form is spelled; then the form is compared as that word is.
  const like = [...cell.ways.values()].find((w) => w.witness === "whole" && same(way(form), w));
  // Its readings and their ruby both (what <T> draws over it: chg's Schluessel).
  const readings = like?.text.tokens[0]?.readings;
  const ruby = like?.text.tokens[0]?.ruby;
  const [token] = form.tokens;
  const shown: TaggedText = readings === undefined || token === undefined ? form : { ...form, tokens: [{ ...token, readings, ...(ruby !== undefined && { ruby }) }] };
  const others = keptWays(cell, same)
    .filter((w) => w.witness !== "stem" && !same(way(shown), w))
    .map((w) => w.text);
  return [shown, ...others];
};

/** Every form the course writes, by lexeme and cell, in one orthography. */
type Index = ReadonlyMap<LexemeId, ReadonlyMap<string, Cell>>;

const indexes = new WeakMap<CourseView, Map<string, Index>>();

const texts = function* (course: CourseView, orthography: string): Generator<TaggedText> {
  for (const unit of course.units) {
    for (const s of unit.sentences) {
      const text = s.forms[orthography]?.text;
      if (text !== undefined) yield text;
    }
    for (const story of unit.stories ?? []) {
      for (const step of story.steps) {
        const text = step.line?.forms[orthography];
        if (text !== undefined) yield text;
      }
    }
  }
};

const indexOf = (course: CourseView, orthography: string): Index => {
  let byOrthography = indexes.get(course);
  if (byOrthography === undefined) {
    byOrthography = new Map();
    indexes.set(course, byOrthography);
  }
  const cached = byOrthography.get(orthography);
  if (cached !== undefined) return cached;
  const lexemes = lexemesById(course);
  const profile = course.profiles.get(orthography);
  const keyOf = (text: TaggedText): string => {
    const surface = text.tokens.map((t) => t.surface).join("");
    return profile === undefined ? surface.normalize("NFC") : lexiconKey(profile, surface);
  };
  // A word starting a sentence is listed in lower case where the course writes it so (tilesOf's rule,
  // ADR 0130), or where its lexeme's lemma is in lower case: ¡Haz! is a form of hacer, Nebola of byť.
  const lowerLemma = new Map<LexemeId, boolean>();
  const lowerCased = (token: Token): boolean => {
    const id = baseIdOf(token);
    if (id === undefined) return false;
    let lower = lowerLemma.get(id);
    if (lower === undefined) {
      const lemma = lexemes.get(id)?.forms?.[orthography]?.[0];
      const surface = lemma === undefined ? undefined : surfaceOf(lemma);
      lower = surface !== undefined && lemma !== undefined && surface.toLocaleLowerCase(lemma.lang) === surface;
      lowerLemma.set(id, lower);
    }
    return lower;
  };
  const index = new Map<LexemeId, Map<string, Cell>>();
  let seen = 0;
  for (const raw of texts(course, orthography)) {
    const text = caseForTiles(course, raw, lowerCased);
    for (const [at, token] of text.tokens.entries()) {
      for (const id of new Set(lexemesOf(token).map((l) => l.lexeme))) {
        const lexeme = lexemes.get(id);
        if (lexeme === undefined || bound(lexeme)) continue;
        const written = writtenIn(lexemes, text, at, id);
        if (written === undefined) continue;
        const cells = index.get(id) ?? new Map<string, Cell>();
        index.set(id, cells);
        const cell = cellOf(written.feats);
        const entry: Cell = cells.get(cell) ?? { feats: written.feats, first: seen, ways: new Map<string, Way>() };
        cells.set(cell, entry);
        const key = keyOf(written.text);
        const way = entry.ways.get(key);
        // The first way a form is written stands for it, unless a later token witnesses it better.
        if (way === undefined) entry.ways.set(key, { text: written.text, witness: written.witness, count: 1, first: seen });
        else {
          way.count += 1;
          if (WITNESS_RANK[written.witness] < WITNESS_RANK[way.witness]) {
            way.text = written.text;
            way.witness = written.witness;
          }
        }
        seen += 1;
      }
    }
  }
  byOrthography.set(orthography, index);
  return index;
};

/** A lexeme written as several words (buenas tardes, إن شاء الله): each of its tokens is one word of it, never a form. */
const phrase = (lexeme: BundleLexeme, orthography: string): boolean =>
  (lexeme.forms?.[orthography]?.[0]?.tokens.filter((t) => t.kind === "lexical").length ?? 0) > 1;

/**
 * The cell a text's token writes a lexeme in (its values and its endings'), as `lexemeForms` keys its
 * rows: what tells the tapped word's own form among them. Undefined where the token does not write it.
 */
export const formCellAt = (course: CourseView, text: TaggedText, token: number, lexeme: LexemeId): string | undefined => {
  const written = writtenIn(lexemesById(course), text, token, lexeme);
  return written === undefined ? undefined : cellOf(written.feats);
};

/**
 * A lexeme's forms in an orthography: its paradigm's cells where the compiler lists one (in the
 * lexicon's order of cells), then the forms the course writes outside them (all of them where there is
 * no paradigm), in the order the language's labels name them (a form it names none for first), then as
 * the course first writes them. Undefined for a lexeme the course does not have, one written only inside
 * words (an ending: it has no forms of its own) or one written as several words (a phrase).
 */
export const lexemeForms = (course: CourseView, lexeme: LexemeId, orthography: string = course.orthography): LexemeForms | undefined => {
  const entry = lexemesById(course).get(lexeme);
  if (entry === undefined || bound(entry) || phrase(entry, orthography)) return undefined;
  const written = indexOf(course, orthography).get(lexeme) ?? new Map<string, Cell>();
  const labels = course.lexicon.labels ?? [];
  const labelled = (feats: UdFeatures): { readonly label: TaggedText | undefined; readonly at: number } => {
    const label = labelOf(course, { ...(entry.feats ?? {}), ...feats }, entry.pos);
    return { label: label?.gloss[course.supportKey], at: label === undefined ? -1 : labels.indexOf(label) };
  };
  const same = sameForm(course.profiles.get(orthography));
  const writtenRow = (cell: string, c: Cell): LexemeFormRow => ({ cell, feats: c.feats, label: labelled(c.feats).label, texts: waysOf(c, same), attested: true });
  // Written forms go in the order the language's labels name them (a form it names none for first), then as the course first writes them.
  const byLabel = (cells: readonly (readonly [string, Cell])[]): LexemeFormRow[] =>
    cells
      .map(([cell, c]) => ({ cell, c, at: labelled(c.feats).at }))
      .sort((a, b) => a.at - b.at || a.c.first - b.c.first)
      .map(({ cell, c }) => writtenRow(cell, c));
  const paradigm = formsOfLexeme(course.lexicon, entry, orthography);
  // A paradigm's form is a text in its lemma's language and orthography (as `principalParts` writes it).
  const like = entry.forms?.[orthography]?.[0];
  if (paradigm.length > 0 && like !== undefined) {
    const listed = new Set(paradigm.map((f) => f.cell));
    const rows = paradigm.map((f): LexemeFormRow => {
      const text: TaggedText = {
        lang: like.lang,
        orthography: like.orthography,
        tokens: [{ kind: "lexical", surface: (f.marked ?? f.spelling).normalize("NFC"), tileGroup: 0, lexemes: [{ lexeme, feats: f.feats }] }],
      };
      return { cell: f.cell, feats: f.feats, label: labelled(f.feats).label, texts: besideParadigm(text, written.get(f.cell), same), attested: written.has(f.cell) };
    });
    const outside = byLabel([...written].filter(([cell]) => !listed.has(cell)));
    return { lexeme, source: "paradigm", rows: [...rows, ...outside] };
  }
  return { lexeme, source: "written", rows: byLabel([...written]) };
};
