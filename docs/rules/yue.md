# Rules in a lexicon: yue (Cantonese), as built (2026-11-25)

yue taken through [rules-design.md](../rules-design.md)'s stages 1 to 4, as far as Cantonese has anything for
them. It inflects for nothing the course writes (`dimensions: {}`; no token of the course chooses a feature
value), so this is stage 1 (lexical forms and how each orthography spells them) and the token check, with no
realisation rule. Nothing a learner sees changed: no token, character, Jyutping, reading, lemma, accept set or
clip; the bundle is byte for byte what it was (07a650ec…).

## The notation, and why

- **A syllable is its character followed by its Jyutping**, a word its syllables in a row, a token's lexemes
  joined at a boundary: 學hok6生saang1, 中zung1文man2, 我ngo5+哋dei6, 可ho2+唔m4+可ho2以ji5.
  `lexicons/yue/language.yaml` declares it (`notation`, sets only: H a Han character, R a letter of a Jyutping
  syllable, T its tone number). `profiles/yue-Hant-HK.standard.yaml` spells the characters (one rule: each
  reading, `{R}*{T}`, left out); `profiles/yue-Latn.jyutping.yaml` the syllables (two: a space after a tone
  before a character, then each character left out). Both REVIEW.
- **Why both in one form.** The characters say which morpheme a syllable is, the Jyutping how it is said, and
  neither gives the other in this course: 三 and 衫 are both saam1, 九 and 狗 both gau2; 呢 is ni1 (this) and ne1
  (the particle), 呀 aa3 and aa4; a changed tone is a reading the character does not show (中文 zung1 man2, M&Y
  p. 57). A form of characters alone gives no statement its Jyutping, a form of Jyutping alone none its
  characters. yue has two orthographies of one language, and its Jyutping text is already made syllable by
  syllable from the characters' readings (`nabu jyutping`, ADR 0126): the pair is what both texts come from.
- **Why not the minimal way** (tok's and lzh's: the form is the main orthography's spelling, and a logographic
  orthography states no `spell`). Here it would leave yue-Hant-HK's 1,862 tokens accounted for by nothing; with
  the pair each one's characters are checked against its lexemes' (a token's parts, the A-not-A's first
  syllable, a numeral's), and a process that changes a reading and keeps the character (a changed tone) can be
  stated once for both orthographies. tok's glyphs follow from its Latin words one to one; yue's characters do
  not follow from Jyutping.
- **The pinned readings.** A form's syllables are the reading the compiler pins on its lexeme's first spelling
  (`nabu.compiler.readings`, ADR 0117): all 522 pinned readings in the bundle are the other orthography's lemma.
  `nabu jyutping` now writes the form from that same reading (as it writes the Jyutping spelling), so no
  Jyutping is written by hand there either and a form never says otherwise than its lemma. What the check
  tests is the tokens: each token's Jyutping (its pinned reading) and characters against its lexemes' forms.

## Counts

- 262 lexemes: 261 forms; `lexeme:pl` has none of its own (its one allomorph, 哋, has 哋dei6); 3 allomorph forms.
  528 spellings checked against the lexicon's first spellings: `form.projection` 0.
- Tokens (sentences and story lines): **3,724** (1,862 in each orthography), **3,724 given exactly**, none by a
  pinned or listed form, none unaccounted. 22 tokens write no lexeme (the names 家明, 美玲, 陳, 李) and are not
  checked. No pinned forms: nothing to prune, no `form.rule-debt`. No `EXPECTED_WARNINGS` added.
- Paradigms: none (no realisation rule, so no category is listed); the bundle is unchanged.
- The compile takes as long as before (about 9.6 s here).
- Vectors: `conformance/spell-yue.json` 33 (2 on an invented statement, 31 over the course's words and tokens:
  one syllable, two, a syllabic m and ng, no initial, changed tones, a character read two ways in one word, 哋,
  a classifier, the A-not-A, a numeral, a character in plane 2 (constructed), and `expected` as the profiles
  key a word); `conformance/realise-yue.json` 14 (6 on an invented language, 8 on yue's lexicon).
  `pnpm conformance`: 1,298 (TS) and 1,299 (Python) pass.

## What Cantonese has here, and what became of it

- **哋** is a lexeme of its own (`lexeme:pl`, `realises: {Number: Plur}`; pronouns and 人 only, M&Y 5.1 p. 92),
  listed in its token after the pronoun: joined by its allomorph's form. No rule.
- **Changed tones** (變調, M&Y 1.4 pp. 27-35): every word of the course with one is a lexeme whose own reading has
  it (名 meng2, 錢 cin2, 中文 and 英文 man2, 女兒 neoi5 ji2, 弟弟 dai4 dai2), and every token reads it so. The form
  carries it: no listed form, no `context`. A word said both ways in the course (中文 zung1 man4 in 中文大學, as
  the lexicon's note says) would need a `context` on its tokens or a lexeme of its own; there is none.
- **Reduplication:** the kinship words (爸爸 baa4 baa1, 哥哥 go4 go1, M&Y p. 33) and 拜拜 are lexemes of their
  own; no token reduplicates one. Deriving them is a computed derivative (rules-design.md section 8: not in it).
- **A-not-A** (`rule:a-not-a`): a one-syllable word repeats as tokens of its own (係 唔 係, three tokens); a
  two-syllable one is one token whose first part is the word's first syllable (M&Y 17.1.2 pp. 360-361): 可以's
  allomorph 可 and 得閒's 得. Each now says where it stands, `before: {startsIn: 唔}` (the rest of its token);
  with no condition an allomorph is "the one used elsewhere" (the schema), which would make 可 of every 可以
  that is not its token's base.
- **Compound numerals** (十八, 四十, 一百, 二十, …: 17 tokens in each orthography) list two lexemes and no base, as
  the schema has it ("a token of two equals has none (yue 十 + 八)"). The engine refused such a token; it is now
  a token of equals (below).

## Engine and pipeline changes (each its own commit)

1. **`perf(core)`, packages/core/src/lexicon/spell.ts `alternation`:** a set's consecutive code points go into
   the regex as ranges. H (about 160,000 code points) took about 2 ms a spelling as one escape a member; now
   about 9 microseconds. Same meaning: vectors `spell/ranges/*`. apc's statements and vectors unchanged.
2. **`feat(core)`, realise.ts `realiseToken`: a token of equals.** Several lexemes, none marked base: each is
   realised as a word of its own in its own cell (`realise`: blocking, its rule, the rewrite rules), joined in
   order at a boundary; no allomorph is chosen and no rule runs over the join; the status is pinned if a part's
   is, else listed if one is, else given; a part that fails, or is a phrase, fails the token. The compiler's
   check (`pipeline/src/nabu/forms.py` `check_tokens`) no longer sets such a token aside as "no base lexeme".
   Counted over every course's units, only yue has such tokens. Vectors `realise/equals/*`.
3. **`feat(pipeline)`, pipeline/src/nabu/jyutping.py:** `rewrite_lexicon(..., forms=True)` for a lexicon whose
   language.yaml declares a notation writes each entry's and allomorph's `form` before its `spelled` (mends one
   that says otherwise; leaves pinned `forms` alone); `nabu jyutping --check` fails on a stale form. Test in
   tests/test_jyutping.py.

No schema change of mine (the shared one, optional `vowels` and `rules: []`, is the coordinator's fe8f0dd).

## For the owner (REVIEW)

- **The notation.** A character followed by its Jyutping, both orthographies spelled from it; or the minimal
  way (the form one orthography's spelling, no `spell` for the characters), as tok and lzh have it.
- **`nabu jyutping` writing forms.** It keeps yue's rule that Jyutping is never written by hand, at the price
  that a lemma's form cannot disagree with its spelling (form.projection only proves the two statements); the
  tokens are what is tested. The other way: forms written once and edited by hand when a reading changes.
- **Tokens of equals** for compound numerals, as the schema has them; or a base on each (十 in 四十 as what is
  multiplied?), which would change what a question about the token asks; or numerals by rule (M&Y ch. 21), later.
- **The A-not-A's tokens** differ by syllable count (係 唔 係 three tokens, 可唔可以 one): the course's, kept.
- **What the notation cannot write:** a word the characters write in Latin letters or digits (OK, 8號風球) has
  no pair; none is in the course. H holds the unified ideographs, 〇 and the whole of planes 2 and 3 (but the
  compatibility supplement, which NFC replaces).

## Found and left

- `nabu forms` prints `lexeme:pl: no form` above the counts although its allomorph's form is checked (the
  report skips an entry with no form of its own; apc's affixes show the same).
