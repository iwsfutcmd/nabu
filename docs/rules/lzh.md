# Rules in a lexicon: Classical Chinese (lzh), as built (2026-11-25)

Classical Chinese does not inflect (language.yaml `dimensions: {}`): a word never changes its characters, and no
token chooses a feature value. So lzh gets stage 1 of docs/rules-design.md and the token check, and no realisation
rules, as tok does (docs/rules/tok.md).

- **Forms.** Every lexeme (227) has a `form`: the word in its characters, as lzh-Hant/standard spells it (學, 君子).
  Lexemes spelled alike keep their suffixed ids (之, 之.de) and share a form. The notation has one set (H, the CJK
  Unified Ideographs and Extension A) and no vowel signs.
- **Spelling.** lzh-Hant/standard states `spell: {from: lexical, rules: []}`: the form as it is.
- **Readings** (Pinyin, Jyutping, Baxter's Middle Chinese: the three ruby layers, ADR 0138) stay pinned on tokens
  and lexemes. They are no orthography and no form spells them: a reading of a character is lexical (見 jiàn /
  xiàn), and the compiler already checks that the layers line up per character.
- **The token check:** 1,954 tokens, all given; 227 forms checked against their lemmas, none off.
- **Paradigms:** none. The bundle is byte for byte what it was.
- **Vectors:** conformance/spell-lzh.json (3: one character, two, another character), conformance/realise-lzh.json
  (2: the citation cell, a homograph).
- **For the owner:** nothing to rule on.
