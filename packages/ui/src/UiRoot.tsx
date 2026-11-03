import { uiFontStack, type Direction } from "@nabu/i18n";
import { type CSSProperties, type JSX, type ReactNode } from "react";
import { I18nProvider } from "react-aria-components";
import { useTranslator } from "./context.tsx";
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
  const font = uiFontStack(t.locale);
  const style = { "--nabu-ui-font": font.family, "--nabu-ui-line-height": String(font.lineHeight) } as CSSProperties;
  return (
    <I18nProvider locale={t.formattingLocale}>
      <div lang={t.locale} dir={dir ?? t.dir} className={styles.root} data-ui-root="" style={style}>
        {children}
      </div>
    </I18nProvider>
  );
};
