# Rules in a lexicon: Toki Pona (tok), as built (2026-11-25)

Toki Pona does not inflect (language.yaml `dimensions: {}`): no word changes its shape, and no token chooses a
feature value. So tok gets stage 1 of docs/rules-design.md and the token check, and no realisation rules.

- **Forms.** Every lexeme (126) has a `form`: the word as sitelen Lasina spells it, a name with its capital
  (`Kanata`, `Sonja`). The notation (lexicons/tok/language.yaml) has sets and no vowel signs: Toki Pona's vowels
  are letters, and a notation's vowel signs are marks (apc's harakat), so the schema no longer requires them.
- **Spelling.** tok-Latn/standard states `spell: {from: lexical, rules: []}`: the form as it is (the schema now
  allows a statement with no rules). tok-Qaap/sitelen-pona states none. A logograph writes a word, not a sound or a
  letter: each lexeme's logograph (and each name's cartouche) is a fact of the lexeme, already pinned in `spelled`,
  and the compiler's transliteration check (`transliterate: {via: sitelen-pona}`, nabu.sitelen_pona) already ties
  every sitelen pona sentence to its Latin. A statement mapping each form to its logograph would restate the
  profile's `logographs` normalization table a third time. The profile's normalization would let a `rules: []`
  statement compare equal (typed Latin becomes logographs), but that would claim the orthography writes Latin.
- **The token check** now runs for a language with a notation and no rules (pipeline/src/nabu/forms.py
  `check_tokens`, compiler/build.py `_token_forms`): each token stands in its citation cell and is its lexeme's
  form. 5,330 tokens (both orthographies), all given; the 2,665 in sitelen Lasina compared letter for letter, those
  in sitelen pona trivially (no statement). 126 forms checked against their lemmas (`form.projection`), none off.
  A wrong form is caught (`form.unaccounted` on every token of the lexeme): pipeline/tests/test_courses.py
  `test_a_language_with_a_notation_and_no_rules_has_every_token_checked`.
- **Paradigms:** none (no rule says anything of a cell). The bundle is byte for byte what it was.
- **Vectors:** conformance/spell-tok.json (4: a word, a name, a capital at a sentence's start, a word a letter
  apart), conformance/realise-tok.json (3: the citation cell, a name, a cell with a value: no rule).
- **For the owner:** nothing to rule on. If sitelen pona should have a statement after all (so the paradigm of a
  future inflecting rule, or a word card, could be spelled in logographs from the form), it is one `map` rule over
  the logographs table and one rule per name.
