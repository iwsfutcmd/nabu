// Runs the visual suite inside the pinned Playwright image, the same one CI
// uses, so screenshots are comparable. Extra arguments go to `playwright test`
// (e.g. --update-snapshots). Keep the tag in sync with @playwright/test.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ui = resolve(import.meta.dirname, "../..");
const repo = resolve(ui, "../..");
const version = JSON.parse(readFileSync(resolve(ui, "package.json"), "utf8")).devDependencies["@playwright/test"];
const image = `mcr.microsoft.com/playwright:v${version}-noble`;
const args = [
  "run", "--rm", "--ipc=host",
  "-v", `${repo}:/work`, "-w", "/work/packages/ui",
  "-e", "NABU_VISUAL_ENV=container", "-e", "CI",
  image,
  "node", "node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2),
];
console.log(`docker ${args.join(" ")}`);
const result = spawnSync("docker", args, { stdio: "inherit" });
process.exit(result.status ?? 1);
