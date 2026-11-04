/**
 * node apps/api/scripts/file-reports.ts
 *
 * Files new reports from the Firestore intake as GitHub issues (ADR 0055). The Reports workflow
 * runs it on a schedule. Everything comes from the environment:
 * - FIREBASE_SERVICE_ACCOUNT: the service account's key file, as JSON (a repository secret);
 * - NABU_FIREBASE_PROJECT: the Firebase project id (a repository variable);
 * - GITHUB_TOKEN, GITHUB_REPOSITORY: the workflow's own token and repository.
 *
 * With no intake configured, it says so and exits cleanly.
 */
import { createCourses } from "../src/ai/courses.ts";
import { fileReports, type ServiceAccount } from "../src/report-issues.ts";

const { FIREBASE_SERVICE_ACCOUNT, NABU_FIREBASE_PROJECT, GITHUB_TOKEN, GITHUB_REPOSITORY } = process.env;
if (!FIREBASE_SERVICE_ACCOUNT || !NABU_FIREBASE_PROJECT || !GITHUB_TOKEN || !GITHUB_REPOSITORY) {
  console.info("No report intake configured (FIREBASE_SERVICE_ACCOUNT, NABU_FIREBASE_PROJECT): nothing to file.");
  process.exit(0);
}

const courses = createCourses();
const result = await fileReports(
  {
    project: NABU_FIREBASE_PROJECT,
    serviceAccount: JSON.parse(FIREBASE_SERVICE_ACCOUNT) as ServiceAccount,
    repository: GITHUB_REPOSITORY,
    githubToken: GITHUB_TOKEN,
  },
  { fetch: (...args) => fetch(...args), now: () => Date.now() / 1000, course: (c, o) => courses.get(c, o), log: (line) => console.info(line) },
);
console.info(`${String(result.opened)} issues opened, ${String(result.commented)} reports added to open issues, ${String(result.rejected)} rejected`);
