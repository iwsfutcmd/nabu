# @nabu/references: the reference library relay

Course authors (people and Claude sessions) work from grammars, dictionaries and their own notes.
These are copyrighted, so they never go into this repository. They live in a private folder in the
owner's Google Drive, and this Cloudflare Worker reaches that folder for `nabu refs`
(`pipeline/src/nabu/refs`). See [ADR 0079](../../docs/adr/0079-reference-library.md).

Both halves are free: Cloudflare's free Workers plan and a Google Cloud project with no billing.

## What it can and cannot do

- **Read** any file or folder in the reference folder: `nabu refs ls`, `pull`, `cat`. Downloads
  are whole and byte-exact, scans included, with Range support.
- **Write**: notes and small files up to 25 MB (`put`), folders (`mkdir`), renaming and moving
  (`mv`). Large scans go into Drive the usual way (Drive for desktop or the website).
- **Trash** (`trash`): into Drive's trash, where you can restore it for 30 days. It never deletes.
- **Batch moves** (`POST /v1/moves`): up to 100 moves in one request, each listing a folder once.
  It stays within the free plan's 50 subrequests, stops at the first failure, and marks the
  moves it didn't reach `not-attempted`, to be sent again.
- **Descriptions** (`POST /v1/describe`): up to 100 files' Drive descriptions in one request, the
  same way. Drive shows a description in a file's details pane and searches it: the book library
  keeps its catalogue tags there (`lang:apc form:grammar`).
- **Names** are listed and matched in NFC without control characters, as anyone would type them.
  Where the name Drive holds differs (NFD, as macOS writes it, or a catalogue's MARC non-sorting
  marks), the entry also gives it as `rawName`. Moving a file to its own cleaned name cleans it in
  Drive.
- **Only that folder.** Everything is addressed by path from the folder down. The relay never takes
  a file id from a caller, never searches your Drive and never follows a shortcut.

The Google sign-in the Worker keeps can reach all of your Drive (`drive` scope). Google has no
narrower scope that still sees files you add yourself, and a service account cannot create files in
a personal Drive. The relay's code confines it to the folder. Protect your Cloudflare account with
two-factor authentication, since the sign-in is stored there.

## Setting it up (about 20 minutes, once)

You need Node (for `npx wrangler`), a Cloudflare account and a Google account. Run the commands in
`apps/references`.

### 1. Deploy the Worker (Cloudflare)

```sh
npx wrangler@4 login     # or set CLOUDFLARE_API_TOKEN (an "Edit Cloudflare Workers" token)
npx wrangler@4 deploy
```

(Not `pnpm deploy`: that is pnpm's own command.) If `wrangler login` ends at "Unable to connect" to
`localhost:8976`, the browser can't reach the machine wrangler runs on: use the API token instead.

The first deploy asks you to choose a `workers.dev` subdomain. Note the address it prints,
`https://nabu-references.<subdomain>.workers.dev`: the steps below call it `RELAY`. Its home page
answers at once; until the secrets are in, everything else answers `misconfigured`.

### 2. A Google Cloud project for the sign-in (no billing)

At <https://console.cloud.google.com>:

1. Create a project, e.g. `nabu-references`. It needs no billing account.
2. **APIs & Services → Library → Google Drive API → Enable.**
3. **Google Auth Platform** (formerly "OAuth consent screen") → **Get started**: any app name,
   your email, audience **External**.
4. **Branding**: app name, your email as support and developer contact, no logo (a logo needs
   verification). App domain: home page `RELAY/`, privacy policy `RELAY/privacy`, terms
   `RELAY/terms` (the relay serves them). Authorized domains: `<subdomain>.workers.dev`. Save.
   Without the app domain links, **Publish app** stays greyed out.
5. **Audience → Publish app**, so the app is **In production**. In "Testing", Google ends the
   sign-in after 7 days. Google doesn't need to verify an app only you use; at sign-in it shows
   "Google hasn't verified this app", and you continue with **Advanced → Go to … (unsafe)**.
6. **Clients → Create client → Web application.** Under authorized redirect URIs, add
   `RELAY/oauth/callback`, exactly. Copy the **client ID** and **client secret**.

### 3. The Worker's secrets

```sh
# A long random key: the only thing a session needs to reach the folder. Keep a copy for step 5.
node -e "console.log(crypto.randomBytes(32).toString('base64url'))"
npx wrangler@4 secret put RELAY_KEY
# The folders it reaches, named: each id is the last part of the folder's address,
# drive.google.com/drive/folders/<id>. e.g. nabu=<work folder id>,books=<library folder id>
npx wrangler@4 secret put ROOTS
npx wrangler@4 secret put GOOGLE_CLIENT_ID
npx wrangler@4 secret put GOOGLE_CLIENT_SECRET
```

### 4. Sign in

1. Open `RELAY/oauth/start` in your browser and sign in with the account that owns the folder.
2. You get back a short JSON page with `account` and `GOOGLE_REFRESH_TOKEN`. Check that `account`
   is yours.
3. Store the token, then close the page:

   ```sh
   npx wrangler@4 secret put GOOGLE_REFRESH_TOKEN
   ```

Sign-in is open only while `GOOGLE_REFRESH_TOKEN` is unset. Check the result:

```sh
curl -H "Authorization: Bearer <RELAY_KEY>" RELAY/v1/status
```

### 5. Use it

- **In a Claude cloud session:** give Claude the `RELAY` address. Claude sets `NABU_REFS_URL` and
  asks for the key through the environment's secure credential form (a bearer token for the relay's
  host). The key is never typed into chat or committed.
- **On your own computer:** `export NABU_REFS_URL=RELAY NABU_REFS_KEY=<RELAY_KEY>`.

```sh
cd pipeline
uv run nabu refs status
uv run nabu refs ls
uv run nabu refs find kline lebanese         # where a book is filed
uv run nabu refs pull "books/…/Kline - 2022 - The fundamentals of Lebanese grammar.pdf"
uv run nabu refs put notes.md nabu/notes/apc/kline-2022.md --parents
```

`pull` refuses a destination inside a git work tree, so a copy can't be committed by accident.

### Roots (ADR 0090)

`ROOTS` names the folders the relay reaches: `nabu=<id>,books=<id>` (at most four). Paths start
with a root's name (`books/ling/…`, `nabu/notes/apc/…`), and `ls` with no path lists the roots.
Nothing else in the Drive is reachable, and the roots themselves are never made, moved or trashed.
`nabu refs find <words>` finds a file by name inside the roots, wherever it is filed. An older
deployment with only `ROOT_FOLDER_ID` keeps working, with paths inside that one folder.

## When something changes

- **Sign in again:** if Google revokes the sign-in, or it goes unused for six months, the relay
  answers `sign-in-expired`. Run `npx wrangler@4 secret delete GOOGLE_REFRESH_TOKEN`, then repeat
  step 4.
- **New key:** put a new `RELAY_KEY`, then update it wherever sessions keep it.
- **Turn it off:** remove the app at <https://myaccount.google.com/permissions>, or delete the
  Worker in the Cloudflare dashboard.

## Development

`pnpm --filter @nabu/references test` runs the relay against a stand-in for Google
(`test/fake-google.ts`). The stand-in is not Drive. Before relying on a change, check it against
the real relay with `nabu refs status` and `ls`.
