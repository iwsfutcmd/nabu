/**
 * yue in Jyutping (ADR 0126): the course's second orthography, written from the characters'
 * pinned readings. Lessons build in it; cards that drill the characters do not; its clips' word
 * timings move to its own words.
 */
import { describe, expect, it } from "vitest";
import { createGrader } from "../src/lesson/index.ts";
import { loadCourse } from "./learner-fixtures.ts";
import { plannedCards, walkPath } from "./planned.ts";

const LATN = "yue-Latn/jyutping";
const hant = loadCourse("yue");
const latn = loadCourse("yue", LATN);

describe("yue in Jyutping", () => {
  it("plans every lesson in Jyutping, and none of the cards that drill characters", () => {
    const made = plannedCards(walkPath(latn)).map(({ ex }) => ex);
    expect(made.length).toBeGreaterThan(100);
    expect(made.every((ex) => !("orthography" in ex) || ex.orthography !== "yue-Hant-HK/standard")).toBe(true);
    const templates = new Set(made.map((e) => e.template));
    for (const t of ["char-read", "reading-disambiguation", "transcribe", "tone-identify"] as const) expect(templates.has(t)).toBe(false);
    expect(templates.has("translate-type.l1-l2")).toBe(true);
  });

  it("grades typed Jyutping: syllables joined or spaced, a tone never a typo", () => {
    const grader = createGrader(latn);
    expect(grader.grade(LATN, "ngo5 hai6 hok6 saang1", "Ngo5 hai6 hok6saang1").verdict).toBe("CORRECT");
    const tone = grader.grade(LATN, "ngo5 hai6 hok6 saang1", "ngo5 hai6 hok6 saang2");
    expect(tone.verdict).toBe("WRONG_WORD");
    expect(tone.notes).toContain("reading-tone");
  });

  it("moves each clip's word timings to the same word in Jyutping", () => {
    let moved = 0;
    for (const unit of latn.units) {
      for (const s of unit.sentences) {
        const from = hant.audio[s.id]?.normal;
        const to = latn.audio[s.id]?.normal;
        if (from?.timings === undefined || to === undefined) continue;
        const words = (o: string) => (s.forms[o]?.text.tokens ?? []).flatMap((t, i) => (t.kind === "word" || t.kind === "number" ? [i] : []));
        const hantWords = words("yue-Hant-HK/standard");
        const latnWords = words(LATN);
        expect(to.orthography).toBe(LATN);
        // The k-th timed word of the characters is the k-th word of the Jyutping, at the same time.
        expect(to.timings?.map((t) => [t.token, t.startMs])).toEqual(from.timings.map((t) => [latnWords[hantWords.indexOf(t.token)], t.startMs]));
        expect(to.timings?.every((t) => latnWords.includes(t.token))).toBe(true);
        moved += 1;
      }
    }
    expect(moved).toBeGreaterThan(100);
  });

  it("keeps the characters' timings as they are in their own orthography", () => {
    const timed = Object.values(hant.audio).filter((a) => a.normal.timings !== undefined);
    expect(timed.length).toBeGreaterThan(100);
    expect(timed.every((a) => a.normal.orthography === "yue-Hant-HK/standard")).toBe(true);
  });
});
