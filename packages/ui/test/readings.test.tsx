import type { LearnedWord } from "@nabu/core/learner";
import { createGrader, sampleExercise, seededRng, start, step, type CourseView } from "@nabu/core/lesson";
import { allStories, startStory, storyScript } from "@nabu/core/story";
import type { SchemeId, TaggedText } from "@nabu/schema";
import type { JSX } from "react";
import { describe, expect, it } from "vitest";
import { SentenceList } from "../src/corrections/SentenceList.tsx";
import { DEMO_ORTHOGRAPHIES } from "../src/demo/profiles.ts";
import { LessonPlayer } from "../src/player/LessonPlayer.tsx";
import { defaultRuby, ReadingsControl, rubyLayersOf, useReadings } from "../src/player/Readings.tsx";
import type { WritingMode } from "../src/player/shared.ts";
import { StoryReader } from "../src/story/StoryReader.tsx";
import { WordList } from "../src/words/WordList.tsx";
import { loadCourse } from "./course.ts";
import { render } from "./render.tsx";

const yue = DEMO_ORTHOGRAPHIES.get("yue-Hant-HK/standard");
const lzh = DEMO_ORTHOGRAPHIES.get("lzh-Hant/standard");

const Control = ({ orthography, chosen }: { readonly orthography: string; readonly chosen?: SchemeId | false }): JSX.Element => {
  const readings = useReadings(DEMO_ORTHOGRAPHIES.get(orthography), chosen);
  return (
    <>
      <ReadingsControl readings={readings} />
      <output data-shown={readings.shown === false ? "off" : readings.shown} />
    </>
  );
};

describe("reading layers (ADR 0071)", () => {
  it("lists every ruby layer of a profile, in order", () => {
    expect(rubyLayersOf(yue).map((l) => l.scheme)).toEqual(["jyutping"]);
    expect(rubyLayersOf(lzh).map((l) => l.scheme)).toEqual(["pinyin", "jyutping", "baxter"]);
  });

  it("starts from the learner's choice, else the profile's default", () => {
    // yue says nothing: its one layer shows in horizontal text, as before.
    expect(defaultRuby(yue)).toBe("jyutping");
    expect(defaultRuby(yue, false)).toBe(false);
    // Classical Chinese marks every layer off: characters first.
    expect(defaultRuby(lzh)).toBe(false);
    expect(defaultRuby(lzh, "baxter" as SchemeId)).toBe("baxter");
    // A choice another orthography made is no layer here.
    expect(defaultRuby(lzh, "furigana" as SchemeId)).toBe(false);
  });

  it("is a switch for one layer and a choice for several", () => {
    const one = render(<Control orthography="yue-Hant-HK/standard" />);
    expect(one).toContain('data-toggle="readings"');
    expect(one).toContain('role="switch"');
    expect(one).toContain('data-shown="jyutping"');
    const several = render(<Control orthography="lzh-Hant/standard" chosen={"jyutping" as SchemeId} />);
    expect(several).not.toContain('role="switch"');
    expect([...several.matchAll(/data-reading="([^"]+)"/g)].map((m) => m[1])).toEqual(["off", "pinyin", "jyutping", "baxter"]);
    for (const label of ["Readings", "Off", "Pinyin", "Jyutping", "Middle Chinese (Baxter)"]) expect(several).toContain(label);
    expect(several).toContain('data-shown="jyutping"');
  });
});

describe("the word list and the sentence list show the layer the learner chose", () => {
  const LZH = "lzh-Hant/standard";
  const ruby = { pinyin: [{ base: "說", text: "yuè" }], jyutping: [{ base: "說", text: "jyut6" }], baxter: [{ base: "說", text: "ywet" }] };
  const form = { lang: "lzh-Hant", orthography: LZH, tokens: [{ surface: "說", kind: "word", sense: "說.yue", ruby }] } as unknown as TaggedText;
  const units = [{ id: "u1", nodes: [], kcs: [], sentences: [{ id: "s1", forms: { [LZH]: { text: form } }, translations: {} }] }];
  const course = { id: "lzh", orthography: LZH, supportKey: "en", audio: {}, units, profiles: new Map([[LZH, { source: lzh }]]) } as unknown as CourseView;
  const word = { kc: "說.yue", unit: "u1", form, gloss: undefined, strength: 0.5, due: false, reviews: 1, known: false, skills: [] } as unknown as LearnedWord;
  const shown = (html: string): string[] => [...html.matchAll(/<rt[^>]*>([^<]*)<\/rt>/g)].map((m) => m[1] as string);
  const words = (reading?: SchemeId): string[] => shown(render(<WordList course={course} words={[word]} url={(p) => p} {...(reading === undefined ? {} : { reading })} />));
  const sentences = (reading?: SchemeId): string[] =>
    shown(render(<SentenceList course={course} corrections={new Map()} onUnit={() => undefined} onCorrect={() => undefined} {...(reading === undefined ? {} : { reading })} />));

  it("as the player does: the learner's choice, else the profile's default", () => {
    expect(words("baxter" as SchemeId)).toEqual(["ywet"]);
    expect(words("jyutping" as SchemeId)).toEqual(["jyut6"]);
    expect(sentences("baxter" as SchemeId)).toEqual(["ywet"]);
    // Classical Chinese marks every layer off: none until the learner picks one.
    expect(words()).toEqual([]);
    expect(sentences()).toEqual([]);
  });
});

describe("vertical text keeps the reading layer (ADR 0118)", () => {
  const rt = (html: string): string[] => [...html.matchAll(/<rt[^>]*>([^<]*)<\/rt>/gu)].map((m) => m[1] as string);
  /** A card whose prompt is the target sentence, as it opens. */
  const card = (course: CourseView, writingMode: WritingMode, reading?: SchemeId | false): string => {
    const ex = sampleExercise(course, "choose-translation", 7);
    if (ex === undefined) throw new Error(`${course.id} has no choose-translation card`);
    const [answering] = step(start("lesson", [ex])[0], { tag: "ready" });
    return render(
      <LessonPlayer
        course={course}
        lessonId="lesson"
        exercises={[ex]}
        grader={createGrader(course)}
        imageUrl={(p) => p}
        language="Chinese"
        initialState={answering}
        writingMode={writingMode}
        {...(reading === undefined ? {} : { reading })}
      />,
    );
  };

  it("shows the layer in a vertical prompt as in a horizontal one", () => {
    const yue = loadCourse("yue", "yue-Hant-HK/standard");
    const vertical = card(yue, "vertical-rl");
    expect(vertical).toContain('data-writing-mode="vertical-rl"');
    expect(rt(vertical).length).toBeGreaterThan(0);
    expect(rt(vertical)).toEqual(rt(card(yue, "horizontal-tb")));
    // The learner's own choice holds there too: none, or (Classical Chinese) the layer they picked.
    expect(rt(card(yue, "vertical-rl", false))).toEqual([]);
    const lzh = loadCourse("lzh", "lzh-Hant/standard");
    expect(rt(card(lzh, "vertical-rl"))).toEqual([]);
    const pinyin = card(lzh, "vertical-rl", "pinyin" as SchemeId);
    expect(rt(pinyin).length).toBeGreaterThan(0);
    expect(pinyin).toContain('lang="zh-Latn-pinyin"');
  });

  it("shows it in a vertical story's lines", () => {
    const yue = loadCourse("yue", "yue-Hant-HK/standard");
    const [story] = allStories(yue);
    if (story === undefined) throw new Error("yue has a story");
    const script = storyScript(yue, story, seededRng(7));
    const read = (writingMode: WritingMode): string =>
      render(<StoryReader course={yue} script={script} grader={createGrader(yue)} imageUrl={(p) => p} language="Cantonese" initialState={startStory(script)[0]} writingMode={writingMode} sound={false} />);
    const vertical = read("vertical-rl");
    expect(vertical).toContain('data-writing-mode="vertical-rl"');
    expect(rt(vertical).length).toBeGreaterThan(0);
    expect(rt(vertical)).toEqual(rt(read("horizontal-tb")));
  });
});
