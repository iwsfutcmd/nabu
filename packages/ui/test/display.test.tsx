/**
 * How the language being learned is shown (P12): the profile's default for vowel marks, the
 * learner's choice for a course, and marks on new words only.
 */
import { createGrader, sampleExercise, start, step, type CourseView } from "@nabu/core/lesson";
import type { OrthographyProfile, TaggedText } from "@nabu/schema";
import type { JSX } from "react";
import { describe, expect, it } from "vitest";
import { WordStatusProvider } from "../src/marks.tsx";
import { useDisplay, type DisplayChoice } from "../src/player/Display.tsx";
import { LessonPlayer } from "../src/player/LessonPlayer.tsx";
import { defaultMarks } from "../src/player/shared.ts";
import { T } from "../src/T.tsx";
import { loadCourse } from "./course.ts";
import { render } from "./render.tsx";

const profileOf = (course: CourseView): OrthographyProfile | undefined => course.profiles.get(course.orthography)?.source;

const Shown = ({ profile, chosen }: { readonly profile: OrthographyProfile | undefined; readonly chosen?: DisplayChoice }): JSX.Element => {
  const display = useDisplay(profile, "wordbank", undefined, chosen, undefined);
  return <output data-marks={display.marks} data-mode={display.mode} />;
};

describe("vowel marks before the learner chooses (P12)", () => {
  it("follow the profile: Persian marks new words only, Lebanese Arabic and Biblical Hebrew every word", () => {
    expect(defaultMarks(profileOf(loadCourse("fa", "fa-Arab/standard")))).toBe("new");
    expect(defaultMarks(profileOf(loadCourse("apc", "apc-Arab/standard")))).toBe("show");
    expect(defaultMarks(profileOf(loadCourse("hbo", "hbo-Hebr/tiberian")))).toBe("show");
    expect(defaultMarks(undefined)).toBe("show");
  });

  it("give way to the learner's choice for the course, and vertical text comes back where allowed", () => {
    const fa = profileOf(loadCourse("fa", "fa-Arab/standard"));
    expect(render(<Shown profile={fa} />)).toContain('data-marks="new"');
    expect(render(<Shown profile={fa} chosen={{ marks: "hide" }} />)).toContain('data-marks="hide"');
    const yue = profileOf(loadCourse("yue", "yue-Hant-HK/standard"));
    expect(render(<Shown profile={yue} chosen={{ vertical: true }} />)).toContain('data-mode="vertical-rl"');
    // Persian has no vertical text: a stray choice changes nothing.
    expect(render(<Shown profile={fa} chosen={{ vertical: true }} />)).toContain('data-mode="horizontal-tb"');
  });
});

describe("vowel marks on new words only (P12)", () => {
  const course = loadCourse("fa", "fa-Arab/standard");
  const sentence = course.units[0]?.sentences.find((s) => (s.forms["fa-Arab/standard"]?.text.tokens.filter((t) => t.kind === "word").length ?? 0) >= 2);
  const text = sentence?.forms["fa-Arab/standard"]?.text as TaggedText;
  const MARK = /[ً-ْٰ]/u;
  const words = (html: string): readonly string[] => [...html.matchAll(/data-kind="word" data-index="\d+">([^<]+)</gu)].map((m) => m[1] as string);

  it("keeps the marks of the words being learned and takes them off the known ones", () => {
    expect(sentence).toBeDefined();
    const all = words(render(<T text={text} marks="new" />));
    expect(all.every((w) => MARK.test(w)), "no status: every word is new").toBe(true);
    const [first] = sentence?.kcs ?? [];
    const html = render(
      <WordStatusProvider course={course} known={new Set([first as string])}>
        <T text={text} marks="new" />
      </WordStatusProvider>,
    );
    const shown = words(html);
    expect(shown.filter((w) => MARK.test(w)).length).toBe(all.length - 1);
  });

  it("is what a Persian lesson shows before the learner chooses", () => {
    const ex = sampleExercise(course, "choose-translation", 7);
    if (ex?.template !== "choose-translation") throw new Error("fa has a choose-translation card");
    const [presenting] = start("lesson", [ex]);
    const [answering] = step(presenting, { tag: "ready" });
    const known = new Set(course.units.flatMap((u) => u.kcs.map((k) => k.id as string)));
    const play = (extra: { display?: DisplayChoice; known?: ReadonlySet<string> }): string =>
      render(<LessonPlayer course={course} lessonId="lesson" exercises={[ex]} grader={createGrader(course)} imageUrl={(p) => p} language="Persian" initialState={answering} {...extra} />);
    const prompt = (html: string): string => html.slice(html.indexOf('data-ink-container="prompt"'), html.indexOf("data-options"));
    // Every word known: no marks on the prompt; the learner's "all words" brings them back.
    expect(MARK.test(prompt(play({ known })))).toBe(false);
    expect(MARK.test(prompt(play({ known, display: { marks: "show" } })))).toBe(true);
    // The display button is in the header.
    expect(play({ known })).toContain('data-action="display"');
  });

  it("has no display button where there is nothing to choose (Uzbek)", () => {
    const uz = loadCourse("uz", "uz-Latn/standard");
    const ex = sampleExercise(uz, "choose-translation", 7);
    if (ex === undefined) throw new Error("uz has a choose-translation card");
    const [presenting] = start("lesson", [ex]);
    const html = render(
      <LessonPlayer course={uz} lessonId="lesson" exercises={[ex]} grader={createGrader(uz)} imageUrl={(p) => p} language="Uzbek" initialState={step(presenting, { tag: "ready" })[0]} />,
    );
    expect(html).not.toContain('data-action="display"');
  });
});
