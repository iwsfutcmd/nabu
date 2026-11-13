/**
 * What lessons are, checked on what plan() plans (C5 in the 2026-11 review). A learner walks every
 * fixture course's path (test/planned.ts), and each session's cards are graded, compared and counted.
 * These tests once ran on a lesson builder of the tests' own, which production never ran: they
 * passed while lessons never planned a pronunciation card (C1).
 */
import type { TaggedText } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import { creditOf } from "../src/learner/credit.ts";
import { parseCardKey, plan, type SessionPlan } from "../src/learner/index.ts";
import { lessonCandidates } from "../src/lesson/candidates.ts";
import {
  cardGallery,
  createGrader,
  gradeExercise,
  isCorrect,
  lessonNodes,
  SCRIPT_TEMPLATES,
  seededRng,
  start,
  step,
  TEMPLATES,
  type CourseView,
  type Exercise,
  type TemplateId,
} from "../src/lesson/index.ts";
import { gradeVowels, withoutMarks } from "../src/match/pronounce.ts";
import { surfaceOf } from "../src/text/index.ts";
import { rightAnswer, wrongAnswer } from "./answers.ts";
import { loadCourse } from "./learner-fixtures.ts";
import { plannedCards, walkPath, type PlannedSession } from "./planned.ts";

/** Every fixture course, in each orthography it is learned in. */
const COURSES: readonly (readonly [string, string | undefined])[] = [
  ["fa", undefined],
  ["yue", undefined],
  ["uz", "uz-Latn/standard"],
  ["uz", "uz-Cyrl/standard"],
  ["apc", "apc-Arab/standard"],
  ["apc", "apc-Latn/arabizi"],
  ["lzh", undefined],
  ["es", undefined],
  ["hbo", undefined],
  ["tok", "tok-Latn/standard"],
  ["tok", "tok-Qaap/sitelen-pona"],
  ["grc", undefined],
];

interface Walked {
  readonly course: CourseView;
  readonly sessions: readonly PlannedSession[];
}

const walks = new Map<string, Walked>();

/** A course and the sessions of its walk, planned once for this file. */
const walked = (id: string, orthography?: string): Walked => {
  const key = `${id} ${orthography ?? ""}`;
  const found = walks.get(key);
  if (found !== undefined) return found;
  const course = loadCourse(id, orthography);
  const made = { course, sessions: walkPath(course) };
  walks.set(key, made);
  return made;
};

const lessons = (sessions: readonly PlannedSession[]): readonly PlannedSession[] => sessions.filter((s) => s.request.mode === "lesson");
const templatesOf = (plans: readonly SessionPlan[]): readonly TemplateId[] => plans.flatMap((p) => p.exercises.map((e) => e.template));

describe.each(COURSES)("what plan() plans: %s %s", (id, orthography) => {
  it("every lesson, the same every time, with more than one card and none twice; reviews and mistakes too", () => {
    const { course, sessions } = walked(id, orthography);
    expect(lessons(sessions).map((s) => s.label)).toEqual(lessonNodes(course).map((n) => `lesson ${n.node.id}`));
    expect(sessions.some((s) => s.request.mode === "review" && s.plan.exercises.length > 0)).toBe(true);
    expect(sessions.some((s) => s.request.mode === "mistakes" && s.plan.exercises.length > 0)).toBe(true);
    for (const s of sessions) {
      const ids = s.plan.exercises.map((e) => e.id);
      if (s.request.mode === "lesson") expect(ids.length, s.label).toBeGreaterThan(1);
      expect(new Set(ids).size, s.label).toBe(ids.length);
      expect(plan(course, s.state, s.request, s.options), s.label).toEqual(s.plan);
    }
  });

  it("accepts each card's own solution and rejects a wrong answer", () => {
    const { course, sessions } = walked(id, orthography);
    const grader = createGrader(course);
    for (const { session, ex } of plannedCards(sessions)) {
      const right = gradeExercise(ex, rightAnswer(ex), grader);
      expect(isCorrect(right.verdict), `${session.label} ${ex.id}: ${right.verdict} ${JSON.stringify(right.notes)}`).toBe(true);
      const wrong = wrongAnswer(ex);
      if (wrong === undefined || (wrong.tag === "tiles" && wrong.order.length === 0)) continue;
      const outcome = gradeExercise(ex, wrong, grader);
      // Tiles in another order may still be right (a free word order): they only have to grade.
      if (wrong.tag !== "tiles") expect(isCorrect(outcome.verdict), `${session.label} ${ex.id} accepted a wrong answer`).toBe(false);
    }
  });

  it("never offers two options that look the same", () => {
    for (const { session, ex } of plannedCards(walked(id, orthography).sessions)) {
      const options = ex.template === "select-image" ? ex.options.map((o) => o.text) : "options" in ex ? ex.options : ex.template === "match-pairs" ? ex.left : [];
      const surfaces = options.map((o) => surfaceOf(o));
      expect(new Set(surfaces).size, `${session.label} ${ex.id}`).toBe(surfaces.length);
    }
  });

  it("never shows two words or two meanings alike in matching pairs, whatever the seed", () => {
    const { course, sessions } = walked(id, orthography);
    const key = (t: TaggedText): string => surfaceOf(t).normalize("NFC").toLocaleLowerCase("und").replace(/[\p{P}\s]+/gu, " ").trim();
    const distinct = (texts: readonly TaggedText[]): boolean => new Set(texts.map(key)).size === texts.length;
    const pairs: { readonly label: string; readonly ex: Exercise }[] = plannedCards(sessions).flatMap(({ session, ex }) => (ex.template === "match-pairs" ? [{ label: session.label, ex }] : []));
    expect(pairs.length).toBeGreaterThan(0);
    // And the pairs each lesson plans among with other seeds: its words as that learner had met them.
    const onlyPairs = new Set((Object.keys(TEMPLATES) as TemplateId[]).filter((t) => t !== "match-pairs"));
    const nodes = new Map(lessonNodes(course).map((n) => [n.node.id, n] as const));
    for (const s of lessons(sessions)) {
      const at = s.request.mode === "lesson" ? nodes.get(s.request.node) : undefined;
      if (at === undefined) throw new Error(s.label);
      const seen = new Set(Object.keys(s.state.cards).map((k) => parseCardKey(k).kc));
      for (const seed of [1, 11]) {
        for (const ex of lessonCandidates({ course, rng: seededRng(seed), introduced: at.node.introduces }, at, seen, onlyPairs)) pairs.push({ label: `${s.label} (seed ${String(seed)})`, ex });
      }
    }
    for (const { label, ex } of pairs) {
      if (ex.template !== "match-pairs") continue;
      expect(distinct(ex.left), `${label} ${ex.id}`).toBe(true);
      expect(distinct(ex.right), `${label} ${ex.id}`).toBe(true);
    }
  });
});

describe("template coverage", () => {
  it("every kind of card is planned in some fixture course, but stories', script tracks' and those the app must support", () => {
    const planned = new Set(COURSES.flatMap(([id, orthography]) => plannedCards(walked(id, orthography).sessions).map(({ ex }) => ex.template)));
    // Story questions come from stories (test/story.test.ts) and a script track's cards from its
    // nodes (test/script.test.ts); scored speaking and tones only where the app can do them (below).
    const elsewhere = new Set<TemplateId>(["speak", "listen-speak", "tone-identify", ...SCRIPT_TEMPLATES]);
    expect([...planned].sort()).toEqual((Object.keys(TEMPLATES) as TemplateId[]).filter((t) => !t.startsWith("story-") && !elsewhere.has(t)).sort());
  });
});

describe("speech the app can do (§10.4, ADR 0093)", () => {
  const speech = { scored: true, tones: true };
  // The committed yue clips include no one-syllable sentence of the copula lesson: this view gives
  // 係！ (s.8) a clip, as a reviewed recording would.
  const bundled = loadCourse("yue");
  const yue: CourseView = { ...bundled, audio: { ...bundled.audio, "s.8": { normal: { path: "audio/clips/s8.mp3", durationMs: 420, synthetic: false, license: "CC0-1.0" } } } };
  /** Each lesson of yue's walk planned again in this view, with and without the speech support. */
  const plans = (() => {
    let made: { readonly scored: readonly SessionPlan[]; readonly plain: readonly SessionPlan[] } | undefined;
    return () => {
      const walk = lessons(walked("yue").sessions);
      made ??= { scored: walk.map((s) => plan(yue, s.state, s.request, { ...s.options, speech })), plain: walk.map((s) => plan(yue, s.state, s.request, s.options)) };
      return made;
    };
  })();

  it("scored speaking takes tier 0's place, only when the app can score it, and never makes a lesson longer", () => {
    const { scored, plain } = plans();
    expect(templatesOf(scored)).toContain("speak");
    expect(templatesOf(scored)).toContain("listen-speak");
    expect(templatesOf(scored)).not.toContain("speak.tier-0");
    expect(templatesOf(plain)).toContain("speak.tier-0");
    for (const t of ["speak", "listen-speak", "tone-identify"] as const) expect(templatesOf(plain)).not.toContain(t);
    expect(scored.map((p) => p.exercises.length)).toEqual(plain.map((p) => p.exercises.length));
    // Persian readings carry no tones.
    const fa = walked("fa");
    expect(templatesOf(lessons(fa.sessions).map((s) => plan(fa.course, s.state, s.request, { ...s.options, speech })))).not.toContain("tone-identify");
  });

  it("a tone card names one of Cantonese's six tones, and takes the right one", () => {
    const tone = cardGallery(yue, 7).find((c) => c.template === "tone-identify")?.exercise;
    if (tone?.template !== "tone-identify") throw new Error("yue makes no tone card");
    expect(tone.tones).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(gradeExercise(tone, { tag: "choice", index: tone.answer }, createGrader(yue)).verdict).toBe("CORRECT");
  });

  // A finding of C5: the Phase 3 builder gave every lesson a tone card where it could make one; the
  // planner has them among its candidates (ten yue sentences, and s.8 here) but never picks one, as
  // a tone card is hard (p̂ about 0.5) and nothing reserves it a place, as pronunciation cards are.
  // This fails until lessons plan them; then make it a plain test.
  it.fails("tonal courses get tone cards when the app can do them", () => {
    expect(templatesOf(plans().scored)).toContain("tone-identify");
  });

  it("can leave speaking out", () => {
    const { course, sessions } = walked("fa");
    for (const s of sessions) {
      const p = plan(course, s.state, s.request, { ...s.options, exclude: new Set(["speak.tier-0"]) });
      expect(p.exercises.some((e) => e.template === "speak.tier-0"), s.label).toBe(false);
    }
  });
});

describe("a word's pronunciation in its sentence (ADR 0054, 0095, 0098)", () => {
  const planned = (id: string, orthography: string | undefined, template: TemplateId): readonly Exercise[] =>
    plannedCards(walked(id, orthography).sessions).flatMap(({ ex }) => (ex.template === template ? [ex] : []));

  it("lessons plan a word's vowel marks where the script leaves them out (fa, apc-Arab, hbo): the sentence without marks, the word to choose with them", () => {
    expect([TEMPLATES.vocalize.facet, TEMPLATES.vocalize.modality.input]).toEqual(["read-script", "choice"]);
    for (const [id, orthography] of [["fa", undefined], ["apc", "apc-Arab/standard"], ["hbo", undefined]] as const) {
      const { course } = walked(id, orthography);
      const marks = course.profiles.get(course.orthography)?.marks;
      if (marks === undefined) throw new Error(`${id}: no marks`);
      const grader = createGrader(course);
      const cards = planned(id, orthography, "vocalize");
      expect(cards.length, id).toBeGreaterThan(0);
      for (const ex of cards) {
        if (ex.template !== "vocalize") continue;
        // The sentence is the prompt, without marks; the word asked about is one of its tokens.
        expect(ex.prompt.tokens.every((t) => withoutMarks(marks, t.surface) === t.surface.normalize("NFC")), ex.id).toBe(true);
        expect(ex.prompt.tokens[ex.word]?.surface, ex.id).toBe(withoutMarks(marks, surfaceOf(ex.vocalized)));
        // Three or four options: the vocalized word, and others with its letters that are wrong.
        const options = ex.options.map(surfaceOf);
        expect(options.length, ex.id).toBeGreaterThanOrEqual(3);
        expect(new Set(options).size, ex.id).toBe(options.length);
        expect(options[ex.answer], ex.id).toBe(surfaceOf(ex.vocalized));
        for (const [i, o] of options.entries()) {
          expect(withoutMarks(marks, o), ex.id).toBe(withoutMarks(marks, surfaceOf(ex.vocalized)));
          if (i !== ex.answer) expect(gradeVowels(marks, surfaceOf(ex.vocalized), o).verdict, `${ex.id}: ${o} is no wrong option`).toBe("WRONG");
        }
        const right = gradeExercise(ex, { tag: "choice", index: ex.answer }, grader);
        expect(right.verdict, ex.id).toBe("CORRECT");
        const wrongPick = gradeExercise(ex, { tag: "choice", index: (ex.answer + 1) % options.length }, grader);
        expect([wrongPick.verdict, wrongPick.solution], ex.id).toEqual(["WRONG", ex.vocalized]);
        // Credit goes to the word asked about; the rest of the sentence is given.
        const credit = creditOf(ex, right, course.profiles);
        expect(credit.filter((c) => c.status === "right").length, ex.id).toBeGreaterThan(0);
        expect(credit.filter((c) => c.status === "given").length, ex.id).toBe(new Set(ex.kcs).size - credit.filter((c) => c.status === "right").length);
      }
      // The player starts with nothing chosen.
      const [presenting] = start("lesson", [cards[0] as Exercise]);
      const [answering] = step(presenting, { tag: "ready" });
      expect(answering.tag === "answering" ? answering.draft : undefined).toEqual({ tag: "choice", index: null });
    }
  });

  it("and Cantonese a word's Jyutping to type: the sentence without ruby, every tone counting", () => {
    const { course } = walked("yue");
    const grader = createGrader(course);
    const cards = planned("yue", undefined, "transcribe");
    expect(cards.length).toBeGreaterThan(0);
    for (const ex of cards) {
      if (ex.template !== "transcribe") continue;
      expect(ex.prompt.tokens.every((t) => t.ruby === undefined && t.readings === undefined), ex.id).toBe(true);
      expect(ex.prompt.tokens[ex.word]?.kind, ex.id).toBe("word");
      expect([ex.reading.lang, ex.orthography], ex.id).toEqual(["yue-Latn-HK-jyutping", "yue-Latn/jyutping"]);
      const reading = surfaceOf(ex.reading);
      expect(gradeExercise(ex, { tag: "text", text: reading.replace(/ /gu, "") }, grader).verdict, ex.id).toBe("CORRECT");
      const tone = gradeExercise(ex, { tag: "text", text: reading.replace(/([1-6])$/u, (d) => String((Number(d) % 6) + 1)) }, grader);
      expect([tone.verdict, tone.notes], ex.id).toEqual(["WRONG", ["reading-tone"]]);
    }
  });

  it("vowels written out: Lebanese in Arabizi is a vocalization too, and only the word's own spelling", () => {
    const { course } = walked("apc", "apc-Arab/standard");
    const ex = planned("apc", "apc-Arab/standard", "vocalize").find((e) => e.template === "vocalize" && e.spelled !== undefined);
    if (ex?.template !== "vocalize" || ex.spelled === undefined) throw new Error("apc: no vocalize card with an Arabizi spelling");
    expect(ex.spelled.orthography).toBe("apc-Latn/arabizi");
    const grader = createGrader(course);
    const spelled = surfaceOf(ex.spelled);
    expect(gradeExercise(ex, { tag: "text", text: spelled }, grader)).toMatchObject({ verdict: "CORRECT", solution: ex.spelled });
    expect(gradeExercise(ex, { tag: "text", text: spelled.toLocaleUpperCase(ex.spelled.lang) }, grader).verdict).toBe("CORRECT");
    // A slip in Arabizi may be a vowel: wrong, never a typo.
    const slip = spelled.replace(/[aeiou]/u, (v) => (v === "a" ? "i" : "a"));
    expect(gradeExercise(ex, { tag: "text", text: slip }, grader).verdict).toBe("WRONG");
    // fa names no orthography that spells its vowels.
    expect(planned("fa", undefined, "vocalize").some((e) => e.template === "vocalize" && e.spelled !== undefined)).toBe(false);
  });

  it("alphabets write their vowels: no such card for uz, and accents that are spelling (es, grc) are not asked for", () => {
    // The gallery makes a kind wherever any lesson can: none means no lesson can plan one.
    const cardOf = (id: string, orthography: string | undefined, template: TemplateId): Exercise | undefined => cardGallery(loadCourse(id, orthography), 3).find((c) => c.template === template)?.exercise;
    expect(cardOf("uz", "uz-Latn/standard", "vocalize")).toBeUndefined();
    expect(cardOf("es", undefined, "vocalize")).toBeUndefined();
    expect(cardOf("grc", undefined, "vocalize")).toBeUndefined();
    expect(cardOf("hbo", undefined, "vocalize")?.template).toBe("vocalize");
    expect(cardOf("uz", "uz-Latn/standard", "transcribe")).toBeUndefined();
    expect(cardOf("fa", undefined, "transcribe")).toBeUndefined();
    expect(cardOf("yue", undefined, "vocalize")).toBeUndefined();
    // And the walks plan them only where the script leaves the vowels out, or has a reading to type.
    for (const [id, orthography] of COURSES) {
      const asked = new Set(plannedCards(walked(id, orthography).sessions).map(({ ex }) => ex.template));
      expect(asked.has("vocalize"), `${id} ${orthography ?? ""}`).toBe(["fa", "apc-Arab/standard", "hbo"].includes(orthography ?? id));
      expect(asked.has("transcribe"), `${id} ${orthography ?? ""}`).toBe(id === "yue");
    }
  });
});

describe("Toki Pona in sitelen pona (ADR 0086)", () => {
  it("asks a logograph's word among words in Latin letters, and never splits a cartouche", () => {
    const { course, sessions } = walked("tok", "tok-Qaap/sitelen-pona");
    const reads = plannedCards(sessions).flatMap(({ ex }) => (ex.template === "char-read" ? [ex] : []));
    expect(reads.length).toBeGreaterThan(0);
    for (const ex of reads) {
      if (ex.template !== "char-read") continue;
      expect(ex.options.every((o) => o.orthography === "tok-Latn/standard"), ex.id).toBe(true);
      // In its sentence (ADR 0098): the word asked about is one whole token, a cartouche included.
      expect(ex.word === undefined ? undefined : ex.prompt.tokens[ex.word]?.kind, ex.id).toBe("word");
      expect(ex.prompt.tokens.every((t) => t.ruby === undefined), ex.id).toBe(true);
    }
    for (const s of course.units.flatMap((u) => u.sentences)) {
      for (const t of s.forms[course.orthography]?.text.tokens ?? []) {
        if (t.kind === "word" && t.surface.startsWith("\u{F1990}")) expect(t.surface.endsWith("\u{F1991}")).toBe(true);
      }
    }
  });
});
