# 0075. The reference library: a private Drive folder behind a relay

- Status: Proposed
- Date: 2026-11-06

## Context

Courses for less-resourced languages are written from grammars and dictionaries, often scans of
printed books. The owner has the physical copies, but the books are copyrighted. They cannot go
into this public repository, its bundles or its issues. Authors also need somewhere to keep notes
on them.

Cloud sessions start in a fresh container each time, so references have to be fetched again in
every session. It has to cost nothing. The options we tried or weighed:
- **Google Drive's connector** could not deliver an 8.7 MB PDF: the message was too large. Its
  text reader returned about half of the book, with no page numbers. The Arabic came back reversed,
  as presentation forms, with the Persian letters U+06CC and U+06BE in place of U+064A and U+0647.
  Scans need the original file.
- **A private GitHub repository** was ruled out: a takedown would land on the account the project
  lives on.
- **Dropbox** API tokens expire within hours.
- **Firebase Storage and Cloud Run** need a billing account.

A session can keep a fixed key for a host as a network secret, which the proxy adds to requests.
Google's own credentials are either short-lived or would have to sit inside the container.

## Decision

**References live in a folder in the owner's Google Drive.** A Cloudflare Worker,
`apps/references`, reaches the folder on the free plan. Sessions reach the Worker with a fixed
key.

**The relay acts as the owner's Google account.** The owner signs in once with OAuth (`drive`
scope) and stores the refresh token as a Worker secret.
- A service account can't do this job: it can read a folder shared with it, but files it creates
  in a personal Drive fail, because it has no storage of its own.
- `drive.file` is too narrow: it can't see files the owner adds in Drive itself.
- Sign-in is open only while no token is stored. Its state is signed with the relay's key and bound
  to a cookie.

**The relay's code confines it to the folder:**
- Every path is resolved from the folder down, by listing children. Names are compared and listed
  in NFC without control characters: catalogue-derived file names carry MARC's non-sorting marks
  (U+0098, U+009C) around a leading article, and nobody can type those.
- No file id is taken from a caller, the Drive is never searched and shortcuts are never followed.
- Writes are new files and new content up to 25 MB, folders, renames and moves. Removal goes to
  Drive's trash, never deletion.

**The client is `nabu refs`** (status, ls, pull, cat, put, mkdir, mv, trash).
- It reads `NABU_REFS_URL`. The key comes from `NABU_REFS_KEY`, or in a cloud session the proxy
  adds it as the relay host's network secret.
- `pull` copies into `NABU_REFS_DIR` (default `~/nabu-references`), checks Drive's MD5, keeps
  unchanged files, and refuses any directory inside a git work tree.

**What a course takes from a reference is facts:** forms, paradigms, glosses, usage. Example
sentences and definitions are never copied word for word. Courses are written fresh and checked
against the references, and stay LLM drafts until a native speaker reviews them.

## Consequences

- **Drive stays the store.** The owner adds scans the usual way, and sessions get exact copies
  with page images and page numbers to cite.
- **The stored sign-in reaches the whole Drive.** Only the relay's code limits it to the folder.
  The Cloudflare account needs two-factor authentication. A leaked relay key reaches only the
  folder.
- **Google wants pages before it publishes the sign-in app:** a home page, a privacy policy and terms
  on the app's domain. The relay serves them (`/`, `/privacy`, `/terms`), in English only, for Google
  and the owner; they are not part of the app.
- **The sign-in lapses** if Google revokes it or it goes unused for six months. The relay says
  `sign-in-expired`, and the owner signs in again (apps/references/README.md).
- **Not yet:**
  - A bibliography in the repository (metadata only) and a `sources` field on provenance that cites
    a reference and page. That is a schema change with its own ADR.
  - Text extraction and OCR of pulled copies happen in the session, not in the pipeline.
