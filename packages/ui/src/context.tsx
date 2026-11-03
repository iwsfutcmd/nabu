import type { OrthographyProfile } from "@nabu/schema";
import type { Translator } from "@nabu/i18n";
import { createContext, use, type JSX, type ReactNode } from "react";

interface NabuUiContextValue {
  readonly translator: Translator;
  readonly orthographies: ReadonlyMap<string, OrthographyProfile>;
}

const NabuUiContext = createContext<NabuUiContextValue | null>(null);

export interface NabuUiProviderProps {
  readonly translator: Translator;
  /** Orthography profiles by id; <T> reads fonts and line height from them. */
  readonly orthographies?: ReadonlyMap<string, OrthographyProfile>;
  readonly children: ReactNode;
}

const EMPTY: ReadonlyMap<string, OrthographyProfile> = new Map();

export const NabuUiProvider = ({ translator, orthographies = EMPTY, children }: NabuUiProviderProps): JSX.Element => (
  <NabuUiContext value={{ translator, orthographies }}>{children}</NabuUiContext>
);

const useNabuUi = (): NabuUiContextValue => {
  const value = use(NabuUiContext);
  if (value === null) throw new Error("Wrap the tree in <NabuUiProvider>.");
  return value;
};

/** The UI-locale translator. All user-facing chrome text goes through it. */
export const useTranslator = (): Translator => useNabuUi().translator;

export const useOrthography = (id: string): OrthographyProfile | undefined => useNabuUi().orthographies.get(id);
