/**
 * The word list's entries open to a word's parts (ADR 0146, 0148): each asked of it, shown or not
 * yet, with how many are shown; closed until opened. After the words, the rules and forms met, each
 * by its label, with how many of the skills asked of it are shown.
 */
import type { LearnedWord, RuleEntry, WordPart } from "@nabu/core/learner";
import { glossOfPart, lexemesInOrder, ownFeatureLabel } from "@nabu/core/lesson";
import { surfaceOf } from "@nabu/core/text";
import type { PartId } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import { WordList } from "../src/words/WordList.tsx";
import { loadCourse } from "./course.ts";
import { render } from "./render.tsx";

const es = loadCourse("es");
const ES = "es-Latn/standard";
// A feminine noun whose gender no default gives: its own form is a part (la mano).
const noun = lexemesInOrder(es).find((l) => l.pos === "NOUN" && l.feats?.["Gender"] === "Fem" && (l.parts ?? []).includes(`${l.id}|Gender`) && l.forms?.[ES] !== undefined);
if (noun === undefined) throw new Error("es has a feminine noun whose gender is its own");
const form = noun.forms?.[ES]?.[0];
if (form === undefined) throw new Error("the noun is spelled");
const word: LearnedWord = { lexeme: noun.id, unit: es.units[0]?.id ?? "", form, gloss: noun.gloss?.[es.supportKey], strength: 0.6, due: false, reviews: 3, known: false, skills: [{ skill: "recognize", shown: true }, { skill: "produce", shown: false }] };
const parts: readonly WordPart[] = [
  { kind: "skill", skill: "recognize", status: "shown" },
  { kind: "skill", skill: "produce", status: "not-shown" },
  { kind: "skill", skill: "listen", status: "shown" },
  { kind: "feature", part: `${noun.id}|Gender`, status: "not-asked" },
  { kind: "spelling", orthography: ES, status: "shown" },
];
// A feature value the language labels, and one it labels only with others (an id is all there is).
const labelled = (["feature:Gender=Fem", "feature:Number=Plur", "feature:Tense=Past"] as PartId[]).find((p) => glossOfPart(es, p) !== undefined);
const rules: readonly RuleEntry[] = [
  ...(labelled === undefined ? [] : [{ part: labelled, kind: "feature" as const, label: glossOfPart(es, labelled), skills: [{ skill: "read-off" as const, shown: true }, { skill: "choose" as const, shown: false }], shown: 1 }]),
  { part: "feature:Tense=Pres", kind: "feature", label: undefined, skills: [{ skill: "read-off", shown: false }, { skill: "choose", shown: false }], shown: 0 },
];

const list = (props: { opened?: readonly string[]; rules?: readonly RuleEntry[]; withParts?: boolean } = {}): string =>
  render(<WordList course={es} words={[word]} url={(p) => p} {...(props.withParts === false ? {} : { parts: () => parts })} rules={props.rules ?? []} opened={props.opened ?? []} />);

/** The entry's parts panel, as rendered. */
const panelOf = (html: string): string => {
  const at = html.indexOf("data-word-parts=");
  return at < 0 ? "" : html.slice(at, html.indexOf("</ul>", at));
};

describe("a word's parts", () => {
  it("closed by default: a button that says how many are shown, the parts hidden until opened", () => {
    const html = list();
    const button = /<button[^>]*data-action="word-parts"[^>]*>/u.exec(html)?.[0] ?? "";
    expect(button).toContain('aria-expanded="false"');
    // Asked: every part but the one no card asks yet; shown: three of them.
    expect(html).toContain(`data-parts-shown="3" data-parts-asked="4"`);
    expect(html).toContain("3 of 4");
    expect(panelOf(html)).toMatch(/hidden=""/u);
  });

  it("opened: each part by name, shown or not yet, a form by the language's label in its own language", () => {
    const html = panelOf(list({ opened: [noun.id] }));
    expect(html).not.toMatch(/<div[^>]*hidden=""/u);
    const items = [...html.matchAll(/<li[^>]*data-part="([^"]+)"[^>]*data-part-status="([^"]+)">(.*?)<\/li>/gsu)].map((m) => [m[1], m[2], (m[3] ?? "").replace(/<[^>]+>/gu, "")]);
    const label = ownFeatureLabel(es, `${noun.id}|Gender`);
    expect(label).toBeDefined();
    expect(items).toEqual([
      ["skill:recognize", "shown", "ReadingShown"],
      ["skill:produce", "not-shown", "WritingNot yet"],
      ["skill:listen", "shown", "ListeningShown"],
      [`${noun.id}|Gender`, "not-asked", `Its own form: ${label === undefined ? "" : surfaceOf(label)}Not asked yet`],
      [`spelling:${ES}`, "shown", expect.stringMatching(/^Spelling in .+Shown$/u)],
    ]);
    // The label is the support language's text, through <T>.
    expect(html).toMatch(/Its own form: <span lang="en/u);
  });

  it("no parts, no button: the entry is as it was", () => {
    expect(list({ withParts: false })).not.toContain("data-word-parts");
  });
});

describe("rules and forms met", () => {
  it("after the words, under their heading: each by its label, an id only where the course names nothing", () => {
    const html = list({ rules });
    const section = html.slice(html.indexOf("data-rule-entries"));
    expect(section).toContain("Rules and forms you&#x27;ve met");
    expect(html.indexOf("data-rule-entries")).toBeGreaterThan(html.indexOf("data-word="));
    expect(section).toContain('data-rule="feature:Tense=Pres"');
    expect(section).toMatch(/<code[^>]*dir="ltr"[^>]*>feature:Tense=Pres<\/code>/u);
    expect(section).toContain("0 of 2");
    if (labelled !== undefined) {
      expect(section).toContain(`data-rule="${labelled}"`);
      expect(section).toContain("1 of 2");
    }
  });

  it("none met: no heading, nothing", () => {
    expect(list()).not.toContain("data-rule-entries");
  });
});
