# 0087. Attic Greek: polytonic text, marks noted not failed, and a reconstructed Attic voice

- Status: Proposed
- Date: 2026-11-09

## Context

Ben asked for an Attic Greek course. The references (ADR 0079 library) are the Cambridge Grammar of
Classical Greek (CGCG, 2019) and the Cambridge Greek Lexicon (2021, a scan without a text layer).
Nothing in the app said how polytonic Greek is written, graded or voiced.

## Decision

**The orthography `grc-Grek/polytonic`** (profiles/grc-Grek.polytonic.yaml):
- Text as editions of Attic prose print it: accents, breathings, iota subscript, diaeresis; `. , · ;` and
  `’` for elision. Exemplars are `cldr:el` (its auxiliary set is polytonic); the gaps the course uses are in
  `exemplarsExtra`.
- **Marks (REVIEW).** Accents, breathings and the iota subscript left out or misplaced are CORRECT_MARKS
  (note `greek-marks`): learners may have no polytonic keyboard. With `distinguishes`, marks that spell
  another word of the course (ἡ/ἤ, τις/τίς, χώρα/χώρᾳ) are WRONG_WORD (`greek-marks-word`).
- **A grave is the acute** (CGCG 24.2): a silent equivalence. Adscript ωι and ηι are the subscript (CGCG
  1.22); αι cannot be, being a short diphthong. Every elision mark (ʼ ᾽ ᾿ ' ‘) is ’, then punctuation.
- **Contrasts (REVIEW, ADR 0066).** Person endings on words pinned as verb forms; case endings on inflected
  words; the pronouns (ἡμεῖς/ὑμεῖς).
- Keyboard: the Greek (220) base layer. Font: Noto Serif (OFL-1.1), 1.15× with line height 1.9.

**Readings and audio** (`nabu.audio.attic`, `nabu attic`):
- Every word pins an `attic` reading: its spelling with every α, ι, υ outside a diphthong marked long (ᾱ)
  or short (ᾰ), unless a circumflex or an iota subscript makes it long. Stripped of those marks it is the
  surface (a test checks both).
- Voices say it as eSpeak NG phonemes through the `grc` table, never as text (a Greek voice would read
  Modern Greek): the reconstructed Attic of CGCG §§1.14–33 (aspirated φ θ χ, ζ [zd], υ [y], ει [eː], ου
  [oː], long diphthongs, geminates). The accent is a stress (first acute or circumflex primary, a grave or
  an enclitic's acute secondary); the pitch contour is not modelled. φ and χ are [p]+[h], [k]+[h] (the
  table's `p#`, `k#` cut words off); the ι of ᾳ ῃ ῳ is the glide j. Clips are CC0.
- A word card takes the reading of a grave-accented form of its word (καί from καὶ).
- Like hbo, the facets leave out listen: read, not heard.

**The course** (`courses/grc`): each unit's lessons teach the words of a public-domain Attic passage
(Perseus texts: Burnet, Marchant, Hude, Hall and Geldart), and its story reads it. Verb forms and cases are `form:` KCs;
`iPlusOne: 2`. LLM drafts (`llm:`, status draft), CC-BY-SA-4.0.

| Unit | Passage |
|---|---|
| 1 | Plato, Crito 43a: Why so early? |
| 2 | Xenophon, Anabasis 1.1.1: Two sons |
| 3 | Plato, Phaedrus 227a: Where to, and where from? |
| 4 | Plato, Meno 82b: Does he speak Greek? |
| 5 | Plato, Republic 327a–b: Wait for us! |
| 6 | Aristophanes, Lysistrata 5–8: Not one woman is here (Hall and Geldart) |
| 7 | Xenophon, Anabasis 4.7.21, 24: The sea! The sea! |
| 8 | Plato, Phaedo 118a: We owe a rooster |
| 9 | Lysias 1.9: My little house (Hude) |
| 10 | Plato, Apology 21d: Wiser than this man |

## Consequences

- Ten units, A1 to A2: 376 sentences, 201 KCs, 48 lessons, ten stories and six roleplay scenarios.
- Women speak and are spoken to (Lysistrata and Calonice; ἑτοίμη εἰμί; Xanthippe), and "you" is tagged one
  person or several (ADR 0075).
- Elided words keep their apostrophe in the token (ἀλλ’, δ’); an elided monosyllable is its consonant alone.
- Not done: checking vowel lengths and glosses against the Cambridge Greek Lexicon (OCR of its scan);
  the glossary's folded pass does not fold grave to acute, so a KC variant seen only with a grave
  (τὸ) is a dead entry: KCs list lemmas only.
