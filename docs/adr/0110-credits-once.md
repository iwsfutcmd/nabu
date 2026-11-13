# 0110. A bundle defines each credit once

- Status: Proposed
- Date: 2026-11-12
- Amends: [0029](0029-bundle-format.md) (each file's `source` in the manifest), [0040](0040-audio-pipeline.md) (each clip's `credit` in the audio index)

## Context

A bundle's manifest gave every file its source as text, and the audio index gave every clip its
credit as text (ADR 0029, ADR 0040). A course with a voice credits it on every clip, and a cloned
voice names the recording it cloned (ADR 0076), so the same few hundred characters were written
once per clip, twice: in the manifest and in the audio index. The 2026-11 review (R11) measured
es: a 1.34 MB manifest, 91% of it these strings, and a 1.1 MB audio index; opening the course
parsed 6.2 MB of JSON. Gzip hides it on the wire, so the cost is parsing and memory on a phone.

## Decision

**Credits are defined once, in the manifest, and named by id.**
- The manifest has `credits`: each text by its id, the first 8 hex digits of the text's sha256. An
  id depends on its text only, so adding a voice changes no other id; two texts with one id stop
  the build.
- A file names its credit with `credit` (it was `source`, text). A clip in the audio index names its
  credit with the same id (it was the text).
- Licenses stay on each file and clip, as every asset carries its SPDX identifier in the manifest
  (gameplan §1, decision 12); they are short.
- `formatVersion` is 1.

**Old bundles keep working.** Nothing in the app reads a credit: the player, the offline planner
and the downloads read paths, hashes, sizes, licenses and clip timings, which are the same in both
formats. A device that cached a course before (format 0) plays and downloads it as before; online,
the manifest comes from the network first, and its new files have new names, so they are fetched,
never mixed with old ones (ADR 0047). `packages/core/test/bundle-format.test.ts` assembles and plans
the same course in both formats.

## Consequences

- es, built locally: the manifest 1.37 → 0.53 MB, the audio index 1.15 → 0.31 MB, the JSON a
  course opening parses 6.37 → 4.68 MB; the nine courses' JSON 19.6 → 17.4 MB. Gzip sizes barely
  move.
- To show a clip's credit, look its id up in the manifest's `credits`; a format 0 bundle has the
  text itself in that place.
- Every manifest and audio index changes once, so every course's bundle id changes with it.
