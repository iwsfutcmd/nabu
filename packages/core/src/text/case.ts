/**
 * Locale-aware case folding for comparison (gameplan §6.4). Lowercasing alone
 * is not enough: Greek final sigma (ς/σ) and capital sharp s (ẞ/ß) need
 * explicit folds, and Turkish/Azerbaijani dotted and dotless i depend on the locale.
 */
const FOLDS: ReadonlyArray<readonly [RegExp, string]> = [
  [/ς/gu, "σ"], // ς → σ
  [/ẞ/gu, "ß"], // ẞ → ß
];

/** Anything case mapping or the explicit folds could change. Han, Arabic, Hebrew… text has none. */
const FOLDABLE = /[\p{Lu}\p{Lt}\u03C2\u1E9E]/u;

export const caseFold = (text: string, locale: string): string => {
  if (!FOLDABLE.test(text)) return text.normalize("NFC");
  let out = text.toLocaleLowerCase(locale);
  for (const [from, to] of FOLDS) out = out.replace(from, to);
  return out.normalize("NFC");
};
