# 0085. Toki Pona in sitelen Lasina and sitelen pona: a private-use script subtag, UCSUR text, typed Latin graded as logographs

- Status: Proposed
- Date: 2026-11-08

## Context

Ben asked for a Toki Pona course, and for sitelen pona, Toki Pona's own logographic script, as a
second way to write it. Fonts for sitelen pona exist. The rest of the stack does not know the script:

- **Encoding.** sitelen pona is not in Unicode. A preliminary proposal (L2/24-275, 2024) is with the
  UTC, and Common Sitelen Pona (2026) is preparing the formal one. Until then every font, keyboard
  and corpus uses the Under-ConScript Unicode Registry's block, U+F1900..U+F19FF in Plane 15's private
  use area: the 120 words of pu, then the nimi ku suli, cartouche marks, joiners and long-glyph
  controls.
- **Tags.** ISO 15924 has no code for the script. The proposal asks for `Stpn`; nothing is
  assigned (Wikimedia's converter for it is stalled for the same reason). Everything in Nabu keys
  off the script subtag: direction, fonts, layout.
- **CLDR** has a `tok` locale (Latin exemplars a e i j k l m n o p s t u w) but nothing for sitelen
  pona, so there are no exemplars for the script audit.
- **Writing.** Each word is one logograph. The words of a sentence run together with no spaces
  (the proposal gives the logographs the line-breaking class of ideographs); Common Sitelen Pona
  separates sentences with an ideographic space. A name is a cartouche whose logographs begin with
  the name's letters, in order: jan [sona olin nasin jan a] is jan Sonja. Two logographs may be drawn
  as one (a combined glyph: ZWJ, or the stacking and scaling joiners), and pi may run under the words
  it groups (a long glyph). ! and ? are not written: o, a, seme and "X ala X" carry them.
- **Typing.** Few learners have a sitelen pona keyboard. Most would type the Latin letters.
- **Line breaking.** Private-use characters have no line-breaking class, so a browser never breaks
  a line of logographs that has no spaces.
- **Voices.** No synthesizer has a Toki Pona voice.

## Decision

**Two orthographies**, every sentence pinned in both:

- `tok-Latn/standard` (sitelen Lasina): the course's default; CLDR `tok` exemplars; lowercase words,
  capitalized names. Typos are the keyboard model's. Toki Pona's words lie a letter apart (pona,
  pana, poka, poki), but a slip that spells another word of the course is WRONG_WORD through the
  lexicon (ADR 0066), so no contrast sets.
- `tok-Qaap/sitelen-pona`: the script subtag is **Qaap**, from ISO 15924's private-use range
  (Qaaa..Qabx), until a code is assigned; then the profile, the course and the bundles move to it
  together. `Qaac` and `Qaai` are avoided (ICU still reads them as Coptic and Inherited). Direction
  is left to right, the default for a script with no metadata. Ben accepted Qaap (2026-11-08).
- Text is the UCSUR's code points, written as Common Sitelen Pona has it: no spaces between words,
  an ideographic space (U+3000) between sentences, ! ? and commas left out, a colon kept after ni.
  When Unicode encodes the script, a `map` step will fold the UCSUR code points into the new ones.
- `nabu.sitelen_pona` converts sitelen Lasina, and the compiler checks every pinned sitelen pona
  form against its Latin form (`transliterate: {via: sitelen-pona}`,
  `enrich.transliteration-mismatch`), including that each cartouche spells its name.
  `nabu sitelen-pona "…"` gives the form for new content.
- A sitelen pona word is one logograph or one whole cartouche, so KC forms and auto-tokenized text
  split as the course does.

**Typed answers in either script.** A new normalization step, `logographs`:

- each typed word that is a key of its table (case ignored) becomes its logograph, so a learner
  in sitelen pona can type `mi moku` for the two logographs;
- with `cartouche`, a name written in one reads as its logographs' first letters, so a name
  typed in Latin letters (Sonja) compares with its cartouche, after the case fold.

Around it, the profile removes the joiners and long-glyph controls (a combined glyph compares as
its words), maps the directional ni and the other sewi to ni and sewi, and removes whitespace. It
does no typo matching: a wrong logograph is a wrong word. Vectors in conformance/normalize.json and
grade.json pin all this in both harnesses.

**Reading aids.** Every logograph pins its word as a `lasina` reading, shown as ruby on request (off
by default). The compiler gives ruby to Han and sitelen pona words alike; a cartouche carries none.
`lasina` is a READING_TAGS scheme, so char-read asks for a logograph's word among three in Latin
letters.

**Script metadata, fonts, layout:**

- The script audit takes a profile with no CLDR `exemplars` and only `exemplarsExtra` as listing
  its whole repertoire: the 137 logographs, the cartouche marks and the colon.
- **Font:** sitelen seli kiwen juniko (Rebecca Bettencourt, OFL-1.1), handwritten logographs after
  pu's, code points only. It is kept in packages/ui/src/fonts, subset to the block (280 KB WOFF2,
  loaded by unicode-range only where a logograph is on screen), and set 1.5 times the text around it.
- **Line breaking:** in `<T>` each word of a Qaap text is an inline block, so lines break between
  words and never inside a cartouche.
- **Vertical:** sitelen pona is also written top to bottom, logographs upright (proposal §6h), but
  sitelen seli kiwen has no vertical cartouches. linja insa has them but carries no licence file.
  The profile says `vertical: none` until a font we can ship has them.

**Audio.** A voice with `reading: lasina` says each word's pinned reading as eSpeak NG phonemes
(`nabu.audio.toki_pona`), through the Esperanto table, which names Toki Pona's phonemes as Toki Pona
spells them. Toki Pona text is never given to a synthesizer: read as Esperanto, jan would be
januaro. The stress falls on the first syllable (pu). A man's voice and a woman's share the items
at random (ADR 0078). The sitelen pona orthography plays the same clips. The clips are rule-based,
CC0 and marked synthetic.

**The course** (courses/tok) has ten units, A1 to A2. They teach the 120 words of pu (all but
unpa) and kin, about twelve a unit, each word a KC. Particles are KCs (li, e, pi, la, o), and a
few patterns are constructions. Names are KCs written in cartouches: Lina, Pita, Mila, Tomasi,
Sonja, and ma Kanata.

Every unit ends in a story with the recurring cast, and has a roleplay scenario. Toki Pona marks no
person, gender or number, so sentences carry no `persons` tags. English accept sets list I and we,
she, he, they and it, and the tenses.

Everything is an LLM draft (`llm:`, status draft, CC-BY-SA-4.0). It was checked against the
references now in the reference library (`toki-pona/`: Linku, the UCSUR chart, Common Sitelen
Pona, wasona, the sona pona wiki, lipu tenpo, Tatoeba, tokipona.org). A fluent speaker should
review it.

## Consequences

- sitelen pona works anywhere a Qaap text is rendered through `<T>`: lessons, stories, word lists,
  corrections. A learner can switch scripts as in apc, and type Latin letters in either.
- The private-use subtag is honest but local: other software will not know `tok-Qaap`. It changes
  in one place when ISO 15924 assigns a code.
- The UCSUR text needs the font; without it the logographs are tofu. The font is self-hosted with
  the app, so the app always has it.
- Not done:
  - nasin sitelen kalama in cartouches (a dot or colon after a logograph reads its first mora or the
    whole word): such a name is read by first letters only;
  - long pi and combined glyphs in the course's own text (graded, never written);
  - vertical sitelen pona;
  - human recordings (Linku has recordings of every word; their licence is unclear);
  - a script-convert node (core has none yet; uz's is metadata).
