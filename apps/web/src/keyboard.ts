/**
 * Asking the device keyboard for a text field's language (ADR 0143). In the Android app, the field
 * that takes focus hands its languages to the keyboard app (EditorInfo#hintLocales), and Gboard
 * switches to the first it has, as it does in Google Translate. A field whose orthography is known
 * names its languages in `data-keyboard` (@nabu/ui keyboardHint, from its profile's keyboard); any
 * other field asks for the language it is tagged with, its own `lang` or the nearest above it.
 */
import { asciiLowercase, keyboardLanguages } from "@nabu/i18n";

/** What the choice reads of a focused element: the DOM's own Element and HTMLElement have it all. */
export interface FocusedField {
  readonly tagName: string;
  readonly isContentEditable?: boolean;
  getAttribute(name: string): string | null;
  closest(selector: string): { getAttribute(name: string): string | null } | null;
}

/** Input types that take words. Email addresses, numbers, passwords and the like ask for nothing. */
const WORD_TYPES = new Set(["text", "search"]);

/**
 * The languages to ask the keyboard for when `el` takes focus, best first, or undefined for an
 * element that takes no words (a button, a password field): the keyboard is left as it is.
 * `page` is the document's language, for a field that nothing above tags.
 */
export const keyboardFor = (el: FocusedField, page: string): readonly string[] | undefined => {
  const tag = asciiLowercase(el.tagName);
  const type = asciiLowercase(el.getAttribute("type") ?? "text");
  const words = tag === "textarea" || (tag === "input" && WORD_TYPES.has(type)) || el.isContentEditable === true;
  if (!words) return undefined;
  const own = el.getAttribute("data-keyboard");
  if (own !== null && own.trim() !== "") return own.trim().split(/\s+/u);
  return keyboardLanguages(el.closest("[lang]")?.getAttribute("lang") ?? page);
};

/** The Android app's KeyboardLanguage plugin (apps/mobile/android: KeyboardLanguagePlugin.java). */
export interface KeyboardLanguagePlugin {
  /** Hands the keyboard app these languages for the field in focus and every field after it. */
  hint(options: { readonly languages: readonly string[] }): Promise<void>;
}
