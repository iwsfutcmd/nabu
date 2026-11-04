# Reports: from the app to GitHub issues

Learners report problems in the app:
- **"This sentence is wrong"**: a correction (ADR 0051);
- **"My answer should have been accepted"** or **"This should have been wrong"**: a claim
  (ADR 0052).

With a report intake configured, each report reaches the course's reviewers as a GitHub issue
in this repository, with no account needed ([ADR 0055](adr/0055-report-intake.md)):

1. **The app writes it to Firestore.** It goes to the `nabu_reports` collection the moment the
   learner sends it, as one document named by the report's id.
   - **No ids.** It carries no device, user or session id, and only the local date.
   - **Offline.** It waits on the device and goes once the device is back online.
2. **A workflow files it.** Every 30 minutes, the **Reports** workflow
   (`.github/workflows/reports.yml`) reads new reports with a service account.
   - **One issue per sentence or story line.** It quotes the item from the bundle, with its
     accepted answers. The first report opens the issue; later ones are comments, and a closed
     issue is reopened.
   - **Labels:** `report`, `course:<id>`, and `correction`, `should-accept` or `should-reject`.
   - **Applying a correction.** A correction's comment holds the row
     `nabu corrections apply` reads.
3. **The report is marked `filed`** with its issue number. A malformed one is marked
   `rejected`, with the reason.

**Reports are public.** The app says so where a report is made.

## Setting it up (once)

The intake can share a Firebase project with another app. It uses its own two collections and
needs no Cloud Functions, so the free Spark plan is enough. Never paste a key or the
service-account file into a chat, an issue or a commit: they go only into the settings below.

1. **Firestore rules.**
   - In the Firebase console, open **Firestore Database → Rules**.
   - Merge the two blocks from `deploy/firebase/nabu-reports.rules` into the existing rules,
     inside `match /databases/{database}/documents`, then **Publish**.
   - Merge, don't replace: publishing replaces every rule in the project, including the other
     app's.
2. **The app's settings**, in GitHub under **Settings → Secrets and variables → Actions →
   Variables**:
   - `NABU_FIREBASE_PROJECT`: the project id (**Project settings → General**).
   - `NABU_FIREBASE_API_KEY`: a browser API key for the project.

   A browser key identifies the project; the rules are what protect it. If the key is
   restricted to certain websites, add `https://iwsfutcmd.github.io/*`. Better: create a key
   just for Nabu in **Google Cloud console → APIs & Services → Credentials**, restricted to the
   Cloud Firestore API and that website.

   The next Pages deploy then writes `reports.json` beside the demo, and the app starts sending
   reports.
3. **The filing job's service account.**
   - In **Google Cloud console → IAM & Admin → Service accounts**, create one (e.g.
     `nabu-report-filer`) with the role **Cloud Datastore User**.
   - Under **Keys → Add key → JSON**, download its key.
   - Put the whole file into a repository secret, **Settings → Secrets and variables → Actions →
     Secrets**: `FIREBASE_SERVICE_ACCOUNT`.
   - Then delete the downloaded file.
4. **Try it.**
   - Make a report in the demo.
   - Run **Actions → Reports → Run workflow**.
   - The issue appears, and the job's log says what it filed.

The job uses the workflow's own `GITHUB_TOKEN` to write issues, so it needs no GitHub token of
its own.

## Looking them over

- **Issues:** filter on the `report` label, or `course:apc`.
- **Corrections:**
  - collect the rows from the issues into a `.jsonl` file;
  - run `cd pipeline && uv run nabu corrections apply <file>`;
  - close the issue when the fix is in.
- **Claims:** edit the accept sets in `courses/<id>/units/*.yaml`.
- **A device's own log.** Reports made before the intake existed are still in each device's
  log; export it from the app's account page. A Claude session can read either the issues or
  the export.

## Costs and abuse

- **Costs.** One document write per report, and a few reads and writes per run. That is far
  inside Firestore's free quota.
- **Abuse.**
  - Anyone can write a report, but the rules allow only well-formed documents of bounded size
    and nothing else.
  - The job validates each report against `schemas/report.schema.json` before filing it.
  - Learner text in issues sits in code spans, so it cannot mention people, link issues or
    inject markup.
  - Spam: Firebase App Check, rate limits in the rules, and closing the intake (removing the
    variable) are the levers.
