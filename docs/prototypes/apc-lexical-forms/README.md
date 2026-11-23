# apc's lexical form: drafting, projecting, checking

**Frozen on 2026-11-23:** the forms moved into `lexicons/apc/lexemes.yaml` and the projections into the apc
profiles' `spell` (docs/rules-design.md, stage 1). `build.py` still reproduces both committed files from the
tree of that day; do not run it to rewrite them. `authored.yaml` still holds what stage 2's rules will take
(citation pairs, participle heads, templates).

The code behind [docs/lexical-forms/apc.md](../../lexical-forms/apc.md) (Task B of the lexical-model
handoff, ADRs 0145 and 0148). It is a prototype, as everything in this folder: not a workspace package, not
linted, not shipped. Unlike the others its two outputs are committed, since they are the deliverable:
[apc.yaml](../../lexical-forms/apc.yaml) and [apc-review.md](../../lexical-forms/apc-review.md).

## Run it

It needs PyYAML, which the pipeline's environment has:

```sh
cd pipeline
uv run --frozen python ../docs/prototypes/apc-lexical-forms/build.py   # writes both files
uv run --frozen python ../docs/prototypes/apc-lexical-forms/check.py -v  # every word that does not come back
```

## The files

| File | What |
|---|---|
| `lexform.py` | The notation: a lexical form parsed into its sounds, and the four projections (the course's Arabic, the vowel-marked text, Arabizi with every free spelling, phonemes) |
| `course.py` | `courses/apc` read as the compiler reads it: each Arabic word with its marks, the Arabizi tokens that say it, and its analysis (the lexeme it writes and the feature values it chooses there, or the lexemes it lists: stem, clitics and affixes); the lexemes from `lexicons/apc`, in the order the nodes introduce them |
| `derive.py` | A first draft of a word's form from its Arabic, its marks and its Arabizi, read together letter by letter; where they disagree it keeps a note |
| `check.py` | Drafts every word, projects it back and compares |
| `authored.yaml` | What a person adds: each verb's radicals, Form and citation forms with their source and, where one was deduced, from what (`basis`); which head each participle-shaped word is; and the active participle's template |
| `build.py` | Writes the entries and the review list |

## Inputs

`courses/apc` as committed (units, `vocalization.yaml`, `audio/index.yaml`), its lexicon `lexicons/apc`
(`lexemes.yaml`, and `language.yaml` for the bare cells, the labels and the rules) and `authored.yaml`.
Nothing is fetched. An entry is a lexeme spelled on its own; an affix (a lexeme no orthography spells alone),
a label (the feature values a form KC became) and a rule are listed under `morphemes`.
Kline (2022) was read for `authored.yaml` and the note; none of his text is here.

## What it showed

- One form in Arabic script, with three signs Unicode already has, gives back the course's Arabic, its vowel
  marks and its Arabizi for 951 of its 1,025 distinct words. The helping vowel is not in the form: a rule
  writes it (the owner, 2026-11-21).
- The other 74 are nearly all places where the course's own three spellings of a word do not agree, or where
  its marks follow no one convention: a vowel inside a word that one script writes and the other leaves
  out, a diphthong's sukun, a doubled letter written once, loans in their own spelling. Ten are this
  reader's own mispairings. They are the review list.
- The Arabizi the course writes can be read as a small set of free choices (e or i, o or u, u or ou), each
  with a clear majority, and a few spellings fixed word by word (a or e for ا).
- Drafting from the three pinned spellings works for words, clitic groups and suffixed words alike, so a
  converter can draft every form and leave a person the disagreements.

## What it does not do

No conjugation, no affix forms, no stress, and no helping vowel inside a word (it does not know where an
ending begins). The note says what is open.
