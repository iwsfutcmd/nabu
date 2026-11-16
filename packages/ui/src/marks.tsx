/**
 * Vowel marks for new words only (P12): a profile's vocalization layer may default to
 * `on-for-new-words` (Persian): marks show on the words the learner is still learning and fade from
 * the words they know (ADR 0100's known), as a reader of the script meets them. <T> asks this
 * context, per token, when its `marks` is "new". Without the context every word counts as new.
 *
 * Readings for new words only (ADR 0131): a reading layer that fades (`fade: by-facet`, Jyutping,
 * Schluessel) may show only over the words whose reading the learner has not yet shown on a reading
 * card. Inside `FadeReadings` (a lesson or story with that choice) <T> leaves those words' ruby off;
 * elsewhere (the word list, a tapped word's gloss) every word keeps it.
 */
import { allKcs, type CourseView } from "@nabu/core/lesson";
import { surfaceOf } from "@nabu/core/text";
import { createContext, use, useMemo, type JSX, type ReactNode } from "react";

/** Vowel marks on every word, on none, or only on the words still being learned. */
export type Marks = "show" | "hide" | "new";

interface WordStatus {
  /**
   * Whether a word is one the learner is still learning: by the KCs its token names (its sense and
   * morphs), else by its surface among the course's forms in that orthography.
   */
  readonly isNew: (kcs: readonly string[], surface: string, orthography: string) => boolean;
  /**
   * Whether the learner has shown a word's reading (ADR 0131): every KC its token names, else the
   * KC of its form, read right on a reading card. A word no KC writes keeps its reading.
   */
  readonly readingShown: (kcs: readonly string[], surface: string, orthography: string) => boolean;
}

const WordStatusContext = createContext<WordStatus | null>(null);

export const useWordStatus = (): WordStatus | null => use(WordStatusContext);

/**
 * Which words the learner knows, for <T>'s `marks="new"`. A token names its KCs (its sense and its
 * morphs); a word card's form names none, so it is looked up among the course's forms as written. A
 * token whose KCs are all known is known; anything else (a name, a word no KC writes) is new.
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
    for (const kc of allKcs(course)) {
      for (const [orthography, forms] of Object.entries(kc.forms ?? {})) {
        for (const form of forms) byForm.set(`${orthography}\u0000${surfaceOf(form).normalize("NFC")}`, kc.id);
      }
    }
    const named = (kcs: readonly string[], surface: string, orthography: string): readonly string[] =>
      kcs.length > 0 ? kcs : [byForm.get(`${orthography}\u0000${surface.normalize("NFC")}`)].filter((kc) => kc !== undefined);
    return {
      isNew: (kcs, surface, orthography) => {
        const words = named(kcs, surface, orthography);
        return known === undefined || words.length === 0 || words.some((kc) => !known.has(kc));
      },
      readingShown: (kcs, surface, orthography) => {
        if (readings === undefined || orthography !== course.orthography) return false;
        const words = named(kcs, surface, orthography);
        return words.length > 0 && words.every((kc) => readings.has(kc));
      },
    };
  }, [course, known, readings]);
  return <WordStatusContext value={value}>{children}</WordStatusContext>;
};

const FadeContext = createContext(false);

/**
 * Readings on new words only (ADR 0131): inside, <T> leaves off the ruby of the words whose reading
 * the learner has shown. `on` is the learner's choice where the layer shown fades; a tapped word's
 * gloss turns it off again, as that is where a faded reading is looked up.
 */
export const FadeReadings = ({ on, children }: { readonly on: boolean; readonly children: ReactNode }): JSX.Element => <FadeContext value={on}>{children}</FadeContext>;

/** Whether a word's ruby is left off here (by its token's KCs and surface): readings fade, and the learner has shown its reading. */
export const useReadingFaded = (): ((kcs: readonly string[], surface: string, orthography: string) => boolean) => {
  const fade = use(FadeContext);
  const status = useWordStatus();
  return (kcs, surface, orthography) => fade && status !== null && status.readingShown(kcs, surface, orthography);
};
