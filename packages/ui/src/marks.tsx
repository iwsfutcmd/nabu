/**
 * Vowel marks for new words only (P12): a profile's vocalization layer may default to
 * `on-for-new-words` (Persian): marks show on the words the learner is still learning and fade from
 * the words they know (ADR 0100's known), as a reader of the script meets them. <T> asks this
 * context, per token, when its `marks` is "new". Without the context every word counts as new.
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
}

const WordStatusContext = createContext<WordStatus | null>(null);

export const useWordStatus = (): WordStatus | null => use(WordStatusContext);

/**
 * Which words the learner knows, for <T>'s `marks="new"`. A token names its KCs (its sense and its
 * morphs); a word card's form names none, so it is looked up among the course's forms as written. A
 * token whose KCs are all known is known; anything else (a name, a word no KC writes) is new.
 */
export const WordStatusProvider = ({ course, known, children }: { readonly course: CourseView; readonly known: ReadonlySet<string> | undefined; readonly children: ReactNode }): JSX.Element => {
  const value = useMemo((): WordStatus | null => {
    if (known === undefined) return null;
    const byForm = new Map<string, string>();
    for (const kc of allKcs(course)) {
      for (const [orthography, forms] of Object.entries(kc.forms ?? {})) {
        for (const form of forms) byForm.set(`${orthography}\u0000${surfaceOf(form).normalize("NFC")}`, kc.id);
      }
    }
    return {
      isNew: (kcs, surface, orthography) => {
        const named = kcs.length > 0 ? kcs : [byForm.get(`${orthography}\u0000${surface.normalize("NFC")}`)].filter((kc) => kc !== undefined);
        return named.length === 0 || named.some((kc) => !known.has(kc));
      },
    };
  }, [course, known]);
  return <WordStatusContext value={value}>{children}</WordStatusContext>;
};
