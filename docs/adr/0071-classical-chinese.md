# 0071. Classical Chinese: a written course, and reading layers shown on request

- Status: Proposed
- Date: 2026-11-06

## Context

Ben asked for a Classical (Literary) Chinese course with these properties:

- no audio, so no listening and no speaking;
- no exercises on, and no input in, a transliteration: everything through Traditional
  characters;
- a way to show Jyutping, Pinyin or Baxter's transcription of Middle Chinese above the
  characters, which no lesson ever practises.

The app could not express any of this:

- **Nothing said a course is not spoken.**
  - Every course got self-rated speaking (`speak.tier-0` fits any sentence).
  - Reading drills appeared wherever an orthography had a ruby layer: `char-read`,
    `reading-disambiguation`, `transcribe` (ADR 0054).
  - Tone exercises appeared wherever readings carry tones (Jyutping does, ADR 0046).
  - Listening was already limited to items with a clip.
- **One ruby layer only.** The compiler pinned readings and ruby for an orthography's first
  ruby layer. The player showed it behind a single switch.
- **Homographs.** Classical Chinese reads many characters by sense: 說 "speak" vs 說 "pleased"
  (read as 悅), 知 "know" vs 知 "wise" (智), 女 "woman" vs 女 "you" (汝). Tap-for-gloss looks
  words up by spelling, so a word glossed as whichever entry the glossary met first.
- **Exemplars.** CLDR has no `lzh` locale, and zh_Hant's exemplars lack classical function
  words (焉 歟 孰 奚 罔).

## Decision

**A course names the facets it practises.**

- `facets` in course.yaml lists what the course practises, from the facets every template
  already declares (§8.5): recognize, produce, listen, speak, read-script, write-script.
  - The bundle manifest carries the list only where a course names it, so other bundles are
    unchanged.
  - Absent, the course practises everything, as before.
- `facetExclusions(course)` rules out every template of another facet. It applies wherever
  `speechExclusions` does:
  - the lesson builder;
  - the planner, in every mode (lesson, review, mistakes, placement);
  - the card gallery and `sampleExercise`.
- A course that is neither spoken nor heard needs no speech scoring: `speechSupportOf` says so.
- Classical Chinese names recognize and produce. That one line removes speaking, listening,
  tone and reading drills. The readings the profile pins stay display-only. "Can't listen
  now" and "Can't speak now" never appear, because no card offers them.
- Facets rather than an "is spoken" flag: the templates already carry their facet, so what a
  course practises maps onto them with no new vocabulary. A course that teaches its script but
  not its readings is the same one line.

**An orthography may pin several reading layers.**

- The profile lists one annotation layer per scheme. The compiler gives every Han word token
  each layer's reading and ruby (stage 3), and every KC form too (ADR 0050). Readings are
  pinned per token and never guessed.
- A layer can name its own language (`lang`), so ruby text is tagged as what it is
  (`<rt lang>`) and set in that script's face. Pinyin's tone letters (ā, ǖ) need a Latin font:
  the CJK Ming face drew zāi as "zaī".

  | Layer | Tag | Why this tag |
  |---|---|---|
  | Pinyin | `zh-Latn-pinyin` | |
  | Jyutping | `yue-Latn-jyutping` | |
  | Baxter | `ltc-Latn-x-baxter` | ISO 639-3 `ltc`, Late Middle Chinese, is the nearest code; the private-use subtag names Baxter's notation |

- **The player.**
  - With one layer, the control is the switch it always was.
  - With several, it is a labelled choice: Off, Pinyin, Jyutping, Middle Chinese (Baxter)
    (`ReadingsControl`, a react-aria ToggleButtonGroup). The messages are in the catalogs, so
    the scheme names translate.
  - What shows first: the layer's `default`. Classical Chinese marks every layer off, so the
    characters come first. A profile that says nothing (yue) shows its one layer in horizontal
    text, as before.
  - The learner's choice is kept per orthography on the device (localStorage).
  - Vertical text hides the readings and restores them on leaving it (§11.4).
  - A tapped word's gloss shows the layer the learner chose. With one layer it shows that
    layer, as before.

**Readings come from pinned open data, chosen by sense.**

- Sources:
  - Pinyin from Unihan 16.0.0: kTGHZ2013, kXHC1983, kMandarin.
  - Literary Jyutping from Unihan kCantonese and kSMSZD2003Readings: 生 sang1, 聲 sing1,
    頸 ging2.
  - Baxter's transcription (Baxter & Sagart 2014, ASCII: 一 'jit, 君子 kjun tsiX) derived from
    the Guangyun:
    - the data is the copy in tshet-uinh 0.15.4 (MIT, nk2028);
    - the derivation follows the rules of tshet-uinh-examples' `baxter`.
- Where a character has several readings, the sense decides:

  | Sense | Pinyin | Jyutping | Baxter |
  |---|---|---|---|
  | 說 "pleased" (= 悅) | yuè | jyut6 | ywet |
  | 女 "you" (= 汝) | rǔ | jyu5 | nyoX |
  | 有 "and", in 十有五 (= 又) | yòu | jau6 | hjuwH |
  | 知 "wise" (= 智) | zhì | zi3 | trjeH |

- **Checked against Wiktionary** (CC-BY-SA-4.0, read through kaikki.org's wiktextract data),
  whose entries group each reading with the senses it carries. 242 of the course's 246
  characters agree on all three readings for their sense. Wiktionary decided the two
  disagreements:
  - 生 is *sraeng*, not the derived *srjaeng*: the Guangyun data puts 生 in division III and
    Baxter writes it in division II;
  - 從容 is *sung1 jung4* in Cantonese.

  The four left are:
  - three borrowings that Wiktionary gives no Middle Chinese for in that sense: 女 = 汝 *nyoX*,
    知 = 智 *trjeH*, 有 = 又 *hjuwH*. Each takes the borrowed character's reading;
  - 踰, an entry with no readings of its own (it points to 逾).
- The readings are content: pinned in the course YAML and reviewed like the sentences. Nothing
  derives them at runtime.

**Senses spelled alike are separate KCs, and a word is glossed by its own sense.**

- Ids add a suffix: 知 and 知.zhi, 子 and 子.you, 之 and 之.de.
- `glossAt`: a match over exactly the tapped word, spelled as the word is, glosses the sense the
  token names.
- `glossary.shadowed` now fires only when a longer entry wins.

**The orthography: `lzh-Hant/standard`.**

- Exemplars and target:
  - CLDR zh_Hant exemplars, now generated (`packages/i18n/cldr.config.json`), plus REVIEW
    extras for the classical words and the passages' vocabulary they lack.
  - The target is `lzh-Hant` with no region: the classics belong to no one region (likely
    subtags give lzh-Hant-CN).
- Grading:
  - Older and regional character forms (爲 for 為, 説 for 說) are accepted with a neutral note
    (`variant-form`).
  - Simplified characters are rejected with a note.
  - Spaces and punctuation are ignored, since editors punctuate the classics differently.
- Display:
  - Vertical writing in prompts, readings and word banks.
  - Set in a Ming face: Noto Serif CJK TC, self-hosted as `@fontsource/noto-serif-tc` (OFL-1.1),
    with Noto Sans HK after it.
  - A quarter larger than the text around it (`fonts.scale: 1.25`, a new profile field).
    Characters at the size of the Latin glosses beside them were hard to read. The scale applies
    to the words inside `<T>`, so a size a caller gives the element still holds, and to the
    answer field.
  - Other profiles name no scale and look as they did.
- The learner's own text size (Preferences, `#/preferences`, kept on the device) scales the
  root font size, so the chrome and every course's text follow it, and the profile's scale on
  top of that.

**The course.**

- Ten units, A1 to early A2. Each unit's lessons teach the words of one authentic passage, and
  its story reads that passage. Lessons mix constructed sentences with quotations once their
  words are known.

  | Unit | Passage |
  |---|---|
  | 1 | Analects 1.1 學而時習之 |
  | 2 | Analects 2.17 and 2.15 |
  | 3 | Analects 2.4 吾十有五 |
  | 4 | Laozi 33 知人者智 |
  | 5 | Zhuangzi, Autumn Floods 子非魚 |
  | 6 | Lüshi Chunqiu 刻舟求劍 |
  | 7 | Han Feizi 守株待兔 |
  | 8 | Han Feizi 自相矛盾 |
  | 9 | Mencius 1A1 and 6A10 |
  | 10 | Li Bai 靜夜思 and Meng Haoran 春曉 |

- Grammar is a set of constructions: 也 noun predicates, 不亦…乎, the fable opener 「X人有…者」,
  and 為 passives.
- Everything is an LLM draft (`llm:`, status draft, CC-BY-SA-4.0) awaiting review. The classical
  texts themselves are in the public domain; the drafting covers the selection, tokens,
  translations, accept sets and readings.

## Consequences

- Other courses do not change.
  - Their manifests name no facets, and nothing is ruled out for them.
  - Their lessons and goldens are as they were.
  - yue's layer names no `lang` yet. Naming it would set its Jyutping in Noto Sans rather than
    Noto Sans HK, which changes the visual baselines; that waits for an update in the pinned
    container.
- Tests:
  - The pipeline checks that lzh pins three layers on every word and KC form, reads each
    sense one way, has no audio and names its facets.
  - Core checks that no lesson, plan, placement or card of lzh is of another facet.
  - The UI tests the control, the default and `<rt lang>`.
  - The simulation runs lzh learners too.
- Not done:
  - A lint that checks pinned Pinyin, Jyutping and Baxter against Wiktionary's per-sense
    readings in CI, as PyCantonese checks yue's Jyutping. That needs a committed, pinned
    extract of the Wiktionary data (CC-BY-SA).
  - An IME-homophone model for Pinyin input.
  - Old Chinese reconstructions.
  - Zhuyin.
  - A numbers drill: ICU has no lzh spellout.
  - Roleplay in Classical Chinese depends on the model writing it well.
