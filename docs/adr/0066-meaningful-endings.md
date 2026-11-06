# 0066. Endings that carry meaning are not typos

- Status: Proposed
- Date: 2026-11-06
- Amends: [0023](0023-grading-engine.md)
- Resolves: gameplan errata 46

## Context

**The keyboard model forgave meaning changes.** A slip within the typo budget (an adjacent key, a
letter or two in a long word) is CORRECT_WITH_TYPO, unless the slip lands on a word of the
lexicon. Then it is WRONG_WORD. The judge's harness found answers the grader told learners were
right:
- *talabasan* ("you are a student") for *talabaman* ("I am a student");
- *kitobing* ("your book") for *kitobim* ("my book");
- *Сен* for *Мен*, adjacent keys on the Uzbek Cyrillic layout;
- ⁨وأنا⁩ ("and me") for ⁨وإنت⁩ ("and you") in Lebanese.

**The lexicon could not catch them.** It held the glossary's forms, which are lemmas since ADR
0061. Nor did the course's sentences: none of the five forms appears in them. The forms come from
the paradigm the course teaches, not from its text.

## Decision

**A profile lists the endings that carry meaning** (`match.typo.contrasts`): sets of endings, or
whole words, one or two letters apart.
- **The rule:** a slip that trades one member of a set for another is WRONG_WORD, not a typo. The
  rest of the word must be unchanged. The member ends the word, or only further endings of the
  profile's sets follow it, as suffixes stack (*maktabgaman* for *maktabdaman*: -ga for -da before
  -man).
- **Matching:** members compare as units do: case-folded, with the profile's equivalences and its
  marks applied. A hamza-less ⁨وانا⁩ still counts as the pronoun.
- **Spellings of one member:** a member may list several (Uzbek -im after a consonant, -m after a
  vowel; the dative ga, ka, qa). Trading those stays a typo: it is a spelling slip.
- **A note says what changed:** each set names a feedback note (`contrast-person`,
  `contrast-possessive`, `contrast-case`, `contrast-pronoun`).
- **Where:** in the grader (`contrastOf`, @nabu/core match/compare.ts), on the typo branch, so
  both conformance harnesses check it through core-cli.

**The sets, marked REVIEW** (linguistic policy, awaiting sign-off):
- **uz-Latn, uz-Cyrl:** person endings (-man, -san, -dir, -miz, -siz, -lar), possessive endings,
  case endings, personal pronouns.
- **apc-Arab:** independent pronouns, and possessive endings (-i, -ak/-ik, -o, -a, -na, -kon, -hon).
- **fa-Arab:** possessive endings (-am, -at, -aš, -emān, -etān, -ešān), verb person endings, and
  the attached copula. Persian had the same gap: *kitābetān* ("your book") for *kitābešān*
  ("their book") was a typo. Most of its one-letter swaps were already wrong (its typo budget is
  smaller).

**The lexicon also grows.** It holds every word the course writes in an orthography: glossary
forms, sentences and story lines. A slip that lands on any of them is a wrong word.

## Consequences

- **The five answers grade WRONG_WORD,** in both harnesses (conformance/grade.json), with a note.
- **A wrong word gets no second check.** Like any wrong word, it never reaches the judge.
- **Real slips in suffixed words stay typos:** *kitobum* for *kitobim* (-um is no ending), and
  *maktabka* for *maktabga* (one ending, two spellings).
- **Other profiles can add sets** as their courses need them (Turkish's person endings, Arabizi's
  pronouns).
- **Single-letter members** (Uzbek possessive -i, the Arabic endings ي ه ك) match many word ends.
  They count only within the typo budget, which leaves out words under three letters.
