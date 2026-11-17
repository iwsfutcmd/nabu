/**
 * Readings on new words only (ADR 0131): a reading layer that fades (`fade: by-facet`) shows over the
 * words whose reading the learner has yet to show on a reading card, and leaves the others bare, in
 * a lesson or story that shows readings so. Cantonese and Chaghatay start that way.
 */
import type { Exercise, Outcome, Response } from "@nabu/core/lesson";
import type { OrthographyProfile, SchemeId, TaggedText, Token } from "@nabu/schema";
import { readFileSync } from "node:fs";
import type { JSX } from "react";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { DEMO_ORTHOGRAPHIES } from "../src/demo/profiles.ts";
import { FadeReadings, WordStatusProvider } from "../src/marks.tsx";
import { useDisplay } from "../src/player/Display.tsx";
import { Feedback } from "../src/player/Feedback.tsx";
import { defaultReadingWords, defaultRuby, ReadingsControl, useReadings } from "../src/player/Readings.tsx";
import { T } from "../src/T.tsx";
import { loadCourse } from "./course.ts";
import { render } from "./render.tsx";

const JYUTPING = "jyutping" as SchemeId;
const ORTH = "yue-Hant-HK/standard";
const yue = DEMO_ORTHOGRAPHIES.get(ORTH);
const lzh = DEMO_ORTHOGRAPHIES.get("lzh-Hant/standard");
const chg = parse(readFileSync(new URL("../../../profiles/chg-Arab.standard.yaml", import.meta.url), "utf8")) as OrthographyProfile;
const course = loadCourse("yue");

const word = (surface: string, jyutping: string, sense: string): TaggedText["tokens"][number] => {
  const syllables = jyutping.split(" ");
  return { surface, kind: "word", sense: sense as NonNullable<Token["sense"]>, readings: { [JYUTPING]: jyutping }, ruby: { [JYUTPING]: [...surface].map((base, i) => ({ base, text: syllables[i] ?? "" })) } };
};
const sentence = (orthography: string): TaggedText => ({
  lang: "yue-Hant-HK" as TaggedText["lang"],
  orthography: orthography as TaggedText["orthography"],
  tokens: [word("我", "ngo5", "ngo"), word("嘅", "ge3", "ge"), word("書", "syu1", "syu"), { surface: "？", kind: "punct" }],
});
const text = sentence(ORTH);
/** The learner has read 書 right on a reading card. */
const shown: ReadonlySet<string> = new Set(["sense:syu"]);
const rts = (html: string): readonly string[] => [...html.matchAll(/<rt[^>]*>([^<]*)<\/rt>/gu)].map((m) => m[1] as string);
const inSession = (fade: boolean, node: JSX.Element): JSX.Element => (
  <WordStatusProvider course={course} known={undefined} readings={shown}>
    <FadeReadings on={fade}>{node}</FadeReadings>
  </WordStatusProvider>
);

describe("readings before the learner chooses (ADR 0131)", () => {
  it("show over new words only in Cantonese and Chaghatay, every word where a layer does not fade", () => {
    expect(defaultReadingWords(yue)).toBe("new");
    expect(defaultReadingWords(chg)).toBe("new");
    expect(defaultReadingWords(lzh)).toBe("all");
    // On for new words is on: the layer shows until the learner turns it off.
    expect(defaultRuby(yue)).toBe("jyutping");
    expect(defaultRuby(chg)).toBe("schluessel");
    expect(defaultRuby(lzh)).toBe(false);
  });

  const Control = ({ chosen }: { readonly chosen?: SchemeId | false }): JSX.Element => {
    const readings = useReadings(yue, chosen);
    const display = useDisplay(yue, "wordbank", undefined, undefined, undefined);
    return <ReadingsControl readings={readings} words={{ shown: display.readings, choose: display.setReadings }} />;
  };

  it("are a choice of three for a layer that fades: All words, New words, Off, under its name", () => {
    const html = render(<Control />);
    expect([...html.matchAll(/data-reading="([^"]+)"/gu)].map((m) => m[1])).toEqual(["all", "new", "off"]);
    for (const label of ["Jyutping", "All words", "New words", "Off"]) expect(html).toContain(label);
    expect(html).toContain('data-readings-shown="new"');
    expect(html).not.toContain('role="switch"');
    expect(render(<Control chosen={false} />)).toContain('data-readings-shown="off"');
  });
});

describe("readings on new words only (ADR 0131)", () => {
  it("leave off the readings the learner has shown, in a session that fades them", () => {
    expect(rts(render(inSession(true, <T text={text} ruby={JYUTPING} />)))).toEqual(["ngo5", "ge3"]);
  });

  it("keep every reading over all words, outside a session, in another orthography, and in a tapped word's gloss", () => {
    expect(rts(render(inSession(false, <T text={text} ruby={JYUTPING} />)))).toEqual(["ngo5", "ge3", "syu1"]);
    expect(rts(render(<T text={text} ruby={JYUTPING} />))).toEqual(["ngo5", "ge3", "syu1"]);
    // The words shown are the course orthography's: the same word in another one keeps its reading.
    expect(rts(render(inSession(true, <T text={sentence("yue-Latn/jyutping")} ruby={JYUTPING} />)))).toEqual(["ngo5", "ge3", "syu1"]);
    // The gloss panel turns fading off again inside a session (where a faded reading is looked up).
    expect(rts(render(inSession(true, <FadeReadings on={false}>{<T text={text} ruby={JYUTPING} />}</FadeReadings>)))).toEqual(["ngo5", "ge3", "syu1"]);
  });

  it("keep the reading of a word marked as wrong: the word feedback corrects shows it, as the rest of the sentence does", () => {
    expect(rts(render(inSession(true, <T text={text} ruby={JYUTPING} highlight={[2]} />)))).toEqual(["ngo5", "ge3", "syu1"]);
    // Only the marked word: another shown reading still fades.
    const shownToo = new Set(["sense:syu", "sense:ngo"]);
    const html = render(
      <WordStatusProvider course={course} known={undefined} readings={shownToo}>
        <FadeReadings on>
          <T text={text} ruby={JYUTPING} highlight={[2]} />
        </FadeReadings>
      </WordStatusProvider>,
    );
    expect(rts(html)).toEqual(["ge3", "syu1"]);
    // In feedback: 書 slipped (a typo), so the solution marks it, with its reading.
    const ex = { template: "translate-type", orthography: ORTH } as unknown as Exercise;
    const outcome: Outcome = {
      verdict: "CORRECT_WITH_TYPO",
      notes: [],
      solution: text,
      closestIsSolution: true,
      alignment: [
        { op: "match", expected: "我", actual: "我", kind: "exact" },
        { op: "match", expected: "嘅", actual: "嘅", kind: "exact" },
        { op: "substitute", expected: "書", actual: "樹" },
      ],
    };
    const feedback = render(inSession(true, <Feedback ex={ex} outcome={outcome} response={{ tag: "text", text: "我嘅樹？" }} course={course} ruby={JYUTPING} marks="show" />));
    const solution = feedback.slice(feedback.indexOf("data-solution"), feedback.indexOf("data-answer-diff"));
    expect(solution).toContain('data-highlight="true"');
    expect(rts(solution)).toEqual(["ngo5", "ge3", "syu1"]);
  });

  it("keep the reading of a tapped word: tapping is how a faded reading is looked up", () => {
    const tapped = (pressed: number | undefined, ruby: SchemeId | false = JYUTPING): readonly string[] =>
      rts(render(inSession(true, <T text={text} ruby={ruby} onTokenPress={() => undefined} pressed={pressed} />)));
    expect(tapped(undefined)).toEqual(["ngo5", "ge3"]);
    expect(tapped(2)).toEqual(["ngo5", "ge3", "syu1"]);
    // Another word tapped: 書 fades again.
    expect(tapped(0)).toEqual(["ngo5", "ge3"]);
    // A card that shows no reading (one asking for it) shows none for a tap either.
    expect(tapped(2, false)).toEqual([]);
  });

  it("show a right typed answer again only where a word of it still has its reading", () => {
    const ex = { template: "translate-type", orthography: ORTH } as unknown as Exercise;
    const typed: Response = { tag: "text", text: "我嘅書？" };
    const right = (solution: TaggedText): Outcome => ({ verdict: "CORRECT", notes: [], solution, closestIsSolution: true });
    const feedback = (solution: TaggedText): string => render(inSession(true, <Feedback ex={ex} outcome={right(solution)} response={typed} course={course} ruby={JYUTPING} marks="show" />));
    const html = feedback(text);
    expect(html).toContain("data-solution");
    expect(rts(html)).toEqual(["ngo5", "ge3"]);
    // Every reading shown: the sentence again would say nothing the field does not.
    expect(feedback({ ...text, tokens: [word("書", "syu1", "syu"), { surface: "？", kind: "punct" }] })).not.toContain("data-solution");
  });
});
