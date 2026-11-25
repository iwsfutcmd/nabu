/**
 * A tapped word's dialog (ADR 0157): the word as tapped, what it means, and each entry's forms: a
 * table of its paradigm's cells (apc) or of the forms the course writes, each named as the language
 * names it, the tapped word's own marked. Server-rendered: the dialog's body (`GlossContent`), as the
 * modal portals it out of the app.
 */
import { allSentences, formCellAt, lexemeForms, lexemesOf, type CourseView } from "@nabu/core/lesson";
import type { TaggedText } from "@nabu/schema";
import type { JSX } from "react";
import { describe, expect, it } from "vitest";
import { GlossContent, useGlosses } from "../src/player/Gloss.tsx";
import { loadCourse } from "./course.ts";
import { render } from "./render.tsx";

/** The first token of the course's sentences that writes the lexeme, and its text. */
const tapOf = (course: CourseView, lexeme: string): { readonly text: TaggedText; readonly token: number } => {
  for (const s of allSentences(course)) {
    const text = s.forms[course.orthography]?.text;
    const token = text?.tokens.findIndex((t) => lexemesOf(t).some((l) => l.lexeme === lexeme)) ?? -1;
    if (text !== undefined && token >= 0) return { text, token };
  }
  throw new Error(`no token writes ${lexeme}`);
};

const Content = ({ course, tap }: { readonly course: CourseView; readonly tap: { readonly text: TaggedText; readonly token: number } }): JSX.Element => (
  <GlossContent course={course} tap={tap} glosses={useGlosses(course, tap)} ruby={false} marks="show" onClose={() => undefined} />
);

describe("a tapped word's dialog (ADR 0157)", () => {
  const apc = loadCourse("apc", "apc-Arab/standard");

  it("lists a verb's paradigm, each form named, the tapped word's own marked", () => {
    const tap = tapOf(apc, "lexeme:shereb");
    const html = render(<Content course={apc} tap={tap} />);
    const rows = lexemeForms(apc, "lexeme:shereb")?.rows ?? [];
    expect(html).toContain('data-gloss-forms="lexeme:shereb"');
    expect(html).toContain('data-forms-source="paradigm"');
    expect([...html.matchAll(/data-form-cell="/gu)]).toHaveLength(rows.length);
    const he = html.slice(html.indexOf('data-form-cell="Aspect=Imp;Gender=Masc;Mood=Ind;Number=Sing;Person=3"'));
    expect(he.slice(0, he.indexOf("</tr>")).replace(/<[^>]+>/gu, "")).toContain("bi-: he (present)");
    // Exactly one row is the tapped word's, and it is the cell its token stands in.
    const current = [...html.matchAll(/data-form-cell="([^"]*)"[^>]*data-current=""/gu)].map((m) => m[1]);
    expect(current).toEqual([formCellAt(apc, tap.text, tap.token, "lexeme:shereb")]);
    expect(html).toContain('aria-current="true"');
    expect(html).toContain("this word");
    // The chrome's direction is the UI's; each form is a text of its own in its script's direction.
    expect(html).toMatch(/^<div[^>]*lang="en"[^>]*dir="ltr"/u);
    const table = html.slice(html.indexOf("data-gloss-forms"));
    expect(table).toMatch(/<span lang="apc-Arab-LB" dir="rtl"/u);
  });

  it("lists no forms for a word the course writes in one form only", () => {
    const hbo = loadCourse("hbo");
    const html = render(<Content course={hbo} tap={tapOf(hbo, "lexeme:gan")} />);
    expect(html).toContain("data-gloss-id");
    expect(html).not.toContain('data-gloss-forms="lexeme:gan"');
  });

  it("names whose forms a table lists where the word writes several lexemes with forms (es échale: echar + le)", () => {
    const es = loadCourse("es");
    const tables = (html: string): readonly string[] => [...html.matchAll(/data-gloss-forms="([^"]*)"/gu)].map((m) => m[1] ?? "");
    // A word writing one lexeme: one table, unnamed.
    const tengo = render(<Content course={es} tap={tapOf(es, "lexeme:tener")} />);
    expect(tables(tengo)).toEqual(["lexeme:tener"]);
    expect(tengo).not.toContain("formsOf");
    // échale: echar's forms, then le's, each headed by its lexeme as written.
    const sentence = allSentences(es).find((s) => s.id === "s.u14.12")?.forms[es.orthography]?.text;
    if (sentence === undefined) throw new Error("no s.u14.12");
    const echale = render(<Content course={es} tap={{ text: sentence, token: sentence.tokens.findIndex((t) => t.surface === "échale") }} />);
    expect(tables(echale)).toEqual(["lexeme:echar", "lexeme:le"]);
    expect([...echale.matchAll(/formsOf/gu)]).toHaveLength(2);
  });

  it("runs a form's several spellings in their own direction, so the rule between them falls between them (hbo לֶךְ, לְכָה)", () => {
    const hbo = loadCourse("hbo");
    const html = render(<Content course={hbo} tap={tapOf(hbo, "lexeme:halakh")} />);
    const ways = [...html.matchAll(/<span[^>]*data-form-ways="(\d+)"[^>]*>/gu)];
    const several = ways.filter((m) => Number(m[1]) > 1);
    expect(several.length).toBeGreaterThan(0);
    // Right to left inside left-to-right chrome: each run takes the script's direction, not the chrome's.
    for (const [tag] of ways) expect(tag).toContain('dir="rtl"');
    expect(html).toMatch(/^<div[^>]*dir="ltr"/u);
  });
});
