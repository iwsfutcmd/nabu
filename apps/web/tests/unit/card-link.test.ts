/**
 * A debug link carries its card (card-link.ts): every kind of card of every course comes back from its code
 * exactly as it went in, and a code cut short, garbled or from another format comes back as nothing. What is
 * pasted into Open a card is a card's link (its route kept, from any copy of the app) or its id.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { assembleCourse, BUNDLE_FORMAT, cardGallery, MEDIA_ROLES, type CourseView, type Exercise } from "@nabu/core/lesson";
import type { BundleManifest } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import { cardTargetOf, decodeCard, encodeCard } from "../../src/card-link.ts";

const ROOT = resolve(import.meta.dirname, "../../../..");
const BUNDLES = join(ROOT, "apps/web/public/bundles");
const numberingSystems = JSON.parse(readFileSync(join(ROOT, "packages/i18n/src/generated/numbering-systems.json"), "utf8")) as Record<string, string>;

const loadCourse = (id: string): CourseView => {
  const manifest = JSON.parse(readFileSync(join(BUNDLES, id, "manifest.json"), "utf8")) as BundleManifest;
  const files = new Map<string, unknown>(manifest.files.filter((f) => !MEDIA_ROLES.has(f.role)).map((f) => [f.path, JSON.parse(readFileSync(join(BUNDLES, id, f.path), "utf8")) as unknown]));
  const course = assembleCourse({ manifest, files, numberingSystems });
  if (!course.ok) throw new Error(JSON.stringify(course.error));
  return course.value;
};

const index = JSON.parse(readFileSync(join(BUNDLES, "index.json"), "utf8")) as { readonly courses: readonly { readonly id: string }[] };
const deflated = async (text: string): Promise<string> => {
  const bytes = new Uint8Array(await new Response(new Blob([new TextEncoder().encode(text)]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer());
  return Buffer.from(bytes).toString("base64url");
};
const card = (id: string): Exercise => {
  const first = cardGallery(loadCourse(id)).find((c) => c.exercise !== undefined)?.exercise;
  if (first === undefined) throw new Error(`no card in ${id}`);
  return first;
};

describe("card links", () => {
  it.each(index.courses.map((c) => c.id))("bring back every kind of %s card exactly", async (id) => {
    const cards = cardGallery(loadCourse(id)).flatMap((c) => (c.exercise === undefined ? [] : [c.exercise]));
    expect(cards.length).toBeGreaterThan(5);
    for (const exercise of cards) {
      const code = await encodeCard(exercise);
      // A code sits in a URL's fragment as it is.
      expect(code).toMatch(/^[A-Za-z0-9_-]+$/u);
      // Nothing in a card is lost on the way: no Map, Set or undefined a JSON round trip would drop.
      expect(await decodeCard(code)).toStrictEqual(JSON.parse(JSON.stringify(exercise)));
      expect(JSON.parse(JSON.stringify(exercise))).toStrictEqual(exercise);
    }
  });

  it("refuses a code cut short, garbled or not a card", async () => {
    const code = await encodeCard(card("fa"));
    expect(await decodeCard(code.slice(0, Math.floor(code.length / 2)))).toBeUndefined();
    expect(await decodeCard("not a code!")).toBeUndefined();
    expect(await decodeCard("")).toBeUndefined();
    expect(await decodeCard(await deflated("[1, 2, 3]"))).toBeUndefined();
    expect(await decodeCard(await deflated(JSON.stringify({ format: 1, bundle: BUNDLE_FORMAT, exercise: { template: "no-such-template", id: "x" } })))).toBeUndefined();
  });

  it("refuses a card of another link format or bundle format", async () => {
    const exercise = card("fa");
    expect(await decodeCard(await deflated(JSON.stringify({ format: 1, bundle: BUNDLE_FORMAT, exercise })))).toStrictEqual(exercise);
    expect(await decodeCard(await deflated(JSON.stringify({ format: 2, bundle: BUNDLE_FORMAT, exercise })))).toBeUndefined();
    expect(await decodeCard(await deflated(JSON.stringify({ format: 1, bundle: BUNDLE_FORMAT - 1, exercise })))).toBeUndefined();
    expect(await decodeCard(await deflated(JSON.stringify({ format: 1, exercise })))).toBeUndefined();
  });
});

describe("what Open a card takes", () => {
  it("keeps a card link's route, from any copy of the app", () => {
    expect(cardTargetOf("https://example.org/nabu/demo/?debug=1#/tok/tok-Qaap.sitelen-pona/card/xZRBbt_-9")).toEqual({ tag: "address", hash: "#/tok/tok-Qaap.sitelen-pona/card/xZRBbt_-9" });
    expect(cardTargetOf("  #/yue/yue-Hant-HK.standard/card-id/gap-fill%3As.6\n")).toEqual({ tag: "address", hash: "#/yue/yue-Hant-HK.standard/card-id/gap-fill%3As.6" });
  });

  it("reads a card id as its course, orthography and exercise", () => {
    expect(cardTargetOf("tok/tok-Qaap.sitelen-pona/choose-translation:s.u01.1")).toEqual({
      tag: "id",
      card: { course: "tok", orthography: "tok-Qaap/sitelen-pona", exercise: "choose-translation:s.u01.1" },
    });
  });

  it("takes nothing else: another page's link, an exercise id alone, other text", () => {
    expect(cardTargetOf("https://example.org/nabu/demo/#/tok/tok-Qaap.sitelen-pona")).toBeUndefined();
    expect(cardTargetOf("https://example.org/nabu/demo/#/tok/tok-Qaap.sitelen-pona/words")).toBeUndefined();
    expect(cardTargetOf("choose-translation:s.u01.1")).toBeUndefined();
    expect(cardTargetOf("hello")).toBeUndefined();
    expect(cardTargetOf("")).toBeUndefined();
  });
});
