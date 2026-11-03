import { createTranslator, sourceCatalog, type Translator } from "@nabu/i18n";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NabuUiProvider } from "../src/context.tsx";
import { DEMO_ORTHOGRAPHIES } from "../src/demo/profiles.ts";

const strict = (e: unknown): never => {
  throw e;
};

export const translator = (locale = "en"): Translator =>
  createTranslator({ locale, catalogs: [sourceCatalog()], onError: strict });

/** Server-renders inside the providers and parses the markup into a DOM-like tree. */
export const render = (node: ReactNode, locale = "en"): string =>
  renderToStaticMarkup(
    <NabuUiProvider translator={translator(locale)} orthographies={DEMO_ORTHOGRAPHIES}>
      {node}
    </NabuUiProvider>,
  );
