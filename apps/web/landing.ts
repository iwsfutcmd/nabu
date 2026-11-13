/**
 * The site's landing page (the root of the GitHub Pages site, beside the demo and Storybook). It is
 * written when the site is built, from the bundles the demo serves and the UI catalog, so it shows
 * every course as the demo has it: its scripts, lessons and stories, and how much of it no native
 * speaker has checked yet. Nothing on it is written by hand; a course added to the bundles appears
 * at the next deploy.
 *
 * - Its text comes from the catalog (landing.*, course and orthography names), in the default UI
 *   locale; the page takes that locale's lang and dir.
 * - Each script shows a sentence of the course's first lessons, tagged with its own language and
 *   direction and set in its profile's fonts.
 * - It uses the demo's stylesheet (the design tokens, light and dark, and the web fonts the samples
 *   need) and the theme chosen in the app, which keeps it on the same origin (`nabu.theme`).
 *
 *   node landing.ts <site> [<repository URL>]   # after the demo is built into <site>/demo
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { draftCount } from "@nabu/core/corrections";
import { pathNodes } from "@nabu/core/learner";
import { assembleCourse, lessonNodes, MEDIA_ROLES, type CourseView } from "@nabu/core/lesson";
import { surfaceOf } from "@nabu/core/text";
import { DEFAULT_UI_LOCALE, directionOf, fontStackFor, loadTranslator, uiFontStack, type MessageId, type Translator } from "@nabu/i18n";
import type { BundleManifest, Fonts, TaggedText } from "@nabu/schema";
import { coursesWithAudio } from "./audio-check.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const REPOSITORY = "https://github.com/iwsfutcmd/nabu";
const numberingSystems = JSON.parse(readFileSync(join(ROOT, "packages/i18n/src/generated/numbering-systems.json"), "utf8")) as Record<string, string>;

export interface LandingOptions {
  /** The bundles directory the demo serves (index.json and a directory per course). */
  readonly bundles: string;
  /** The demo's URL from the page, ending in "/" ("demo/" on the site). */
  readonly demo: string;
  /** The demo's stylesheets, as URLs from the page. */
  readonly stylesheets: readonly string[];
  /** Storybook's URL from the page, ending in "/". */
  readonly storybook?: string;
  readonly repository?: string;
  readonly locale?: string;
  /** Courses whose clips the audio check lists (default: every course with audio in courses/). */
  readonly audioCourses?: readonly string[];
}

interface IndexEntry {
  readonly id: string;
  readonly manifest: string;
  readonly orthographies: readonly string[];
}

/** One course as the page shows it. */
export interface LandingCourse {
  readonly id: string;
  readonly lessons: number;
  readonly stories: number;
  readonly drafts: number;
  readonly total: number;
  /** Each orthography, with a sample sentence in it and its profile's fonts. */
  readonly scripts: readonly { readonly orthography: string; readonly sample: TaggedText | undefined; readonly fonts: Fonts | undefined }[];
}

const slug = (orthography: string): string => orthography.replace("/", ".");

const escape = (text: string): string =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

/** Words enough for a sample to show its script: a greeting of one word shows little of it. */
const SAMPLE_WORDS = 3;

/**
 * The course's sample sentence in an orthography: the first, in lesson order, with at least
 * SAMPLE_WORDS words; else its first sentence.
 */
const sampleSentence = (course: CourseView): TaggedText | undefined => {
  const forms = lessonNodes(course).flatMap(({ unit, node }) => node.sentences.flatMap((id) => unit.sentences.find((s) => s.id === id)?.forms[course.orthography]?.text ?? []));
  return forms.find((f) => f.tokens.filter((t) => t.kind === "word").length >= SAMPLE_WORDS) ?? forms[0];
};

/** Every course of the bundles, assembled in each of its orthographies. */
export const landingCourses = (bundles: string): readonly LandingCourse[] => {
  const index = JSON.parse(readFileSync(join(bundles, "index.json"), "utf8")) as { courses: readonly IndexEntry[] };
  return index.courses.map((entry) => {
    const manifest = JSON.parse(readFileSync(join(bundles, entry.manifest), "utf8")) as BundleManifest;
    const dir = join(bundles, entry.manifest, "..");
    const files = new Map<string, unknown>(
      manifest.files.filter((f) => !MEDIA_ROLES.has(f.role)).map((f) => [f.path, JSON.parse(readFileSync(join(dir, f.path), "utf8")) as unknown]),
    );
    const views = entry.orthographies.map((orthography) => {
      const course = assembleCourse({ manifest, files, numberingSystems }, orthography);
      if (!course.ok) throw new Error(`${entry.id} ${orthography}: ${JSON.stringify(course.error)}`);
      return course.value;
    });
    const first = views[0];
    if (first === undefined) throw new Error(`${entry.id} has no orthography`);
    const path = pathNodes(first);
    const { drafts, total } = draftCount(first.units);
    return {
      id: entry.id,
      lessons: path.filter((e) => e.kind === "lesson").length,
      stories: path.filter((e) => e.kind === "story").length,
      drafts,
      total,
      scripts: views.map((view) => ({ orthography: view.orthography, sample: sampleSentence(view), fonts: view.profiles.get(view.orthography)?.source.fonts })),
    };
  });
};

const has = (t: Translator, key: string): key is MessageId => t.has(key);
const courseName = (t: Translator, id: string): string => {
  const key = `course.name.${id}`;
  return has(t, key) ? t.format(key) : id;
};
const orthographyName = (t: Translator, orthography: string): string => {
  const key = `orthography.${slug(orthography)}`;
  return has(t, key) ? t.format(key) : orthography;
};

/** Links in a list, joined as the UI locale joins a list. */
const linkList = (t: Translator, links: readonly { readonly href: string; readonly label: string }[]): string => {
  const parts = new Intl.ListFormat(t.locale, { type: "conjunction" }).formatToParts(links.map((l) => l.label));
  let i = 0;
  return parts
    .map((p) => {
      if (p.type === "literal") return escape(p.value);
      const link = links[i++];
      return link === undefined ? escape(p.value) : `<a href="${escape(link.href)}">${escape(p.value)}</a>`;
    })
    .join("");
};

const sample = (text: TaggedText, fonts: Fonts | undefined): string => {
  const font = fontStackFor(text.lang, fonts);
  const style = `font-family: ${font.family}; line-height: ${String(font.lineHeight)}`;
  return `<p class="sample" lang="${escape(text.lang)}" dir="${directionOf(text.lang)}" style="${escape(style)}">${escape(surfaceOf(text))}</p>`;
};

const courseCard = (t: Translator, demo: string, course: LandingCourse): string => {
  const scripts = course.scripts
    .map((s) => `<li data-orthography="${escape(s.orthography)}"><a href="${escape(`${demo}#/${course.id}/${slug(s.orthography)}`)}">${escape(orthographyName(t, s.orthography))}</a>${s.sample === undefined ? "" : sample(s.sample, s.fonts)}</li>`)
    .join("");
  const facts = [t.format("landing.course.lessons", { count: course.lessons }), ...(course.stories > 0 ? [t.format("landing.course.stories", { count: course.stories })] : [])];
  return [
    `<li class="course" data-course="${escape(course.id)}">`,
    `<h3>${escape(courseName(t, course.id))}</h3>`,
    `<ul class="facts">${facts.map((f) => `<li>${escape(f)}</li>`).join("")}</ul>`,
    `<ul class="scripts">${scripts}</ul>`,
    course.drafts > 0 ? `<p class="drafts" data-drafts="${String(course.drafts)}">${escape(t.format("app.course.drafts", { drafts: course.drafts, total: course.total }))}</p>` : "",
    "</li>",
  ].join("");
};

const FEATURES = [
  "landing.feature.lessons",
  "landing.feature.stories",
  "landing.feature.review",
  "landing.feature.words",
  "landing.feature.offline",
  "landing.feature.looks",
  "landing.feature.reports",
] as const satisfies readonly MessageId[];

/** The page's own styles: logical properties and the app's design tokens only. */
const styles = (t: Translator): string => {
  const ui = uiFontStack(t.locale);
  return `
body { margin: 0; color: var(--nabu-color-text); background-color: var(--nabu-color-page); font-family: ${ui.family}; line-height: ${String(ui.lineHeight)}; }
main { box-sizing: border-box; max-inline-size: 64rem; margin-inline: auto; padding-block: var(--nabu-space-5) calc(var(--nabu-space-5) * 2); padding-inline: var(--nabu-space-4); }
a { color: var(--nabu-color-accent); }
a:focus-visible { outline: 3px solid var(--nabu-color-accent); outline-offset: 2px; }
h1 { margin-block: 0 var(--nabu-space-2); font-size: 2.5rem; }
h2 { margin-block: calc(var(--nabu-space-5) * 2) var(--nabu-space-3); }
.tagline { max-inline-size: 42rem; margin-block: 0 var(--nabu-space-5); font-size: 1.25rem; }
.open { display: inline-block; padding-block: var(--nabu-space-3); padding-inline: var(--nabu-space-5); color: var(--nabu-color-accent-text); background-color: var(--nabu-color-accent); border-radius: var(--nabu-radius-tile); font-weight: 700; text-decoration: none; }
.note { max-inline-size: 42rem; color: var(--nabu-color-muted); }
.courses { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 17rem), 1fr)); gap: var(--nabu-space-4); margin: 0; padding: 0; list-style: none; }
.course { display: flex; flex-direction: column; gap: var(--nabu-space-3); padding: var(--nabu-space-4); background-color: var(--nabu-color-surface); border: 1px solid var(--nabu-color-border); border-radius: var(--nabu-radius-card); }
.course h3 { margin: 0; font-size: 1.25rem; }
.facts { display: flex; flex-wrap: wrap; gap: var(--nabu-space-1) var(--nabu-space-3); margin: 0; padding: 0; color: var(--nabu-color-muted); list-style: none; }
.scripts { display: flex; flex-direction: column; gap: var(--nabu-space-3); margin: 0; padding: 0; list-style: none; }
.sample { margin-block: var(--nabu-space-1) 0; font-size: 1.375rem; overflow-wrap: anywhere; }
.drafts { margin-block: auto 0; color: var(--nabu-color-muted); font-size: 0.875rem; }
.features, .links { margin: 0; padding-inline-start: var(--nabu-space-5); }
.features li, .links li { margin-block: var(--nabu-space-2); }
`;
};

/** The landing page, as HTML. */
export const landingPage = async (options: LandingOptions): Promise<string> => {
  const t = await loadTranslator(options.locale ?? DEFAULT_UI_LOCALE);
  const repository = options.repository ?? REPOSITORY;
  const storybook = options.storybook ?? "storybook/";
  const collator = new Intl.Collator(t.locale);
  const courses = [...landingCourses(options.bundles)].sort((a, b) => collator.compare(courseName(t, a.id), courseName(t, b.id)));
  const withAudio = new Set(options.audioCourses ?? coursesWithAudio());
  // Straight to the audio check: it needs no debug mode, which a visitor would keep on this device.
  const audio = courses
    .filter((c) => withAudio.has(c.id))
    .map((c) => ({ href: `${options.demo}#/${c.id}/${slug(c.scripts[0]?.orthography ?? "")}/audio`, label: courseName(t, c.id) }));
  const name = t.format("app.name");
  const tagline = t.format("landing.tagline");
  return `<!doctype html>
<html lang="${escape(t.locale)}" dir="${t.dir}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escape(name)}</title>
<meta name="description" content="${escape(tagline)}" />
<meta name="color-scheme" content="light dark" />
<link rel="icon" href="${escape(`${options.demo}icons/nabu.svg`)}" type="image/svg+xml" />
<script>
  // The theme chosen in the app (Preferences, nabu.theme), before the first paint.
  try {
    var theme = localStorage.getItem("nabu.theme");
    if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
  } catch (e) {}
</script>
${options.stylesheets.map((href) => `<link rel="stylesheet" href="${escape(href)}" />`).join("\n")}
<style>${styles(t)}</style>
</head>
<body>
<main data-landing="">
<header>
<h1>${escape(name)}</h1>
<p class="tagline">${escape(tagline)}</p>
<p><a class="open" href="${escape(options.demo)}" data-open-app="">${escape(t.format("landing.open"))}</a></p>
</header>
<section aria-labelledby="courses">
<h2 id="courses">${escape(t.format("landing.courses.title"))}</h2>
<p class="note">${escape(t.format("landing.courses.note"))}</p>
<ul class="courses">${courses.map((c) => courseCard(t, options.demo, c)).join("")}</ul>
</section>
<section aria-labelledby="features">
<h2 id="features">${escape(t.format("landing.features.title"))}</h2>
<ul class="features">${FEATURES.map((key) => `<li>${escape(t.format(key))}</li>`).join("")}</ul>
</section>
<section aria-labelledby="contribute">
<h2 id="contribute">${escape(t.format("landing.contribute.title"))}</h2>
<ul class="links">
<li><a href="${escape(`${repository}/blob/main/courses/REVIEW.md`)}">${escape(t.format("landing.contribute.review"))}</a></li>
${audio.length > 0 ? `<li data-audio-check="">${escape(t.format("landing.contribute.audio"))} ${linkList(t, audio)}</li>` : ""}
<li><a href="${escape(storybook)}">${escape(t.format("landing.contribute.storybook"))}</a></li>
<li><a href="${escape(`${options.demo}?ui=ar-XB`)}">${escape(t.format("landing.contribute.rtl"))}</a></li>
<li><a href="${escape(`${options.demo}?ui=en-XA`)}">${escape(t.format("landing.contribute.long"))}</a></li>
<li><a href="${escape(repository)}">${escape(t.format("landing.contribute.source"))}</a></li>
</ul>
</section>
</main>
</body>
</html>
`;
};

/** The demo's stylesheets, from its built index.html (base "./" or "/"), as URLs under `demo`. */
export const demoStylesheets = (demoIndex: string, demo: string): readonly string[] =>
  [...readFileSync(demoIndex, "utf8").matchAll(/<link\s+rel="stylesheet"[^>]*\shref="([^"]+)"/gu)].map((m) => `${demo}${(m[1] ?? "").replace(/^\.?\//u, "")}`);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [site, repository] = process.argv.slice(2);
  if (site === undefined) {
    process.stderr.write("usage: node landing.ts <site> [<repository URL>]\n");
    process.exit(2);
  }
  const root = resolve(site);
  const html = await landingPage({
    bundles: join(root, "demo", "bundles"),
    demo: "demo/",
    stylesheets: demoStylesheets(join(root, "demo", "index.html"), "demo/"),
    ...(repository === undefined ? {} : { repository }),
  });
  writeFileSync(join(root, "index.html"), html);
  process.stdout.write(`landing page → ${join(root, "index.html")}\n`);
}
