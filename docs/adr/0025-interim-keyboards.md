# 0025. Interim, hand-encoded keyboard layouts

- Status: Proposed
- Date: 2026-11-03

## Context

The keyboard typo model needs key adjacency (§8.4). The gameplan's source, CLDR Keyboard 3.0 XML
compiled to JSON (§6.7), is a project of its own.

## Decision

`profiles/keyboards/*.yaml` (`schemas/keyboard-layout.schema.json`) holds base-layer rows with
stagger offsets. Keys are adjacent when they are within one key width on the same or the next row.
Seven layouts are hand-encoded from the national standards and marked `reviewed: false`:
- US QWERTY (`en`, and `uz`)
- Turkish Q
- Persian ISIRI 9147
- Arabic 101
- Uzbek Cyrillic
- Tajik

Profiles keep their `cldr-kbd:<id>` references, so swapping in compiled CLDR data changes no
profile.

## Consequences

A wrong adjacency only makes a typo a little more or less lenient (0.5 vs 1). It never decides
correctness on its own. Each layout should still be checked against a real keyboard before
`reviewed: true`.
