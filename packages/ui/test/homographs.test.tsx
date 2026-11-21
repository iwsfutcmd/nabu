/**
 * Homograph marks (ADR 0140): inside a lesson or story, a word whose spelling the course reads more
 * than one way is marked, and a tap on it names the other readings with what they mean.
 */
import { allSentences, homographsOf, type CourseView } from "@nabu/core/lesson";
import type { SchemeId, TaggedText } from "@nabu/schema";
import type { JSX } from "react";
import { describe, expect, it } from "vitest";
import { HomographsProvider } from "../src/marks.tsx";
import { GlossPanel, useOtherReadings } from "../src/player/Gloss.tsx";
import { T } from "../src/T.tsx";
import { loadCourse } from "./course.ts";
import { render } from "./render.tsx";

const SCHLUESSEL = "schluessel" as SchemeId;
const chg = loadCourse("chg");

/** A sentence of the course with a word whose spelling it reads two ways (اوزوم üzüm / özüm), and that word's index. */
const withHomograph = (course: CourseView, scheme: SchemeId): { readonly text: TaggedText; readonly at: number } => {
  const spellings = homographsOf(course, scheme);
  for (const s of allSentences(course)) {
    const text = s.forms[course.orthography]?.text;
    const at = text?.tokens.findIndex((t) => t.kind === "lexical" && spellings.has(t.surface.normalize("NFC"))) ?? -1;
    if (text !== undefined && at >= 0) return { text, at };
  }
  throw new Error("no homograph in the course");
};

const Panel = ({ course, text, at }: { readonly course: CourseView; readonly text: TaggedText; readonly at: number }): JSX.Element => {
  const also = useOtherReadings(course, { text, token: at }, SCHLUESSEL);
  return <GlossPanel open glosses={[]} ruby={SCHLUESSEL} marks="show" also={also} />;
};

describe("homograph marks (ADR 0140)", () => {
  const { text, at } = withHomograph(chg, SCHLUESSEL);

  it("mark the words whose spelling the course reads more than one way, inside a provider only", () => {
    const marked = render(
      <HomographsProvider course={chg} scheme={SCHLUESSEL}>
        <T text={text} />
      </HomographsProvider>,
    );
    expect(marked).toContain(`data-index="${at}" data-homograph="true"`);
    expect(render(<T text={text} />)).not.toContain("data-homograph");
    // Readings off and no layer to read them in: nothing to mark.
    expect(
      render(
        <HomographsProvider course={chg} scheme={false}>
          <T text={text} />
        </HomographsProvider>,
      ),
    ).not.toContain("data-homograph");
  });

  it("name the other readings in a tapped word's gloss, each with what it means", () => {
    const html = render(<Panel course={chg} text={text} at={at} />);
    expect(html).toContain("data-gloss-also");
    expect(html).toContain("Also read");
    const own = text.tokens[at]?.readings?.[SCHLUESSEL];
    const others = (homographsOf(chg, SCHLUESSEL).get(text.tokens[at]?.surface.normalize("NFC") ?? "") ?? []).filter((r) => r.reading !== own);
    expect(others.length).toBeGreaterThan(0);
    for (const r of others) expect(html).toContain(r.reading);
    expect(html).not.toContain(`>${own}<`);
  });
});
