# lzh: the pinned readings against Qieyun derivations

Prototype for lzh's lexical form ([lexemes.md](../../lexemes.md) §8, "lzh: Qieyun positions"; [ADR
0145](../../adr/0145-lexical-model.md), "The lexicon and the lexical form"): each character stores its Qieyun
phonological position (音韻地位), and Baxter, Pinyin and Jyutping are derived from it with nk2028's tools.

## Files

- **`lzh-chars.json`**: a snapshot (2026-11-18) of lzh's distinct character readings, from the course's tokens:
  each character → a list of `[baxter, pinyin, jyutping, sense KC]`, as pinned.
- **`compare.mjs`**: for every pinned reading, finds the positions whose derived Baxter is the pinned one, then
  compares derived Pinyin and Jyutping with the pins (exact, tone only, or not), and prints counts and samples.
- **`probe.mjs`**: prints every position of a few characters (楊, 行, 見, 說, 打, 白) with its Baxter and Pinyin.

## Inputs, as used

`npm install tshet-uinh@0.15.4 tshet-uinh-examples@20260629.0.1` (both MIT), then `node compare.mjs` beside
`lzh-chars.json`. Compare after NFC: the deriver's Pinyin comes out decomposed, and every comparison failed
until both sides were normalised.

## What it found

Over 1,954 tokens, 248 distinct character readings: Baxter 241 derived as pinned (none ambiguous: every match
picks out one position), Pinyin 206, Jyutping 213. The misses, and the overrides they call for (a loan reading,
a variant lookup, a position the Guangyun lacks, analysis differences from Baxter & Sagart, modern readings that
left regular change, literary or colloquial as policy), are in lexemes.md §8. It also caught a pin the compiler
didn't: 不 is pinned *pjuw*, but its *bù* and *bat1* descend from *pjut*.
