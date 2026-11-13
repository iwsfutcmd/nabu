import { uiFontStack, type Direction } from "@nabu/i18n";
import { type CSSProperties, type JSX, type ReactNode } from "react";
import { I18nProvider } from "react-aria-components";
import { useTranslator } from "./context.tsx";
import { useFonts } from "./fonts.ts";
import styles from "./UiRoot.module.css";

export interface UiRootProps {
  readonly children: ReactNode;
  /** Forces the chrome direction (Storybook's dir toolbar). Defaults to the UI locale's script direction. */
  readonly dir?: Direction | undefined;
}

/**
 * Root of the app chrome: UI-locale `lang`, script-derived `dir`, UI font stack,
 * and React Aria's locale (number formatting, arrow-key flipping).
 */
export const UiRoot = ({ children, dir }: UiRootProps): JSX.Element => {
  const t = useTranslator();
  const chrome = useChrome();
  return (
    <I18nProvider locale={t.formattingLocale}>
      <div lang={chrome.lang} dir={dir ?? chrome.dir} className={styles.root} data-ui-root="" style={chrome.style}>
        {children}
      </div>
    </I18nProvider>
  );
};

/**
 * The chrome's `lang`, `dir` and font, for what React Aria portals out of the root (a modal
 * dialog's content): put them on an element inside the dialog with `chromeClass`.
 */
export const useChrome = (): { readonly lang: string; readonly dir: Direction; readonly style: CSSProperties } => {
  const t = useTranslator();
  const font = uiFontStack(t.locale);
  // A UI font stack that names a family loaded with its text (fonts.ts) loads it too.
  useFonts(font.family);
  return { lang: t.locale, dir: t.dir, style: { "--nabu-ui-font": font.family, "--nabu-ui-line-height": String(font.lineHeight) } as CSSProperties };
};

/** The class that applies the chrome's font (with useChrome's style). */
export const chromeClass: string = styles.chrome ?? "";
