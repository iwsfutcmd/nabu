# What the migration has to convert, counted

The counts behind [docs/migration-design.md](../../migration-design.md) (Task C of the lexical-model handoff).
A prototype, as everything in this folder: not a workspace package, not linted, not shipped.

```sh
cd pipeline
uv run --frozen python ../docs/prototypes/migration-inventory/inventory.py           # one line per course
uv run --frozen python ../docs/prototypes/migration-inventory/inventory.py --table   # every form: and construction: KC
```

It reads the ten courses as committed (`courses/*/units/*.yaml`, `courses/*/audio/index.yaml`) and nothing
else. Its `--table` output, under a short header, is committed as
[docs/migration/kc-conversion.md](../../migration/kc-conversion.md).

## What it showed

- The ADRs' counts hold: 3,021 sense KCs, 262 `form:`, 24 `construction:`, 75 `grapheme:`; 5,269 sentences;
  7,696 clips, 2,193 of them keyed by a KC id.
- A `form:` KC is used in one of two ways, and the two never mix but in two apc KCs: pinned on a token as its
  form (133: es, grc, hbo, most of apc) or written as a morph with letters of its own (127: uz, chg, fa, apc's
  suffixes). The first kind becomes feature values, the second a morpheme. That split is the conversion rule.
- No token names a construction: 23 are named by their sentences, one is written as a morph.
