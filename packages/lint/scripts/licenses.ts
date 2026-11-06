/**
 * `pnpm license-check`: fails when a production dependency of what ships (the web app, the API, the
 * mobile shell) has a license that is not allowed (src/licenses.ts): copyleft, unknown, missing.
 */
import { execFileSync } from "node:child_process";
import { refused } from "../src/licenses.ts";

const SHIPPED = ["@nabu/web", "@nabu/api", "@nabu/mobile"];
const args = ["licenses", "list", "--prod", "--json", ...SHIPPED.flatMap((p) => ["--filter", p])];
const listing = JSON.parse(execFileSync("pnpm", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })) as Parameters<typeof refused>[0];
const count = Object.values(listing).reduce((n, packages) => n + packages.length, 0);
const bad = refused(listing);
if (bad.length > 0) {
  console.error(`✗ ${bad.length} of ${count} shipped packages have a license that may not ship:`);
  for (const p of bad) console.error(`  ${p.name}@${p.version}: ${p.license}`);
  console.error("Allow a permissive license in packages/lint/src/licenses.ts (with why), or drop the dependency.");
  process.exit(1);
}
console.log(`✓ ${count} shipped packages, all under allowed licenses (${Object.keys(listing).sort().join(", ")})`);
