/**
 * What a miss is (ADR 0148): the grade's labels in the order of grading, the verdict as a view of
 * them, credit per label, and a sound read off a scheme's pinned readings (`sound: {from: reading}`).
 * The conformance vectors (conformance/grade.json, grade/labels/…) pin the labels across profiles;
 * these tests pin what the vectors cannot: the course's own lexemes, the credit and the event.
 */
import type { BundleLexeme, OrthographyProfile, ReadingScheme } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import { creditOf } from "../src/learner/credit.ts";
import { exerciseRefOf, learnerEventOf } from "../src/learner/events.ts";
import { allSentences, createGrader, gradeExercise, lexemesById, profileOf, seededRng, spellingsIn, type CourseView, type Outcome, type TranslateType } from "../src/lesson/index.ts";
import { baseOf, featureId } from "../src/lesson/lexemes.ts";
import { makeTranslateType } from "../src/lesson/templates.ts";
import { compileAcceptSet, grade, lexiconKey, MISS_LABELS, type GradeOptions } from "../src/match/grade.ts";
import { compileProfile, type CompiledProfile } from "../src/profile/compile.ts";
import { compareByReading } from "../src/project/by-reading.ts";
import { compileReadingProjection } from "../src/project/reading.ts";
import { loadCourse } from "./learner-fixtures.ts";

const es = loadCourse("es");
const esGrader = createGrader(es);

const typed = (course: CourseView, id: string): TranslateType => {
  const s = allSentences(course).find((x) => x.id === id);
  const ex = s === undefined ? undefined : makeTranslateType({ course, rng: seededRng(1), introduced: [] }, s);
  if (ex === undefined) throw new Error(`${id} has no translate-type card`);
  return ex;
};

const answer = (ex: TranslateType, text: string): Outcome => gradeExercise(ex, { tag: "text", text }, esGrader);

describe("the order of grading, on the es course's own lexemes", () => {
  const graded = (accept: string, text: string) => esGrader.grade("es-Latn/standard", accept, text);

  it("asks the slip before the sound: nesa is a slip alone, accepted", () => {
    expect(graded("La mesa es grande.", "La nesa es grande")).toMatchObject({ verdict: "CORRECT_WITH_TYPO", labels: ["slip"] });
  });

  it("never lets the same sound pass as a slip: bolber for volver", () => {
    const g = graded("Quiero volver.", "Quiero bolber");
    expect(g).toMatchObject({ verdict: "WRONG_WORD", labels: ["orthographic"], correspondences: ["es-Latn/standard:b"] });
    expect(g.alignment[1]).toMatchObject({ op: "match", kind: "typo", labels: ["orthographic"] });
  });

  it("decides whose form by lexeme: esta is another lexeme of the course, está another form of estar's", () => {
    const words = spellingsIn(es, "es-Latn/standard");
    const profile = profileOf(es, "es-Latn/standard");
    const lexemes = (w: string): readonly string[] => [...new Set((words.lexemes.get(lexiconKey(profile, w)) ?? []).map((f) => f.lexeme))];
    expect(lexemes("está")).toContain("lexeme:estar");
    expect(lexemes("esta")).not.toContain("lexeme:estar");
    expect(graded("Mami está aquí.", "Mami esta aquí")).toMatchObject({ verdict: "WRONG_WORD", labels: ["lexical", "phonemic"], notes: ["accent-word"] });
    expect(graded("Mami está aquí.", "Mami están aquí")).toMatchObject({ verdict: "WRONG", labels: ["grammatical", "phonemic"] });
  });

  it("lists the labels worst first, each once", () => {
    const g = graded("¿Cómo está usted?", "Como esta usted");
    expect(g.labels).toEqual(MISS_LABELS.filter((l) => g.labels.includes(l)));
    expect(new Set(g.labels).size).toBe(g.labels.length);
  });
});

describe("the verdict is a view of the labels", () => {
  const options: GradeOptions = {};
  const fa = profileOf(loadCourse("fa"), "fa-Arab/standard");
  const set = (profile: CompiledProfile, accept: string) => {
    const s = compileAcceptSet(accept, profile);
    if (!s.ok) throw new Error("accept set");
    return s.value;
  };
  it("no label: the policies' verdict; a slip alone: a typo, accepted", () => {
    expect(grade(set(fa, "کتاب\u200Cها روی میز هستند"), "کتاب ها روی میز هستند", options)).toMatchObject({ verdict: "CORRECT", labels: [] });
    expect(grade(set(fa, "کتاب\u200Cها روی میز هستند"), "کتاب\u200Cها روی میز هستمد", options)).toMatchObject({ verdict: "CORRECT_WITH_TYPO", labels: ["slip"] });
  });
  it("the same sound explains a miss: WRONG_WORD, not the judge's; another sound does not: WRONG", () => {
    expect(grade(set(fa, "صد"), "سد", options)).toMatchObject({ verdict: "WRONG_WORD", labels: ["orthographic"] });
    expect(grade(set(fa, "کتاب"), "کتب", options)).toMatchObject({ verdict: "WRONG", labels: ["phonemic"] });
  });
  it("order is no explanation: WRONG", () => {
    expect(grade(set(fa, "کتاب\u200Cها روی میز هستند"), "روی میز کتاب\u200Cها هستند", options)).toMatchObject({ verdict: "WRONG", labels: ["order"] });
  });
});

describe("credit follows the labels (ADR 0146, 0148)", () => {
  // Mi casa está en Hialeah.
  const ex = typed(es, "s.u03.2");
  const statusOf = (outcome: Outcome) => {
    const credits = creditOf(ex, outcome, es.profiles, lexemesById(es));
    return (part: string, skill?: string) => credits.find((c) => c.part === part && (skill === undefined || c.skill === skill))?.status;
  };
  const tokenOf = (surface: string) => {
    const t = ex.canonical.tokens.find((x) => x.surface === surface);
    if (t === undefined) throw new Error(surface);
    return t;
  };
  const casa = baseOf(tokenOf("casa"))?.lexeme as string;
  const estar = baseOf(tokenOf("está"))?.lexeme as string;

  it("a slip: right", () => {
    const o = answer(ex, "Mi casa está en Hialeh");
    expect(o.verdict).toBe("CORRECT_WITH_TYPO");
    expect(statusOf(o)(casa)).toBe("right");
  });

  it("orthographic alone: the lexeme right by the card's skill, its spelling missed (write-script)", () => {
    const o = answer(ex, "Mi caza está en Hialeah");
    expect(o.labels).toEqual(["orthographic"]);
    const status = statusOf(o);
    expect(status(casa, "produce")).toBe("right");
    expect(status(casa, "write-script")).toBe("wrong");
    expect(status(estar)).toBe("right");
    // What no word carries follows the answer: only a spelling was missed.
    for (const part of ex.parts.filter((p) => p.startsWith("feature:"))) expect(status(part), part).toBe("right");
  });

  it("grammatical without lexical: the lexeme right, the form's values wrong", () => {
    const o = answer(ex, "Mi casa están en Hialeah");
    expect(o.labels).toEqual(["grammatical", "phonemic"]);
    const status = statusOf(o);
    expect(status(estar)).toBe("right");
    const chosen = Object.entries(baseOf(tokenOf("está"))?.feats ?? {}).flatMap(([name, said]) => said.split(",").map((value) => featureId(name, value)));
    const asked = chosen.filter((v) => ex.parts.includes(v));
    expect(asked.length).toBeGreaterThan(0);
    for (const v of asked) expect(status(v), v).toBe("wrong");
    expect(status(casa)).toBe("right");
  });

  it("anything else: wrong", () => {
    const o = answer(ex, "Mi casa esta en Hialeah");
    expect(o.labels).toEqual(["lexical", "phonemic"]);
    expect(statusOf(o)(estar)).toBe("wrong");
  });

  it("a right word shows its spelling leftover, where the bundle lists one", () => {
    // The compiler lists casa's (kasa, caza: es-Latn/standard states c and s, z for /s/).
    expect(lexemesById(es).get(casa)?.leftovers?.spelling).toEqual(["es-Latn/standard"]);
    const right = creditOf(ex, answer(ex, "Mi casa está en Hialeah"), es.profiles, lexemesById(es));
    expect(right).toContainEqual({ part: casa, skill: "write-script", status: "right" });
    // A word with no leftover gets no write-script credit: without leftovers, none at all.
    const scripted = new Set(right.filter((c) => c.skill === "write-script").map((c) => c.part));
    for (const part of scripted) expect(lexemesById(es).get(part)?.leftovers?.spelling, part).toContain("es-Latn/standard");
    const none: ReadonlyMap<string, BundleLexeme> = new Map(
      [...lexemesById(es)].map(([id, l]): [string, BundleLexeme] => {
        const { leftovers: _leftovers, ...rest } = l;
        return [id, rest];
      }),
    );
    expect(creditOf(ex, answer(ex, "Mi casa está en Hialeah"), es.profiles, none).some((c) => c.skill === "write-script")).toBe(false);
  });

  it("the answer event carries the labels and correspondences", () => {
    const graded = answer(ex, "Mi caza está en Hialeah");
    const meta = { id: "e1", clientTime: "2026-11-21T10:00:00.000Z", localDate: "2026-11-21", tz: "UTC", device: "d", session: "s", bundle: "b" };
    const e = learnerEventOf(
      { type: "answer_submitted", exercise: exerciseRefOf(ex), response: { tag: "text", text: "Mi caza está en Hialeah" }, outcome: { kind: graded.verdict, notes: graded.notes }, ex, graded },
      es,
      meta,
      { mode: "lesson", seed: 1, planner: "test" },
    );
    expect(e?.type === "answer_submitted" && e.outcome).toMatchObject({ kind: "WRONG_WORD", labels: ["orthographic"], correspondences: ["es-Latn/standard:s"] });
    expect(e?.type === "answer_submitted" && e.outcome.parts).toContainEqual({ part: casa, skill: "write-script", status: "wrong" });
  });
});

describe("a sound read off a scheme's pinned readings (sound: from reading)", () => {
  // A made-up orthography and scheme: k written k or c (fixed), a written or not (fixed), i written i or y (free).
  const scheme = compileReadingProjection({
    id: "toy",
    names: { en: { scheme: "toy" } },
    language: "und",
    of: "und-Latn/toy",
    correspondences: [
      { says: "k", written: ["k", "c"], kind: "fixed" },
      { says: "a", written: ["a", ""], kind: "fixed" },
      { says: "t", written: ["t"], kind: "fixed" },
      { says: "i", written: ["i", "y"], kind: "free", note: "spelling-variant" },
    ],
  } as unknown as ReadingScheme);
  const raw = {
    id: "und-Latn/toy",
    lang: "und-Latn",
    segmentation: { content: "whitespace", runtime: "grapheme" },
    normalize: ["nfc"],
    // The scheme the profile names must be a real one to compile; the grader is handed the toy one.
    sound: { from: "reading", scheme: "schluessel" },
  } as unknown as OrthographyProfile;
  const compiled = compileProfile(raw, { numberingSystems: {}, tables: {}, keyboards: {} });
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.error));
  const profile = { ...compiled.value, unitKind: "token" as const, units: (t: string) => t.split(" ").filter((u) => u !== "") };
  const accept = compileAcceptSet("kati", profile);
  if (!accept.ok) throw new Error("accept set");
  const readings = new Map([[lexiconKey(profile, "kati"), ["kati"]]]);
  const options: GradeOptions = { readings, scheme };

  it("compares by the scheme: the same reading spelled otherwise", () => {
    expect(compareByReading(scheme, ["kati"], "kati", "cati")).toMatchObject({ same: true, free: false, differs: [{ expected: "k", typed: "c", rule: "k", kind: "fixed" }] });
    expect(compareByReading(scheme, ["kati"], "kati", "kty")).toMatchObject({ same: true, free: false });
    expect(compareByReading(scheme, ["kati"], "kati", "katy")).toMatchObject({ same: true, free: true });
    expect(compareByReading(scheme, ["kati"], "kati", "kata")).toMatchObject({ same: false });
  });

  it("grades by it: orthographic for a fixed place, a variant for free ones, phonemic for another sound", () => {
    expect(grade(accept.value, "cati", options)).toMatchObject({ verdict: "WRONG_WORD", labels: ["orthographic"], correspondences: ["und-Latn/toy:k"] });
    expect(grade(accept.value, "kti", options)).toMatchObject({ labels: ["orthographic"], correspondences: ["und-Latn/toy:a"] });
    expect(grade(accept.value, "katy", options)).toMatchObject({ verdict: "CORRECT_VARIANT", labels: [], notes: ["spelling-variant"] });
    expect(grade(accept.value, "kata", options)).toMatchObject({ verdict: "WRONG", labels: ["phonemic"] });
  });

  it("asks no sound of a word with no pinned reading", () => {
    expect(grade(accept.value, "cati", { scheme })).toMatchObject({ verdict: "WRONG", labels: ["lexical"] });
  });
});
