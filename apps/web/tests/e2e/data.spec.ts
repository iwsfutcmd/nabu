/**
 * The Data page (debug mode): everything a course says of its words, forms and sentences, to
 * browse. It is linked from the course page only in debug mode, lists what `courseData` lists, is
 * searched by letters, meanings and ids, and records nothing. Its Lexicon view lists every lexeme
 * of the lexicon (`lexiconData`), each opening to everything stored on it, read from the lexicon's
 * own files beside the app (lexicon-source.ts) where they are there, and filtered by facets read off
 * the lexicon (`lexiconFacets`) on top of the search.
 */
import { readFileSync } from "node:fs";
import { courseData, dataMatcher, isLexiconSource, lexiconData, lexiconFacets, lexiconFilter, type LexiconFilter, type LexiconSource } from "@nabu/core/lesson";
import { expect, test } from "@playwright/test";
import { parse } from "yaml";
import { loadCourse, logOf, seriousAxeViolations } from "./solver.ts";

test.beforeEach(({ page: _ }, info) => {
  test.skip(info.project.name !== "keyboard", "one desktop pass is enough");
});

test("a course's words, forms and sentences are browsed and searched, and nothing is recorded", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const course = loadCourse("uz", "uz-Latn/standard");
  const data = courseData(course);

  // No way in without debug mode.
  await page.goto("/?sound=off#/uz/uz-Latn.standard");
  await expect(page.locator("[data-course-path]")).toBeVisible();
  await expect(page.locator("[data-data-link]")).toHaveCount(0);

  await page.goto("/?sound=off&debug=1#/uz/uz-Latn.standard");
  const before = (await logOf(page, "uz")).length;
  await page.locator("[data-data-link]").click();
  await expect(page.locator("[data-data-page=uz]")).toBeVisible();
  const browser = page.locator("[data-data-browser=uz]");
  const rows = browser.locator("[data-data-row]");
  const found = browser.locator("[data-data-found]");

  // The words, a page at a time, under their units.
  await expect(browser.locator("[data-data-view]")).toHaveAttribute("data-data-view", "words");
  await expect(found).toHaveAttribute("data-data-found", String(data.words.length));
  await expect(rows).toHaveCount(Math.min(40, data.words.length));
  await browser.locator("[data-action=data-more]").click();
  await expect(rows).toHaveCount(Math.min(80, data.words.length));
  expect(await seriousAxeViolations(page, "[data-data-page]")).toEqual([]);

  // A word is found by its id, and shows every way a sentence writes it, each with its parts.
  const word = data.words.find((w) => w.written.some((x) => x.carries?.asked === true));
  if (word === undefined) throw new Error("uz has a word the parts cards ask");
  const search = browser.locator("[data-field=data-search]");
  await search.fill(word.id.id);
  await expect(found).toHaveAttribute("data-data-found", "1");
  const row = browser.locator(`[data-data-row="${word.id.id}"]`);
  await expect(row.locator("[data-entry-id]")).toHaveText(word.id.id);
  await expect(row.locator("[data-written]")).toHaveCount(word.written.length);
  await expect(row.locator("[data-parts-asked]")).toHaveCount(word.written.filter((x) => x.carries?.asked === true).length);
  await expect(row.locator("[data-written] [data-parts]").first()).toHaveAttribute("dir", "ltr");

  // The forms, each with the words that carry it.
  await browser.locator("[data-view=forms]").click();
  await search.fill("");
  await expect(found).toHaveAttribute("data-data-found", String(data.forms.length));
  const form = data.forms.find((f) => f.carriers.length > 0);
  if (form === undefined) throw new Error("uz has a form some word carries");
  await search.fill(form.id.id);
  const formRow = browser.locator(`[data-data-row="${form.id.id}"]`);
  await expect(formRow.locator("[data-carrier]")).toHaveCount(Math.min(12, form.carriers.length));

  // The sentences that list it: found by its id, each with its words.
  await browser.locator("[data-view=sentences]").click();
  const listing = data.sentences.filter(dataMatcher(course, form.id.id).sentences);
  expect(listing.length).toBeGreaterThan(0);
  await expect(found).toHaveAttribute("data-data-found", String(listing.length));
  const first = browser.locator(`[data-data-row="${listing[0]?.sentence.id ?? ""}"]`);
  await expect(first.locator("[data-listed-part]").filter({ hasText: form.id.id }).first()).toBeVisible();
  await expect(first.locator("[data-sentence-word]")).toHaveCount(listing[0]?.words.length ?? 0);
  expect(await seriousAxeViolations(page, "[data-data-page]")).toEqual([]);

  // Nothing matches, said in the count; and nothing was recorded.
  await search.fill("zzqqxxzzqq");
  await expect(found).toHaveAttribute("data-data-found", "0");
  await expect(rows).toHaveCount(0);
  expect((await logOf(page, "uz")).length).toBe(before);
  expect(errors).toEqual([]);
});

test("a right-to-left course's data keeps each text in its own direction", async ({ page }) => {
  const course = loadCourse("fa", "fa-Arab/standard");
  const data = courseData(course);
  await page.goto("/?sound=off&debug=1#/fa/fa-Arab.standard/data");
  const browser = page.locator("[data-data-browser=fa]");
  await expect(browser.locator("[data-data-found]")).toHaveAttribute("data-data-found", String(data.words.length));
  const word = data.words.find((w) => w.written.some((x) => x.carries?.asked === true));
  if (word === undefined) throw new Error("fa has a word the parts cards ask");
  await browser.locator("[data-field=data-search]").fill(word.id.id);
  const row = browser.locator(`[data-data-row="${word.id.id}"]`);
  // The word and its parts read right to left; its id and tags left to right; its meaning as English does.
  await expect(row.locator("[data-parts]").first()).toHaveAttribute("dir", "rtl");
  await expect(row.locator("[data-nabu-text][lang^=fa]").first()).toHaveAttribute("dir", "rtl");
  await expect(row.locator("[data-nabu-text][lang^=en]").first()).toHaveAttribute("dir", "ltr");
  expect(await row.locator("[data-entry-id]").evaluate((el) => getComputedStyle(el).direction)).toBe("ltr");
  expect(await seriousAxeViolations(page, "[data-data-page]")).toEqual([]);
});

/** A course's lexicon files as lexicon-source.ts serves them, read from the repository. */
const lexiconSourceOf = (course: string): LexiconSource => {
  const root = new URL("../../../../", import.meta.url);
  const lexicon = (parse(readFileSync(new URL(`courses/${course}/course.yaml`, root), "utf8")) as { lexicon: string }).lexicon;
  const read = (file: string): unknown => parse(readFileSync(new URL(`lexicons/${lexicon}/${file}`, root), "utf8"));
  const source: unknown = { lexemes: read("lexemes.yaml"), language: read("language.yaml") };
  if (!isLexiconSource(source)) throw new Error(`${course}: no lexicon`);
  return source;
};

/** Every key of a stored value, at every depth. */
const keysOf = (value: unknown): readonly string[] =>
  Array.isArray(value) ? value.flatMap(keysOf) : typeof value === "object" && value !== null ? Object.entries(value).flatMap(([k, v]) => [k, ...keysOf(v)]) : [];

test("every lexeme of the lexicon opens to everything stored on it, and can be linked to", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const course = loadCourse("uz", "uz-Latn/standard");
  const source = lexiconSourceOf("uz");
  const lexicon = lexiconData(course, source);
  const id = "lexeme:dat";
  const entry = source.lexemes.lexemes.find((e) => e["id"] === id);
  if (entry === undefined) throw new Error("uz has a dative");

  await page.goto("/?sound=off&debug=1#/uz/uz-Latn.standard/data");
  const browser = page.locator("[data-data-browser=uz]");
  const found = browser.locator("[data-data-found]");
  await browser.locator("[data-view=lexicon]").click();
  await expect(page).toHaveURL(/#\/uz\/uz-Latn\.standard\/data\/lexicon$/u);
  await expect(found).toHaveAttribute("data-data-found", String(lexicon.lexemes.length));
  await expect(browser.locator("[data-lexicon-file] [data-key=license]")).toBeVisible();
  await expect(browser.locator("[data-lexicon-missing]")).toHaveCount(0);

  // Found by its id; opened, its three parts, every key its entry stores among the first.
  await browser.locator("[data-field=data-search]").fill(id);
  await expect(found).toHaveAttribute("data-data-found", String(lexicon.lexemes.filter(dataMatcher(course, id).lexicon).length));
  const row = browser.locator(`[data-data-row="${id}"]`);
  await expect(row.locator("[data-lexicon-part]")).toHaveCount(0);
  await row.locator("[data-action=lexeme-open]").click();
  await expect(row.locator("[data-lexicon-part]")).toHaveCount(3);
  const stored = row.locator("[data-lexicon-part=source]");
  for (const key of new Set(keysOf(entry))) await expect(stored.locator(`[data-key="${key}"]`).first(), key).toBeAttached();
  await expect(stored.locator('[data-nabu-text][lang^="uz-Cyrl"]').first()).toBeVisible();
  await expect(row.locator("[data-lexicon-part=course] [data-carrier]").first()).toBeVisible();
  expect(await row.locator("[data-lexicon-part=source] [data-key] > dt code").first().evaluate((el) => getComputedStyle(el).direction)).toBe("ltr");
  expect(await seriousAxeViolations(page, "[data-data-page]")).toEqual([]);

  // The address names it: opened again from the address.
  await expect(page).toHaveURL(/#\/uz\/uz-Latn\.standard\/data\/lexicon\/lexeme%3Adat$/u);
  await page.reload();
  await expect(page.locator(`[data-data-row="${id}"] [data-lexicon-part=source] [data-key=allomorphs]`)).toBeVisible();

  // The language file, by the same renderer.
  await page.locator("[data-view=language]").click();
  for (const key of Object.keys(source.language ?? {})) await expect(page.locator(`[data-language-file=source] > dl > [data-key="${key}"]`), key).toBeAttached();
  expect(errors).toEqual([]);
});

test("the lexicon is filtered by what each lexeme is, on top of the search, each value counted", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const course = loadCourse("apc", "apc-Arab/standard");
  const lexicon = lexiconData(course, lexiconSourceOf("apc"));
  const shown = (filter: LexiconFilter, query = ""): number => lexicon.lexemes.filter(dataMatcher(course, query).lexicon).filter(lexiconFilter(filter)).length;
  const countOf = (filter: LexiconFilter, facet: string, value: string, query = ""): number | undefined =>
    lexiconFacets(lexicon.lexemes, lexicon.lexemes.filter(dataMatcher(course, query).lexicon), filter)
      .find((f) => f.facet === facet)
      ?.values.find((v) => v.value === value)?.count;

  await page.goto("/?sound=off&debug=1#/apc/apc-Arab.standard/data/lexicon");
  const browser = page.locator("[data-data-browser=apc]");
  const found = browser.locator("[data-data-found]");
  const filters = browser.locator("[data-lexicon-filters]");
  await expect(found).toHaveAttribute("data-data-found", String(lexicon.lexemes.length));
  // Closed until opened; then every facet the lexicon has, each value with what choosing it shows.
  await expect(filters.locator("[data-facet]").first()).toBeHidden();
  await filters.locator("[data-action=lexicon-filter]").click();
  await expect(filters.locator("[data-facet]").first()).toBeVisible();
  const chip = (facet: string, value: string) => filters.locator(`[data-facet=${facet}] [data-facet-value="${value}"]`);
  await expect(chip("kind", "bound")).toHaveAttribute("data-count", String(countOf({}, "kind", "bound")));
  await expect(chip("pos", "NOUN")).toHaveAttribute("data-count", String(countOf({}, "pos", "NOUN")));

  // Bound lexemes, then those of them with Case=Dat, then those whose entry stores allomorphs.
  await chip("kind", "bound").click();
  await expect(found).toHaveAttribute("data-data-found", String(shown({ kind: ["bound"] })));
  await expect(chip("feature", "Case=Dat")).toHaveAttribute("data-count", String(countOf({ kind: ["bound"] }, "feature", "Case=Dat")));
  await chip("feature", "Case=Dat").click();
  const filter: LexiconFilter = { kind: ["bound"], feature: ["Case=Dat"], has: ["allomorphs"] };
  await chip("has", "allomorphs").click();
  await expect(found).toHaveAttribute("data-data-found", String(shown(filter)));
  for (const row of lexicon.lexemes.filter(lexiconFilter(filter))) await expect(browser.locator(`[data-data-row="${row.id.id}"]`)).toBeVisible();
  await expect(chip("kind", "bound").locator("input")).toBeChecked();
  await expect(filters.locator("[data-filter-chosen]")).toHaveAttribute("data-filter-chosen", "3");
  // A value that would show nothing more is not offered: no free lexeme has Case=Dat and allomorphs.
  expect(countOf(filter, "kind", "free")).toBe(0);
  await expect(chip("kind", "free")).toHaveCount(0);
  expect(await seriousAxeViolations(page, "[data-data-page]")).toEqual([]);

  // The search narrows what the filters count; clearing them leaves the search.
  await browser.locator("[data-field=data-search]").fill("NOUN");
  await expect(found).toHaveAttribute("data-data-found", String(shown(filter, "NOUN")));
  await filters.locator("[data-action=lexicon-filter-clear]").click();
  await expect(found).toHaveAttribute("data-data-found", String(shown({}, "NOUN")));
  await expect(filters.locator("[data-filter-chosen]")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("without the lexicon's files beside the app, the lexicon shows what the bundle carries and says so", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.route("**/lexicon-source/**", (route) => route.fulfill({ status: 404, body: "not found" }));
  await page.goto("/?sound=off&debug=1#/es/es-Latn.standard/data/lexicon/lexeme%3Acasa");
  const row = page.locator('[data-data-row="lexeme:casa"]');
  await expect(page.locator("[data-lexicon-missing]")).toHaveCount(1);
  await expect(row.locator("[data-lexicon-part]")).toHaveCount(2);
  await expect(row.locator("[data-lexicon-part=bundle] [data-key=feats] [data-key=Gender]")).toBeVisible();
  await expect(row.locator("[data-lexicon-part=course] [data-written]").first()).toBeVisible();
  await page.locator("[data-view=language]").click();
  await expect(page.locator("[data-language-file=bundle] [data-key=labels]")).toBeVisible();
  expect(await seriousAxeViolations(page, "[data-data-page]")).toEqual([]);
  expect(errors).toEqual([]);
});
