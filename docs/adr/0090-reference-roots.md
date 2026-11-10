# 0090. The reference library: a work folder and the library, and books found by name

- Status: Proposed
- Date: 2026-11-10
- Amends: [0079](0079-reference-library.md)

## Context

The relay of [ADR 0079](0079-reference-library.md) reached one Drive folder, `nabu`. It held both
the books and the work done on them: notes per course (`notes/hbo`, `notes/tok`), the Toki Pona
references and test files.

The owner's whole library now lives in `books_bak` and is being sorted by a separate project into
`books_bak/books`, by subject and language family (`books/ling/afa+sux/sem/…`). The same books
should not be kept twice, and the books will keep moving while that sorting goes on.

Rooting the relay at `books_bak` would also reach `books_bak/_personal`, where the owner keeps
personal papers that no course session should be able to read.

## Decision

**The relay has named roots.** The secret `ROOTS="nabu=<id>,books=<id>"` replaces
`ROOT_FOLDER_ID`, which still works for a single root.
- **Paths start with a root's name:** `nabu/notes/hbo/…`, `books/ling/…`. The top of the relay,
  path `""`, lists the roots.
- **`nabu` is the work folder:** notes (`nabu/notes/<course>/`) and anything a session writes.
- **`books` is `books_bak/books`, the library.** `_personal` and `_inbox` are outside every root,
  so out of reach.
- **The roots themselves are fixed.** Nothing is made at the top, and no root is moved, renamed or
  trashed.
- **Moves between roots work,** for example filing a book from `nabu` into `books`.

**Books are found by name, not by path.** `GET /v1/find?q=words[&in=path]` (`nabu refs find`):
- Drive searches names across the account. The relay climbs each hit's parents and answers only
  the hits inside a root, with their paths. Other names are dropped unread and never leave the relay.
- It spends at most 40 Drive calls, and says `truncated` when it stopped early.
- Courses cite books by author, title and year, as they already do, never by a path that the
  sorting will change. Notes stay where they are, under `nabu/notes/<course>/`.

**`nabu refs pull` takes a path,** with no default, and refuses more than `--max-gb` (5 GB). The
top of the relay is now a whole library.

## Consequences

- **One copy of each book.** The sorting project can move books freely; `find` still finds them.
- **The privacy page says the relay searches names,** to find books, and returns nothing outside
  its roots. It still never follows shortcuts or deletes.
- **Every request costs a Drive call less:** named roots are known without asking Drive. `status`
  checks each root and reports a wrong ID.
- **Not yet:** source files still in `nabu` (the Cambridge Grammar of Classical Greek, `toki-pona/`,
  two unnamed PDFs and a second copy of Kline) are for the sorting project to file into `books`.
