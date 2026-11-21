/**
 * Vowel marks for new words only (P12): a profile's vocalization layer may default to
 * `on-for-new-words` (Persian): marks show on the words the learner is still learning and fade from
 * the words they know (ADR 0100's known), as a reader of the script meets them. <T> asks this
 * context, per token, when its `marks` is "new". Without the context every word counts as new.
 *
 * Readings for new words only (ADR 0131): a reading layer that fades (`fade: by-facet`, Jyutping,
 * Schluessel) may show only over the words whose reading the learner has not yet shown on a reading
 * card. Inside `FadeReadings` (a lesson or story with that choice) <T> leaves those words' ruby off;
 * elsewhere (the word list, a tapped word's gloss) every word keeps it. With `open` (ADR 0141) those
 * words keep only what the script leaves unwritten (minimal ruby: ü·ü·, ·5).
 *
 * Homographs (ADR 0140): inside `HomographsProvider`, <T> marks the words whose spelling the course
 * reads more than one way.
 */
import { homographsOf, lexemesInOrder, type CourseView } from "@nabu/core/lesson";
import type { SchemeId } from "@nabu/schema";
import { surfaceOf } from "@nabu/core/text";
import { createContext, use, useMemo, type JSX, type ReactNode } from "react";

/** Vowel marks on every word, on none, or only on the words still being learned. */
export type Marks = "show" | "hide" | "new";

interface WordStatus {
  /**
   * Whether a word is one the learner is still learning: by the lexemes its token writes, else by
   * its surface among the course's forms in that orthography.
   */
  readonly isNew: (lexemes: readonly string[], surface: string, orthography: string) => boolean;
  /**
   * Whether the learner has shown a word's reading (ADR 0131): every lexeme its token writes, else
   * the lexeme of its form, read right on a reading card. A word no lexeme writes keeps its reading.
   */
  readonly readingShown: (lexemes: readonly string[], surface: string, orthography: string) => boolean;
}

const WordStatusContext = createContext<WordStatus | null>(null);

export const useWordStatus = (): WordStatus | null => use(WordStatusContext);

/**
 * Which words the learner knows, for <T>'s `marks="new"`. A token names the lexemes it writes; a
 * word card's form names none, so it is looked up among the course's forms as written. A token whose
 * lexemes are all known is known; anything else (a name, a word no lexeme writes) is new.
 */
export const WordStatusProvider = ({
  course,
  known,
  readings,
  children,
}: {
  readonly course: CourseView;
  readonly known: ReadonlySet<string> | undefined;
  /** The words whose reading the learner has shown, in the course's orthography (core `readingsShown`). */
  readonly readings?: ReadonlySet<string> | undefined;
  readonly children: ReactNode;
}): JSX.Element => {
  const value = useMemo((): WordStatus | null => {
    if (known === undefined && readings === undefined) return null;
    const byForm = new Map<string, string>();
    for (const lexeme of lexemesInOrder(course)) {
      for (const [orthography, forms] of Object.entries(lexeme.forms ?? {})) {
        for (const form of forms) byForm.set(`${orthography}\u0000${surfaceOf(form).normalize("NFC")}`, lexeme.id);
      }
    }
    const named = (lexemes: readonly string[], surface: string, orthography: string): readonly string[] =>
      lexemes.length > 0 ? lexemes : [byForm.get(`${orthography}\u0000${surface.normalize("NFC")}`)].filter((id) => id !== undefined);
    return {
      isNew: (lexemes, surface, orthography) => {
        const words = named(lexemes, surface, orthography);
        return known === undefined || words.length === 0 || words.some((id) => !known.has(id));
      },
      readingShown: (lexemes, surface, orthography) => {
        if (readings === undefined || orthography !== course.orthography) return false;
        const words = named(lexemes, surface, orthography);
        return words.length > 0 && words.every((id) => readings.has(id));
      },
    };
  }, [course, known, readings]);
  return <WordStatusContext value={value}>{children}</WordStatusContext>;
};

const FadeContext = createContext<{ readonly on: boolean; readonly open: boolean }>({ on: false, open: false });

/**
 * Readings on new words only (ADR 0131): inside, <T> leaves off the ruby of the words whose reading
 * the learner has shown. `on` is the learner's choice where the layer shown fades; a tapped word's
 * gloss turns it off again, as that is where a faded reading is looked up. With `open` (ADR 0141),
 * those words keep only what the script leaves unwritten.
 */
export const FadeReadings = ({ on, open = false, children }: { readonly on: boolean; readonly open?: boolean; readonly children: ReactNode }): JSX.Element => {
  const value = useMemo(() => ({ on, open }), [on, open]);
  return <FadeContext value={value}>{children}</FadeContext>;
};

/** Whether a word's ruby is left off here (by its token's lexemes and surface): readings fade, and the learner has shown its reading. */
export const useReadingFaded = (): ((lexemes: readonly string[], surface: string, orthography: string) => boolean) => {
  const fade = use(FadeContext).on;
  const status = useWordStatus();
  return (lexemes, surface, orthography) => fade && status !== null && status.readingShown(lexemes, surface, orthography);
};

/** Whether a word whose reading has faded keeps what the script leaves unwritten (ADR 0141), rather than nothing. */
export const useOpenLettersKept = (): boolean => use(FadeContext).open;

const HomographsContext = createContext<{ readonly orthography: string; readonly spellings: ReadonlySet<string> } | null>(null);

/**
 * The spellings the course reads more than one way in the reading scheme shown (ADR 0140, core
 * `homographsOf`): inside, <T> marks those words of the course's orthography.
 */
export const HomographsProvider = ({ course, scheme, children }: { readonly course: CourseView; readonly scheme: SchemeId | false; readonly children: ReactNode }): JSX.Element => {
  const value = useMemo(() => (scheme === false ? null : { orthography: course.orthography, spellings: new Set(homographsOf(course, scheme).keys()) }), [course, scheme]);
  return <HomographsContext value={value}>{children}</HomographsContext>;
};

/** Whether a word's spelling is read more than one way in the course (ADR 0140), where a provider says. */
export const useHomograph = (): ((surface: string, orthography: string) => boolean) => {
  const homographs = use(HomographsContext);
  return (surface, orthography) => homographs !== null && homographs.orthography === orthography && homographs.spellings.has(surface.normalize("NFC"));
};
