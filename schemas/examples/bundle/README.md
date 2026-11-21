# A bundle (format version 2)

Three directories, one per file a bundle has (`schemas/bundle.schema.json`):

- `bundle/`: the manifest.
  - `valid/es.json`: a manifest names its language's lexicon and lists a `lexicon` and an `aliases` file.
  - `invalid/format-version-1.json`: no bundle of format version 2 says it is of version 1.
  - `invalid/no-lexicon.json`: a part's id is unique in a language, so the manifest says which.
  - `invalid/lexicon-with-a-script.json`: a lexicon is a language's, not an orthography's.
  - `invalid/unknown-role.json`: a bundle has no file of KCs.
- `bundle-lexicon/`: the course's lexemes, labels and named rules (`BundleLexicon`).
  - `valid/es.json`: casa and mano are both feminine; only mano's gender is a part to learn.
  - `valid/uz.json`: an ending is a lexeme too, shown by its allomorphs.
  - `valid/es-leftovers.json`: casa's spelling is a leftover in es-Latn: s, z and c say one sound (ADR 0148).
  - `invalid/old-kc-id.json`: an entry is a lexeme, never a KC.
  - `invalid/unit-on-an-entry.json`: the lexicon is flat: no entry says which unit teaches it.
  - `invalid/pinned-form-shipped.json`: a form a rule gives is rule debt, never shipped as a learner's.
  - `invalid/part-with-two-bars.json`: a part is a lexeme and what of it, never a skill too.
  - `invalid/gloss-a-bare-string.json`: language data is never a bare string.
  - `invalid/leftover-reading-without-scheme.json`: a reading leftover names the scheme its letters leave open.
  - `invalid/empty-leftovers.json`: a lexeme with no leftover has no `leftovers`.
- `bundle-unit/`: a unit's file (`BundleUnit`).
  - `valid/es.json`: tokens list the lexemes they write; a sentence lists the parts it can show.
  - `valid/chg-alphabet.json`: a script node's letters are the one thing a unit defines.
  - `invalid/kcs-in-a-unit.json`: a unit defines no lexemes.
  - `invalid/sentence-with-kcs.json`: a sentence lists parts.
  - `invalid/persons-beside-tags.json`: who speaks is a tag (ADR 0147).
  - `invalid/node-introduces-a-kc.json`: a node introduces a lexeme, a feature value, a rule or a letter.
  - `invalid/gap-a-kc.json`: a story's question leaves out a lexeme.
  - `invalid/two-tags-in-one.json`: a tag is one thing.
  - `invalid/alphabet-words.json`: an alphabet node practises lexemes: nothing inside is a "word".
