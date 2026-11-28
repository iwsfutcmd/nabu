/**
 * The rules explorer (debug mode): a lexeme realised in a cell, with other lexemes written onto it,
 * and spelled by each orthography of the course, as it is changed (`explore`, @nabu/core/lesson). It is
 * linked from the course page only in debug mode, reads the lexicon's own files and the course's
 * profiles beside the app (lexicon-source.ts), keeps what is explored in the address, lists how the
 * course's tokens write the lexeme with the rules' verdict on each, and records nothing.
 */
import { readFileSync } from "node:fs";
import { explore, isLexiconSource, rulesExplorer, waysOf, EXPLORE_DEFAULTS, type ExploreRequest, type LexiconSource } from "@nabu/core/lesson";
import { expect, test } from "@playwright/test";
import { parse } from "yaml";
import { loadCourse, logOf, seriousAxeViolations } from "./solver.ts";

test.beforeEach(({ page: _ }, info) => {
  test.skip(info.project.name !== "keyboard", "one desktop pass is enough");
});

/** A course's lexicon files and profiles as lexicon-source.ts serves them, read from the repository. */
const sourceOf = (course: string): LexiconSource => {
  const root = new URL("../../../../", import.meta.url);
  const yaml = (path: string): unknown => parse(readFileSync(new URL(path, root), "utf8"));
  const { lexicon, orthographies } = yaml(`courses/${course}/course.yaml`) as { lexicon: string; orthographies: readonly string[] };
  const source = {
    course,
    lexicon,
    lexemes: yaml(`lexicons/${lexicon}/lexemes.yaml`),
    language: yaml(`lexicons/${lexicon}/language.yaml`),
    profiles: Object.fromEntries(orthographies.map((o) => [o, yaml(`profiles/${o.replace("/", ".")}.yaml`)])),
  };
  if (!isLexiconSource(source)) throw new Error(`${course}: no lexicon`);
  return source;
};

test("a lexeme is put through the rules as it is changed, kept in the address, and nothing is recorded", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const course = loadCourse("apc", "apc-Arab/standard");
  const explorer = rulesExplorer(course, sourceOf("apc"));
  // apc merges lexemes (ADR 0158): you, a woman, drink me is shereb with the present's lexemes and -ni.
  const merged = ["ind", "impf-2", "fs.verb", "obj-1sg"];
  const asked: ExploreRequest = {
    base: "lexeme:shereb",
    feats: {},
    before: [{ lexeme: "lexeme:ind" }, { lexeme: "lexeme:impf-2" }],
    after: [{ lexeme: "lexeme:fs.verb" }, { lexeme: "lexeme:obj-1sg" }],
    ...EXPLORE_DEFAULTS,
  };
  const expected = explore(explorer, asked);
  if (!expected.ok) throw new Error("apc's rules give shereb's 2fs present");

  // No way in without debug mode.
  await page.goto("/?sound=off#/apc/apc-Arab.standard");
  await expect(page.locator("[data-course-path]")).toBeVisible();
  await expect(page.locator("[data-rules-link]")).toHaveCount(0);

  await page.goto("/?sound=off&debug=1#/apc/apc-Arab.standard");
  const before = (await logOf(page, "apc")).length;
  await page.locator("[data-rules-link]").click();
  await expect(page.locator("[data-rules-page=apc]")).toBeVisible();
  const root = page.locator("[data-rules-explorer=apc]");

  // The lexicon is browsed before anything is typed, a page at a time, and narrowed by its facets.
  const base = root.locator('[data-picker="rules-base"]');
  await expect(base.locator("[data-rules-found]")).toHaveAttribute("data-rules-found", String(explorer.lexemes.length));
  await expect(base.locator("[data-pick]")).toHaveCount(Math.min(40, explorer.lexemes.length));
  await base.locator("[data-action=lexicon-filter]").click();
  await base.locator('[data-facet="pos"] [data-facet-value="VERB"]').click();
  await expect(base.locator("[data-rules-found]")).toHaveAttribute("data-rules-found", String(explorer.lexemes.filter((l) => l.row.facets.pos.includes("VERB")).length));
  // A lexeme to add is listed only once something is typed or chosen.
  await expect(root.locator('[data-picker="rules-add"] [data-pick]')).toHaveCount(0);

  // The base is found by its id and picked.
  await root.locator("[data-field=rules-base]").fill("shereb");
  await root.locator('[data-pick="lexeme:shereb"]').click();
  await expect(root.locator('[data-base="lexeme:shereb"]')).toBeVisible();

  // It opens as its citation, the he-past: shereb and the zero of perf-3ms. No switches to set.
  await expect(root.locator('[data-attached="lexeme:perf-3ms"]')).toBeVisible();
  await expect(root.locator("[data-feature]")).toHaveCount(0);
  await root.locator('[data-attached="lexeme:perf-3ms"] [data-action=rules-remove]').click();
  // The present's lexemes and -ni, each offered once it can merge and written where it merges: the result follows each change.
  for (const id of ["impf-2", "fs.verb", "ind", "obj-1sg"]) {
    await root.locator("[data-field=rules-add]").fill(id);
    await root.locator(`[data-picker="rules-add"] [data-pick="lexeme:${id}"]`).click();
  }
  expect(await root.locator("[data-attached]").evaluateAll((els) => els.map((e) => e.getAttribute("data-attached")))).toEqual(merged.map((id) => `lexeme:${id}`));
  const live = root.locator("[data-rules-live]");
  await expect(live.locator("[data-rules-result]")).toHaveAttribute("data-status", "given");
  await expect(live.locator("[data-rule-step]")).toHaveText(expected.steps.map((s) => (s.branch === undefined ? s.rule : `${s.rule}|${s.branch}`)));
  for (const s of expected.spellings) {
    const where = s.layer === undefined ? `[data-spelled="${s.orthography}"]:not([data-layer])` : `[data-spelled="${s.orthography}"][data-layer="${s.layer}"]`;
    await expect(live.locator(`${where} [data-spelling]`)).toHaveText(s.spelling?.tokens[0]?.surface ?? "");
  }
  expect(await seriousAxeViolations(page, "[data-rules-page]")).toEqual([]);

  // The address keeps it: a reload explores the same.
  await page.reload();
  await expect(page.locator('[data-rules-explorer=apc] [data-attached="lexeme:obj-1sg"]')).toBeVisible();
  await expect(page.locator("[data-rules-live] [data-rule-step]")).toHaveCount(expected.steps.length);

  // How the course writes shereb: each way with the rules' verdict, as the compiler's check gives it.
  const ways = waysOf(explorer, "lexeme:shereb");
  await expect(page.locator("[data-way]")).toHaveCount(ways.length);
  await expect(page.locator("[data-way][data-verdict=differs], [data-way][data-verdict=error]")).toHaveCount(0);
  // A way loads into the explorer.
  await page.locator("[data-action=rules-explore-way]").first().click();
  const first = ways[0];
  if (first === undefined) throw new Error("the course writes shereb");
  await expect(page.locator("[data-attached]")).toHaveCount(first.request.before.length + first.request.after.length);

  // Blocking off, and back: the options are the request's too.
  await page.locator("[data-option=blocking]").click();
  await expect(page).toHaveURL(/o%3Dblocking/u);

  expect((await logOf(page, "apc")).length).toBe(before);
  expect(errors).toEqual([]);
});

test("a lexicon no course uses: what brings a feature is found by its name, and each lexeme stands where it says", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/?sound=off&debug=1#/lexicon/arb/rules");
  const root = page.locator("[data-rules-explorer]");
  await root.locator("[data-field=rules-base]").fill("kataba");
  await root.locator('[data-pick="lexeme:kataba"]').click();
  await expect(root.locator('[data-base="lexeme:kataba"]')).toBeVisible();
  await expect(root.locator("[data-rules-missing]").first()).toHaveAttribute("data-rules-missing", /VerbForm/u);

  // The lexemes that bring a VerbForm to it, whatever the value, without knowing their ids.
  const add = root.locator('[data-picker="rules-add"]');
  await add.locator("[data-action=lexicon-filter]").click();
  await add.locator('[data-facet="dimension"] [data-facet-value="VerbForm"]').click();
  // The perfect's endings and the imperfect's prefixes bring it with their person; the imperative is null.
  for (const id of ["perf-3ms", "perf-1sg", "impf-3", "impf-1pl", "imp", "ptcp"]) await expect(add.locator(`[data-pick="lexeme:${id}"]`)).toBeVisible();
  await expect(add.locator('[data-pick="lexeme:ms"]')).toHaveCount(0);

  // No side to choose: each lexeme says where it stands, and is written there (ya- before the verb).
  await expect(root.locator("[data-add-side]")).toHaveCount(0);
  await add.locator('[data-pick="lexeme:impf-3"]').click();
  await expect(root.locator('[data-around=before] [data-attached="lexeme:impf-3"]')).toBeVisible();
  await add.locator("[data-action=lexicon-filter-clear]").click();

  // Only what merges onto the word as it stands: no second tense, no mood before the number, no suffix before it is whole.
  const offered = (id: string) => add.locator(`[data-pick="lexeme:${id}"]`);
  await root.locator("[data-field=rules-add]").fill("perf-3ms");
  await expect(offered("perf-3ms")).toHaveCount(0);
  await root.locator("[data-field=rules-add]").fill("obj-3ms");
  await expect(offered("obj-3ms")).toHaveCount(0);
  await root.locator("[data-field=rules-add]").fill("ind");
  await expect(offered("ind")).toHaveCount(0);
  for (const id of ["mpl", "ind", "obj-3ms"]) {
    await root.locator("[data-field=rules-add]").fill(id);
    await offered(id).click();
  }
  await expect(root.locator("[data-around=after] [data-attached]")).toHaveCount(3);
  expect(await root.locator("[data-around=after] [data-attached]").evaluateAll((els) => els.map((e) => e.getAttribute("data-attached")))).toEqual([
    "lexeme:mpl",
    "lexeme:ind",
    "lexeme:obj-3ms",
  ]);
  await expect(root.locator("[data-action=rules-earlier]")).toHaveCount(0);
  await expect(root.locator("[data-rules-live] [data-rules-result]")).toBeVisible();
  await expect(root.locator("[data-rules-live] [data-rules-missing]")).toHaveCount(0);
  expect(errors).toEqual([]);
});
