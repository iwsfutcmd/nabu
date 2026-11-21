# The ten courses, converted to the lexical model

The last reports of the converter that turned the ten courses into the lexical model
([the migration's design note](../migration-design.md), deliverables 2 and 3). It ran for the
last time when the switch landed on main (2026-11-21) and went with the old sources, so nothing
writes these pages again. They stay as the record of what it found: each finding is a question
for a reviewer, never an error.

Each course had a conversion plan ([`plans/<id>.yaml`](plans)): what could not be read off the
course, stated by a drafter and awaiting review (REVIEW). The converter applied it and decided
nothing. The lexicons (`lexicons/<lang>/`), the courses' units and their alias tables
(`courses/<id>/aliases.yaml`) are sources now, edited where they are.

| Course | Lexemes | Pinned forms | Sentences and lines | Relations drafted | Word clips renamed | Findings | Checks |
|---|---|---|---|---|---|---|---|
| [apc](apc.md) | 370 | 267 | 868 | 1296 | 348 | 91 | pass |
| [chg](chg.md) | 455 | 0 | 794 | 0 | 0 | 69 | pass |
| [es](es.md) | 721 | 835 | 1542 | 2495 | 721 | 165 | pass |
| [fa](fa.md) | 253 | 2 | 426 | 0 | 236 | 19 | pass |
| [grc](grc.md) | 170 | 200 | 414 | 219 | 135 | 49 | pass |
| [hbo](hbo.md) | 320 | 326 | 879 | 600 | 146 | 92 | pass |
| [lzh](lzh.md) | 227 | 0 | 444 | 0 | 0 | 0 | pass |
| [tok](tok.md) | 126 | 0 | 485 | 0 | 126 | 0 | pass |
| [uz](uz.md) | 241 | 0 | 422 | 0 | 213 | 24 | pass |
| [yue](yue.md) | 262 | 0 | 455 | 0 | 260 | 2 | pass |

## Findings by kind

| Finding | apc | chg | es | fa | grc | hbo | lzh | tok | uz | yue |
|---|---|---|---|---|---|---|---|---|---|---|
| Lexemes that break a default | 10 |  | 10 |  | 3 | 28 |  |  |  |  |
| Lexemes no default speaks of |  |  | 112 |  | 15 |  |  |  |  |  |
| Lexical features the tokens choose | 6 |  | 14 |  | 1 | 2 |  |  |  |  |
| Lexemes whose lexical feature no token says | 11 |  | 18 |  |  | 2 |  |  |  |  |
| Other spellings of an entry |  | 21 |  |  |  |  |  |  |  |  |
| Written otherwise than the entry | 17 | 48 | 4 | 15 | 12 | 40 |  |  | 13 | 2 |
| Entries spelled as a form other than the citation form | 35 |  |  |  | 1 | 3 |  |  |  |  |
| Entries shown as a built word |  |  |  |  |  |  |  |  | 11 |  |
| Feature values that do not tell forms apart | 2 |  |  |  | 11 | 15 |  |  |  |  |
| Lexemes no sentence writes |  |  |  | 2 |  |  |  |  |  |  |
| Nodes that introduce less | 4 |  |  |  | 1 | 2 |  |  |  |  |
| Clips of a word that is no lexeme of its own now | 6 |  |  | 2 |  |  |  |  |  |  |
| A determiner that does not agree with the noun after it |  |  | 7 |  | 5 |  |  |  |  |  |

The earlier inventory of every `form:` and `construction:` KC is
[kc-conversion.md](kc-conversion.md); each report's table of what the plan makes of them
replaces its last column.
