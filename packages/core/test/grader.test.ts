/**
 * The grader's lexicons (the review's R5): built once per course, not per session. Every session
 * makes a grader, and its first typed answer used to wait half a second (es, at 4×) while the
 * new grader rebuilt the course's word lexicon.
 */
import { describe, expect, it } from "vitest";
import { spellingsIn } from "../src/lesson/course.ts";
import { allSentences, createGrader, prepareGrading } from "../src/lesson/index.ts";
import { restrictMedia } from "../src/offline/index.ts";
import { surfaceOf } from "../src/text/index.ts";
import { loadCourse } from "./learner-fixtures.ts";

describe("a course's lexicons", () => {
  const orthography = "apc-Latn/arabizi";

  it("are built once and shared by every grader, and by a copy of the course with less media", () => {
    const course = loadCourse("apc", orthography);
    const before = spellingsIn(course, orthography);
    expect(spellingsIn(course, orthography)).toBe(before);
    const sentence = allSentences(course).find((s) => s.forms[orthography]?.reverse !== undefined);
    const form = sentence?.forms[orthography];
    if (form?.reverse === undefined) throw new Error("no sentence");
    for (const grader of [createGrader(course), createGrader(course)]) expect(grader.grade(orthography, form.reverse, surfaceOf(form.text)).verdict).toBe("CORRECT");
    expect(spellingsIn(course, orthography)).toBe(before);
    // Offline, a session's course leaves out the clips the device lacks: same units, same words.
    const offline = restrictMedia(course, (path) => !path.startsWith("audio/"));
    expect(offline).not.toBe(course);
    expect(spellingsIn(offline, orthography)).toBe(before);
    // Without its pictures only the lexicon's entries are copied (pictures are the lexemes'): the
    // units are shared, and so are the spellings, which no picture changes.
    const withoutPictures = restrictMedia(course, () => false);
    expect(withoutPictures.lexicon).not.toBe(course.lexicon);
    expect(withoutPictures.units).toBe(course.units);
    const bare = spellingsIn(withoutPictures, orthography);
    expect(bare).toBe(before);
    expect([...bare.words].sort()).toEqual([...before.words].sort());
    // Another profile for the orthography (another assembly of the course) gets its own.
    expect(spellingsIn({ ...course, profiles: new Map(course.profiles) }, orthography)).toBe(before);
    expect(spellingsIn({ ...course, profiles: loadCourse("apc", orthography).profiles }, orthography)).not.toBe(before);
  });

  it("are what prepareGrading builds, for the course's orthography and its support language", () => {
    const course = loadCourse("apc", orthography);
    prepareGrading(course);
    const words = spellingsIn(course, orthography);
    expect(words.words.size).toBeGreaterThan(100);
    expect(words.inflected.size).toBeGreaterThan(100);
    expect(spellingsIn(course, course.support)).toBe(spellingsIn(course, course.support));
  });
});
