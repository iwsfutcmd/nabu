# The ten courses, converted to the lexical model

Written by `cd pipeline && uv run nabu migrate ../courses`; do not edit by hand. It
belongs to [the migration's design note](../migration-design.md), deliverable 2: the
converter writes each course's lexicon (`lexicons/<lang>/`), the course in the new shape
(`courses/<id>/next/`), its alias table (`courses/<id>/aliases.yaml`) and a report here.
Nothing in the app reads any of it until the switch.

Each course has a conversion plan (`pipeline/src/nabu/migrate/plans/<id>.yaml`): what
cannot be read off the course, stated by a drafter and awaiting review (REVIEW). The
converter applies it and decides nothing; a report lists what it found, each a question.

| Course | Lexemes | Pinned forms | Sentences and lines | Relations drafted | Word clips renamed | Findings | Checks |
|---|---|---|---|---|---|---|---|
| [apc](apc.md) | 370 | 266 | 868 | 618 | 348 | 57 | pass |
| [chg](chg.md) | 455 | 0 | 794 | 0 | 0 | 69 | pass |
| [es](es.md) | 721 | 844 | 1542 | 1466 | 721 | 133 | pass |
| [fa](fa.md) | 253 | 2 | 426 | 0 | 236 | 19 | pass |
| [grc](grc.md) | 170 | 210 | 414 | 171 | 135 | 48 | pass |
| [hbo](hbo.md) | 320 | 326 | 879 | 465 | 146 | 89 | pass |
| [lzh](lzh.md) | 227 | 0 | 444 | 0 | 0 | 0 | pass |
| [tok](tok.md) | 126 | 0 | 485 | 0 | 126 | 0 | pass |
| [uz](uz.md) | 241 | 0 | 422 | 0 | 213 | 24 | pass |
| [yue](yue.md) | 262 | 0 | 455 | 0 | 260 | 2 | pass |

## Findings by kind

| Finding | apc | chg | es | fa | grc | hbo | lzh | tok | uz | yue |
|---|---|---|---|---|---|---|---|---|---|---|
| Lexemes that break a default | 10 |  | 9 |  | 3 | 28 |  |  |  |  |
| Lexemes no default speaks of |  |  | 92 |  | 15 |  |  |  |  |  |
| Lexical features the tokens choose | 6 |  | 14 |  | 1 | 2 |  |  |  |  |
| Lexemes whose lexical feature no token says | 11 |  | 7 |  |  | 2 |  |  |  |  |
| Other spellings of an entry |  | 21 |  |  |  |  |  |  |  |  |
| Written otherwise than the entry | 18 | 48 | 4 | 15 | 11 | 40 |  |  | 13 | 2 |
| Entries shown as a built word |  |  |  |  |  |  |  |  | 11 |  |
| Feature values that do not tell forms apart | 2 |  |  |  | 12 | 15 |  |  |  |  |
| Lexemes no sentence writes |  |  |  | 2 |  |  |  |  |  |  |
| Nodes that introduce less | 4 |  |  |  | 1 | 2 |  |  |  |  |
| Clips of a word that is no lexeme of its own now | 6 |  |  | 2 |  |  |  |  |  |  |
| A determiner that does not agree with the noun after it |  |  | 7 |  | 5 |  |  |  |  |  |

The earlier inventory of every `form:` and `construction:` KC is
[kc-conversion.md](kc-conversion.md); each report's table of what the plan makes of them
replaces its last column.
