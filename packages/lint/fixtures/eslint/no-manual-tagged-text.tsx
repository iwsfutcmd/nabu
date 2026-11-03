// Fixture: UI code must render TaggedText through <T>, never by hand.
import type { SchemeId, TaggedText, Token } from "@nabu/schema";

declare const text: TaggedText;
declare const token: Token;
declare const scheme: SchemeId;
declare const T: (props: { text: TaggedText }) => null;

export const Bad = () => (
  <p>
    {text.tokens.map((tk) => tk.surface)}{/* expect: nabu/no-manual-tagged-text, nabu/no-manual-tagged-text */}
    {token.surface}{/* expect: nabu/no-manual-tagged-text */}
    {token.ruby?.[scheme]?.[0]?.text}{/* expect: nabu/no-manual-tagged-text, nabu/no-manual-tagged-text */}
  </p>
);

export const destructured = () => {
  const { tokens } = text; // expect: nabu/no-manual-tagged-text
  return tokens;
};

export const Good = () => (
  <p lang={text.lang} data-orthography={text.orthography}>
    <T text={text} />
  </p>
);
