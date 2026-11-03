# 0029. Bundle format and determinism

- Status: Proposed
- Date: 2026-11-03

## Context

§7.5 stage 9 asks for:

- content-addressed assets;
- one chunk per unit for offline download;
- a manifest of versions, licences and provenance;
- byte-for-byte determinism.

## Decision

Schema: [`schemas/bundle.schema.json`](../../schemas/bundle.schema.json) (`BundleManifest`,
`BundleUnit`).

**Layout**

`nabu build <course> --out <root>` writes `<root>/<course-id>/`:

- `manifest.json`;
- `units/<unit>.<sha16>.json`;
- `profiles/<lang>.<variant>.<sha16>.json`;
- `tables/<id>.<sha16>.json` and `keyboards/<id>.<sha16>.json` for the tables and layouts the
  profiles reference.

`<sha16>` is the first 16 hex digits of the file's SHA-256.

**Canonical JSON**

- Keys sorted, compact separators, UTF-8 (not ASCII-escaped), strings NFC, trailing newline.
- No timestamps, no absolute paths, no set iteration order.

**Manifest**

- `formatVersion`, course, target, orthographies, support.
- `files`: path, role, sha256, SPDX licence and source of each file.
- `units`.
- `licenses` and `provenance`: counts per licence, per status and per author kind.
- `versions` records:
  - the schema format;
  - CLDR;
  - Unicode, both CLDR's and Python's `unicodedata`;
  - `nabu-pipeline`;
  - only the analyzers the taught orthographies use;
  - ICU only when the course has drills or a `cldr-transform` profile.
- `id` is the SHA-256 of the canonical manifest without `id`.

**Units**

- Every form is a full `TaggedText`, with gap tokens, tile groups, readings and ruby.
- Translations ship as `{text: TaggedText of the canonical line, accept}`.
- Each sentence lists its KCs, provenance and licence.

## Consequences

- Building twice gives identical trees. `tests/test_bundle.py` checks this for `clean.yaml` and
  every course in `courses/`.
- The manifest id changes when an analyzer or ICU version changes. That is intended: they shape
  readings and drills.
- `unicode.python` lags CLDR 49's Unicode 16.0 and differs by Python version (15.0 on 3.12, 15.1 on
  3.13), so the pipeline pins Python 3.13 (`pipeline/.python-version`) (errata 21).
