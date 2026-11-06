import type { CourseView } from "@nabu/core/lesson";
import type { OrthographyProfile } from "@nabu/schema";
import type { Translator } from "@nabu/i18n";
import { createContext, use, useMemo, type JSX, type ReactNode } from "react";

interface NabuUiContextValue {
  readonly translator: Translator;
  readonly orthographies: ReadonlyMap<string, OrthographyProfile>;
  readonly targets: ReadonlySet<string>;
}

const NabuUiContext = createContext<NabuUiContextValue | null>(null);

export interface NabuUiProviderProps {
  readonly translator: Translator;
  /** Orthography profiles by id; <T> reads fonts and line height from them. */
  readonly orthographies?: ReadonlyMap<string, OrthographyProfile>;
  /**
   * The orthographies of the language being learned (the course's, less its support language).
   * Their text follows the learner's text size for it (ADR 0071); none by default.
   */
  readonly targets?: ReadonlySet<string>;
  readonly children: ReactNode;
}

const EMPTY: ReadonlyMap<string, OrthographyProfile> = new Map();
const NONE: ReadonlySet<string> = new Set();

export const NabuUiProvider = ({ translator, orthographies = EMPTY, targets = NONE, children }: NabuUiProviderProps): JSX.Element => (
  <NabuUiContext value={{ translator, orthographies, targets }}>{children}</NabuUiContext>
);

const useNabuUi = (): NabuUiContextValue => {
  const value = use(NabuUiContext);
  if (value === null) throw new Error("Wrap the tree in <NabuUiProvider>.");
  return value;
};

/** The UI-locale translator. All user-facing chrome text goes through it. */
export const useTranslator = (): Translator => useNabuUi().translator;

export const useOrthography = (id: string): OrthographyProfile | undefined => useNabuUi().orthographies.get(id);

/** Whether text in this orthography is in the language being learned. */
export const useIsTarget = (orthography: string): boolean => useNabuUi().targets.has(orthography);

/**
 * A course's orthography profiles for <T> (fonts, marks, readings), and which of them are the
 * language being learned: every one but the support language's.
 */
export const CourseUiProvider = ({ course, children }: { readonly course: CourseView; readonly children: ReactNode }): JSX.Element => {
  const translator = useTranslator();
  const orthographies = useMemo(() => new Map([...course.profiles].map(([id, p]) => [id, p.source])), [course]);
  const targets = useMemo(() => new Set([...course.profiles.keys()].filter((id) => id !== course.support)), [course]);
  return (
    <NabuUiProvider translator={translator} orthographies={orthographies} targets={targets}>
      {children}
    </NabuUiProvider>
  );
};
