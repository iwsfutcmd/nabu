import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { BundleManifest, SchemeId, TaggedText } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import {
  allSentences,
  assembleCourse,
  buildLesson,
  cardGallery,
  createGrader,
  gradeExercise,
  isCorrect,
  lessonNodes,
  LISTENING,
  MEDIA_ROLES,
  placedBy,
  progressOf,
  responseOf,
  runTest,
  seededRng,
  start,
  step,
  TEMPLATES,
  type CourseView,
  type Effect,
  type Exercise,
  type PlayerEvent,
  type PlayerState,
  type Response,
  type TemplateId,
} from "../src/lesson/index.ts";
import { creditOf } from "../src/learner/credit.ts";
import { pathNodes } from "../src/learner/path.ts";
import { placementTest } from "../src/learner/placement.ts";
import { makeMatchPairs, makeReadingDisambiguation, makeTapL1L2, makeTapL2L1, makeTranslateType, SENTENCE_TEMPLATES } from "../src/lesson/templates.ts";
import { closestAnswer } from "../src/lesson/diff.ts";
import { surfaceOf } from "../src/text/index.ts";

const ROOT = resolve(import.meta.dirname, "../../..");
const BUNDLES = join(ROOT, "apps/web/public/bundles");
const numberingSystems = JSON.parse(readFileSync(join(ROOT, "packages/i18n/src/generated/numbering-systems.json"), "utf8")) as Record<string, string>;

const loadCourse = (id: string, orthography?: string): CourseView => {
  const manifest = JSON.parse(readFileSync(join(BUNDLES, id, "manifest.json"), "utf8")) as BundleManifest;
  const files = new Map<string, unknown>(
    manifest.files.filter((f) => !MEDIA_ROLES.has(f.role)).map((f) => [f.path, JSON.parse(readFileSync(join(BUNDLES, id, f.path), "utf8")) as unknown]),
  );
  const course = assembleCourse({ manifest, files, numberingSystems }, orthography);
  if (!course.ok) throw new Error(JSON.stringify(course.error));
  return course.value;
};

const VARIANTS: readonly (readonly [string, string | undefined])[] = [
  ["fa", undefined],
  ["yue", undefined],
  ["uz", "uz-Latn/standard"],
  ["uz", "uz-Cyrl/standard"],
  ["apc", "apc-Arab/standard"],
  ["apc", "apc-Latn/arabizi"],
];

/** The response a learner who knows the answer gives. */
const rightAnswer = (ex: Exercise): Response => {
  switch (ex.template) {
    case "select-image":
    case "choose-translation":
    case "gap-fill":
    case "char-read":
    case "reading-disambiguation":
    case "listen-select":
    case "minimal-pair":
    case "story-choose":
    case "story-complete":
    case "tone-identify":
    case "letter-read":
    case "word-read":
      return { tag: "choice", index: ex.answer };
    case "match-pairs":
    case "letter-pairs":
      return { tag: "pairs", mistakes: 0 };
    case "translate-tap.l2-l1":
    case "translate-tap.l1-l2":
    case "listen-tap":
    case "story-arrange":
    case "word-write":
      return { tag: "tiles", order: ex.solution };
    case "translate-type.l1-l2":
    case "listen-type":
      return { tag: "text", text: surfaceOf(ex.canonical) };
    case "complete-translation":
      return { tag: "text", text: surfaceOf(ex.blank) };
    case "vocalize":
      return { tag: "text", text: surfaceOf(ex.vocalized) };
    case "transcribe":
      return { tag: "text", text: surfaceOf(ex.reading) };
    case "speak.tier-0":
      return { tag: "self-rating", rating: "good" };
    case "speak":
    case "listen-speak":
      return { tag: "speech", result: { silent: false } };
  }
};

const wrongAnswer = (ex: Exercise): Response | undefined => {
  switch (ex.template) {
    case "select-image":
    case "choose-translation":
    case "gap-fill":
    case "char-read":
    case "reading-disambiguation":
    case "listen-select":
    case "minimal-pair":
    case "story-choose":
    case "story-complete":
    case "letter-read":
    case "word-read":
      return { tag: "choice", index: (ex.answer + 1) % ex.options.length };
    case "tone-identify":
      return { tag: "choice", index: (ex.answer + 1) % ex.tones.length };
    case "speak":
    case "listen-speak":
      return { tag: "speech", result: { silent: true } };
    case "translate-tap.l2-l1":
    case "translate-tap.l1-l2":
    case "listen-tap":
    case "story-arrange":
    case "word-write":
      return { tag: "tiles", order: [...ex.solution].reverse().length > 1 ? [...ex.solution].reverse() : ex.tiles.map((_, i) => i).filter((i) => !ex.solution.includes(i)) };
    case "translate-type.l1-l2":
    case "complete-translation":
    case "listen-type":
      return { tag: "text", text: "qqqq zzzz" };
    case "vocalize":
      return { tag: "text", text: surfaceOf(ex.prompt) };
    case "transcribe":
      return { tag: "text", text: "qqqq1" };
    case "speak.tier-0":
      return { tag: "self-rating", rating: "again" };
    case "match-pairs":
    case "letter-pairs":
      return undefined;
  }
};

describe.each(VARIANTS)("tiles: %s %s", (id, orthography) => {
  const course = loadCourse(id, orthography);
  const grader = createGrader(course);
  // Every sentence, not a lesson's sample: tiles in their order are right in both directions,
  // also where the words are joined by a hyphen or a maqaf alone (מִן־הַגָּן).
  it("grades every sentence's tiles, put in order, as right", () => {
    const ctx = { course, rng: seededRng(3), introduced: [] };
    for (const s of course.units.flatMap((u) => u.sentences)) {
      for (const ex of [makeTapL1L2(ctx, s), makeTapL2L1(ctx, s)]) {
        if (ex === undefined) continue;
        const right = gradeExercise(ex, { tag: "tiles", order: ex.solution }, grader);
        expect(isCorrect(right.verdict), `${ex.id}: ${right.verdict} ${JSON.stringify(right.notes)}`).toBe(true);
      }
    }
  }, 60_000);
});

describe.each(VARIANTS)("lessons: %s %s", (id, orthography) => {
  const course = loadCourse(id, orthography);
  const grader = createGrader(course);
  const nodes = lessonNodes(course);

  it("has lesson nodes", () => expect(nodes.length).toBeGreaterThan(2));

  for (const { node } of nodes) {
    describe(node.id, () => {
      const lesson = buildLesson(course, node.id, { seed: 7 });

      it("is deterministic and non-empty, with unique exercise ids", () => {
        expect(lesson.length).toBeGreaterThan(1);
        expect(JSON.stringify(buildLesson(course, node.id, { seed: 7 }))).toBe(JSON.stringify(lesson));
        expect(new Set(lesson.map((e) => e.id)).size).toBe(lesson.length);
      });

      it("accepts each exercise's own solution and rejects a wrong answer", () => {
        for (const ex of lesson) {
          const right = gradeExercise(ex, rightAnswer(ex), grader);
          expect(isCorrect(right.verdict), `${ex.id}: ${right.verdict} ${JSON.stringify(right.notes)}`).toBe(true);
          const wrong = wrongAnswer(ex);
          if (wrong !== undefined && !(wrong.tag === "tiles" && wrong.order.length === 0)) {
            const outcome = gradeExercise(ex, wrong, grader);
            if (wrong.tag !== "tiles") expect(isCorrect(outcome.verdict), `${ex.id} accepted a wrong answer`).toBe(false);
          }
        }
      });

      it("never offers two options that look the same", () => {
        for (const ex of lesson) {
          const options =
            ex.template === "select-image" ? ex.options.map((o) => o.text) : "options" in ex ? ex.options : ex.template === "match-pairs" ? ex.left : [];
          const surfaces = options.map((o) => surfaceOf(o));
          expect(new Set(surfaces).size, ex.id).toBe(surfaces.length);
        }
      });
    });
  }
});

describe("template coverage", () => {
  it("every Phase 3 template appears in some fixture lesson", () => {
    const seen = new Set<TemplateId>();
    for (const [id, orthography] of VARIANTS) {
      const course = loadCourse(id, orthography);
      for (const { node } of lessonNodes(course)) for (const ex of buildLesson(course, node.id, { seed: 7 })) seen.add(ex.template);
    }
    // Listening templates need audio and come from the planner (test/listening.test.ts); story
    // questions come from stories (test/story.test.ts); scored speaking and tones are opt-in (below).
    // Script templates come from script nodes alone (test/script.test.ts).
    const optIn = new Set<TemplateId>(["speak", "listen-speak", "tone-identify", "letter-read", "letter-pairs", "word-read", "word-write"]);
    expect([...seen].sort()).toEqual((Object.keys(TEMPLATES) as TemplateId[]).filter((t) => !LISTENING.has(t) && !t.startsWith("story-") && !optIn.has(t)).sort());
  });

  it("scored speaking takes tier 0's slot, and tonal courses get tone exercises, only when the app can do them", () => {
    const speech = { scored: true, tones: true };
    // The committed yue clips are held back by the round-trip check (eSpeak Cantonese), so this view
    // gives the one-syllable sentence 係！ a clip, as a reviewed recording would.
    const bundled = loadCourse("yue");
    const yue: CourseView = { ...bundled, audio: { ...bundled.audio, "s.8": { normal: { path: "audio/clips/s8.mp3", durationMs: 420, synthetic: false, license: "CC0-1.0" } } } };
    const fa = loadCourse("fa");
    const templates = (course: typeof yue, options: Parameters<typeof buildLesson>[2]) => lessonNodes(course).flatMap(({ node }) => buildLesson(course, node.id, options).map((e) => e.template));
    const scored = templates(yue, { seed: 7, speech });
    expect(scored).toContain("speak");
    expect(scored).toContain("tone-identify");
    expect(scored).not.toContain("speak.tier-0");
    expect(templates(fa, { seed: 7, speech })).not.toContain("tone-identify"); // Persian readings carry no tones
    // The same lessons otherwise: only the speaking slot changed.
    const plain = templates(yue, { seed: 7 });
    expect(scored.filter((t) => t !== "tone-identify").map((t) => (t === "speak" ? "speak.tier-0" : t))).toEqual(plain);
    const tone = lessonNodes(yue).flatMap(({ node }) => buildLesson(yue, node.id, { seed: 7, speech })).find((e) => e.template === "tone-identify");
    if (tone?.template !== "tone-identify") throw new Error("no tone exercise");
    expect(tone.tones).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(gradeExercise(tone, { tag: "choice", index: tone.answer }, createGrader(yue)).verdict).toBe("CORRECT");
  });

  it("can leave speaking out", () => {
    const course = loadCourse("fa");
    for (const { node } of lessonNodes(course)) {
      expect(buildLesson(course, node.id, { seed: 1, exclude: new Set(["speak.tier-0"]) }).some((e) => e.template === "speak.tier-0")).toBe(false);
    }
  });
});

describe("matching pairs", () => {
  const key = (t: TaggedText): string => surfaceOf(t).normalize("NFC").toLocaleLowerCase("und").replace(/[\p{P}\s]+/gu, " ").trim();
  const distinct = (texts: readonly TaggedText[]): boolean => new Set(texts.map(key)).size === texts.length;

  /** Builds every lesson of every course three times: about a second alone, far more on a busy CI runner. */
  const EVERY_LESSON_TIMEOUT_MS = 30_000;

  it("never shows two words or two meanings alike, in any course's lessons", () => {
    for (const [id, orthography] of [...VARIANTS, ["lzh", undefined] as const]) {
      const course = loadCourse(id, orthography);
      for (const { node } of lessonNodes(course)) {
        for (const seed of [1, 7, 11]) {
          for (const ex of buildLesson(course, node.id, { seed })) {
            if (ex.template !== "match-pairs") continue;
            expect(distinct(ex.left), `${id} ${node.id} ${ex.id}`).toBe(true);
            expect(distinct(ex.right), `${id} ${node.id} ${ex.id}`).toBe(true);
          }
        }
      }
    }
  }, EVERY_LESSON_TIMEOUT_MS);

  it("keeps synonyms glossed alike apart: Classical Chinese 汝 and 爾 are both \"you\"", () => {
    const course = loadCourse("lzh");
    const kcs = course.units.flatMap((u) => u.kcs);
    const you = kcs.filter((k) => k.id === "sense:汝" || k.id === "sense:爾");
    expect(you.map((k) => k.gloss?.["en"] === undefined ? "" : surfaceOf(k.gloss["en"]))).toEqual(["you", "you"]);
    const others = kcs.filter((k) => ["sense:吾", "sense:其", "sense:誰", "sense:何"].includes(k.id));
    for (let seed = 1; seed <= 40; seed++) {
      const ex = makeMatchPairs({ course, rng: seededRng(seed), introduced: [] }, [...you, ...others]);
      if (ex === undefined) throw new Error("no pairs");
      expect(ex.kcs.filter((k) => k === "sense:汝" || k === "sense:爾").length).toBeLessThanOrEqual(1);
      expect(distinct(ex.right)).toBe(true);
    }
  });
});

describe("the card gallery (debug mode)", () => {
  it("has one card of every kind a course can make, story questions aside", () => {
    for (const [id, orthography] of [["yue", undefined], ["fa", undefined], ["uz", "uz-Latn/standard"], ["apc", "apc-Arab/standard"]] as const) {
      const course = loadCourse(id, orthography);
      const gallery = cardGallery(course, 3);
      expect(gallery.some((c) => c.template.startsWith("story-"))).toBe(false);
      expect(new Set(gallery.map((c) => c.template)).size).toBe(gallery.length);
      for (const card of gallery) if (card.exercise !== undefined) expect(card.exercise.template).toBe(card.template);
      const made = new Set(gallery.flatMap((c) => (c.exercise === undefined ? [] : [c.template])));
      for (const t of ["match-pairs", "choose-translation", "translate-tap.l2-l1", "translate-tap.l1-l2", "translate-type.l1-l2", "gap-fill", "speak.tier-0"]) expect(made.has(t as never), `${id} ${t}`).toBe(true);
      if (id === "yue") for (const t of ["char-read", "speak", "listen-speak"]) expect(made.has(t as never), `yue ${t}`).toBe(true);
    }
  });
});

describe("writing in a word's pronunciation, in its sentence (ADR 0054, 0095)", () => {
  const HARAKAT = /[\u064B-\u0652\u0670]/u;
  const cardOf = (id: string, orthography: string | undefined, template: TemplateId): Exercise | undefined =>
    cardGallery(loadCourse(id, orthography), 3).find((c) => c.template === template)?.exercise;

  it("vowel marks: a sentence without marks, one word to mark from its letters (fa, apc-Arab)", () => {
    for (const [id, orthography] of [["fa", undefined], ["apc", "apc-Arab/standard"]] as const) {
      const course = loadCourse(id, orthography);
      const ex = cardOf(id, orthography, "vocalize");
      if (ex?.template !== "vocalize") throw new Error(`${id}: no vocalize card`);
      // The sentence is the prompt; the word asked about is one of its tokens.
      expect(ex.prompt.tokens.filter((t) => t.kind === "word").length).toBeGreaterThan(0);
      expect(HARAKAT.test(surfaceOf(ex.prompt))).toBe(false);
      expect(ex.prompt.tokens[ex.word]?.surface).toBe(surfaceOf(ex.letters));
      expect(HARAKAT.test(surfaceOf(ex.vocalized))).toBe(true);
      expect(TEMPLATES.vocalize.facet).toBe("read-script");
      const grader = createGrader(course);
      expect(gradeExercise(ex, { tag: "text", text: surfaceOf(ex.vocalized) }, grader).verdict).toBe("CORRECT");
      const bare = gradeExercise(ex, { tag: "text", text: surfaceOf(ex.letters) }, grader);
      expect([bare.verdict, bare.notes]).toEqual(["WRONG", ["vocalize-marks"]]);
      expect(bare.solution).toBe(ex.vocalized);
      // Credit goes to the word asked about; the rest of the sentence is given.
      const credit = creditOf(ex, gradeExercise(ex, { tag: "text", text: surfaceOf(ex.vocalized) }, grader), course.profiles);
      expect(credit.filter((c) => c.status === "right").length).toBeGreaterThan(0);
      expect(credit.filter((c) => c.status === "given").length).toBe(new Set(ex.kcs).size - credit.filter((c) => c.status === "right").length);
      // The player's field starts from the word's letters.
      const [presenting] = start("lesson", [ex]);
      const [answering] = step(presenting, { tag: "ready" });
      expect(answering.tag === "answering" ? answering.draft : undefined).toEqual({ tag: "text", text: surfaceOf(ex.letters) });
    }
  });

  it("vowels written out: Lebanese in Arabizi is a vocalization too, and only the word's own spelling", () => {
    const course = loadCourse("apc", "apc-Arab/standard");
    const ex = cardOf("apc", "apc-Arab/standard", "vocalize");
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
    const fa = cardOf("fa", undefined, "vocalize");
    expect(fa?.template === "vocalize" ? fa.spelled : "none").toBeUndefined();
  });

  it("a reading: the sentence without ruby, the marked word's Jyutping to type (yue)", () => {
    const course = loadCourse("yue");
    const ex = cardOf("yue", undefined, "transcribe");
    if (ex?.template !== "transcribe") throw new Error("yue: no transcribe card");
    expect(ex.prompt.tokens.every((t) => t.ruby === undefined && t.readings === undefined)).toBe(true);
    expect(ex.prompt.tokens[ex.word]?.kind).toBe("word");
    expect(ex.reading.lang).toBe("yue-Latn-HK-jyutping");
    expect(ex.orthography).toBe("yue-Latn/jyutping");
    const grader = createGrader(course);
    const reading = surfaceOf(ex.reading);
    expect(gradeExercise(ex, { tag: "text", text: reading.replace(/ /gu, "") }, grader).verdict).toBe("CORRECT");
    const tone = gradeExercise(ex, { tag: "text", text: reading.replace(/([1-6])$/u, (d) => String((Number(d) % 6) + 1)) }, grader);
    expect([tone.verdict, tone.notes]).toEqual(["WRONG", ["reading-tone"]]);
  });

  it("alphabets write their vowels: no such card for uz", () => {
    expect(cardOf("uz", "uz-Latn/standard", "vocalize")).toBeUndefined();
    expect(cardOf("uz", "uz-Latn/standard", "transcribe")).toBeUndefined();
    expect(cardOf("fa", undefined, "transcribe")).toBeUndefined();
    expect(cardOf("yue", undefined, "vocalize")).toBeUndefined();
  });
});

describe("who speaks and who is spoken to (persons)", () => {
  it("goes with the exercises that write the sentence in the target language, and only those", () => {
    const course = loadCourse("apc", "apc-Arab/standard");
    const words = (s: (typeof course.units)[number]["sentences"][number]): number => s.forms["apc-Arab/standard"]?.text.tokens.filter((t) => t.kind === "word").length ?? 0;
    const sentence = allSentences(course).find((s) => s.production && words(s) >= 2);
    if (sentence === undefined) throw new Error("no apc sentence");
    // The blank in complete-translation is a word the lesson introduces.
    const ctx = { course, rng: seededRng(5), introduced: sentence.kcs };
    const tagged = { ...sentence, persons: { addressee: "f" as const, speaker: "m" as const } };
    for (const template of ["translate-type.l1-l2", "translate-tap.l1-l2", "complete-translation", "gap-fill"] as const) {
      const ex = SENTENCE_TEMPLATES[template]?.(ctx, tagged);
      expect(ex && "persons" in ex ? ex.persons : undefined, template).toEqual({ addressee: "f", speaker: "m" });
    }
    // Reading the target into the support language: the target text shows it already.
    const reading = SENTENCE_TEMPLATES["translate-tap.l2-l1"]?.(ctx, tagged);
    expect(reading && "persons" in reading ? reading.persons : undefined).toBeUndefined();
    // Untagged: nothing.
    const plain = SENTENCE_TEMPLATES["translate-type.l1-l2"]?.(ctx, sentence);
    expect(plain && "persons" in plain).toBe(false);
  });

  it("tells the gap-fill which you: 'Do you want anything?' to several people is بدكن, not بدّك", () => {
    const course = loadCourse("apc", "apc-Arab/standard");
    const s = allSentences(course).find((x) => x.id === "s.like.33");
    if (s === undefined) throw new Error("no s.like.33");
    const ex = SENTENCE_TEMPLATES["gap-fill"]?.({ course, rng: seededRng(1), introduced: s.kcs }, s);
    expect(ex?.template).toBe("gap-fill");
    expect(ex && "persons" in ex ? ex.persons : undefined).toEqual({ addressee: "pl" });
  });
});

describe("rng", () => {
  it("is seeded and uniform-ish", () => {
    const a = seededRng(42);
    const b = seededRng(42);
    const xs = Array.from({ length: 1000 }, () => a.next());
    expect(xs).toEqual(Array.from({ length: 1000 }, () => b.next()));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(Math.abs(xs.reduce((s, x) => s + x, 0) / xs.length - 0.5)).toBeLessThan(0.05);
  });
});

// ------------------------------------------------------------------------------------ player

/** Runs a shell: executes grade effects with the real grader, collects the rest. */
const run = (course: CourseView, state: PlayerState, events: readonly PlayerEvent[]) => {
  const grader = createGrader(course);
  const effects: Effect[] = [];
  let s = state;
  const dispatch = (e: PlayerEvent): void => {
    const [next, fx] = step(s, e);
    s = next;
    for (const f of fx) {
      effects.push(f);
      if (f.tag === "grade") dispatch({ tag: "graded", outcome: gradeExercise(f.ex, f.response, grader) });
    }
  };
  for (const e of events) dispatch(e);
  return { state: s, effects, dispatch, get: () => s };
};

const answer = (ex: Exercise, response: Response): PlayerEvent[] => {
  switch (response.tag) {
    case "choice":
      return [{ tag: "ready" }, { tag: "input", draft: { tag: "choice", index: response.index } }, { tag: "submit" }];
    case "tiles":
      return [{ tag: "ready" }, { tag: "input", draft: { tag: "tiles", order: response.order } }, { tag: "submit" }];
    case "text":
      return [{ tag: "ready" }, { tag: "input", draft: { tag: "text", text: response.text } }, { tag: "submit" }];
    case "pairs":
      return [
        { tag: "ready" },
        { tag: "input", draft: { tag: "pairs", matched: ex.template === "match-pairs" ? ex.left.map((_, i) => i) : [], mistakes: response.mistakes } },
        { tag: "submit" },
      ];
    case "self-rating":
      return [{ tag: "ready" }, { tag: "input", draft: { tag: "self-rating", rating: response.rating } }, { tag: "submit" }];
    case "speech":
      return [{ tag: "ready" }, { tag: "input", draft: { tag: "speech", result: response.result } }, { tag: "submit" }];
  }
};

describe("player", () => {
  const course = loadCourse("fa");
  const node = lessonNodes(course)[2]?.node.id as string;
  const lesson = buildLesson(course, node, { seed: 3 });

  it("plays a lesson of right answers to the end", () => {
    const [s0, fx0] = start(node, lesson);
    const shell = run(course, s0, []);
    for (const ex of lesson) {
      for (const e of [...answer(ex, rightAnswer(ex)), { tag: "continue" } as const]) shell.dispatch(e);
    }
    const end = shell.get();
    expect(end.tag).toBe("finished");
    if (end.tag !== "finished") return;
    expect(end.summary).toEqual({ completed: true, exercises: lesson.length, correctFirstTry: lesson.length, retries: 0, skipped: 0 });
    const types = [...fx0, ...shell.effects].flatMap((f) => (f.tag === "emit" ? [f.event.type] : []));
    expect(types[0]).toBe("session_started");
    expect(types.filter((t) => t === "answer_submitted")).toHaveLength(lesson.length);
    expect(types.at(-1)).toBe("session_completed");
  });

  it("brings a mistake back at the end of the lesson", () => {
    const first = lesson.find((e) => e.template !== "speak.tier-0" && e.template !== "match-pairs" && wrongAnswer(e)?.tag === "choice") as Exercise;
    const [s0] = start(node, [first]);
    const shell = run(course, s0, [...answer(first, wrongAnswer(first) as Response), { tag: "continue" }]);
    const s = shell.get();
    expect(s.tag).toBe("presenting");
    if (s.tag !== "presenting") return;
    expect(s.ex.id).toBe(`${first.id}#2`);
    for (const e of [...answer(s.ex, rightAnswer(s.ex)), { tag: "continue" } as const]) shell.dispatch(e);
    const end = shell.get();
    expect(end.tag === "finished" && end.summary).toEqual({ completed: true, exercises: 1, correctFirstTry: 0, retries: 1, skipped: 0 });
  });

  it("asks each question once when retries are off (placement)", () => {
    const first = lesson.find((e) => e.template !== "speak.tier-0" && e.template !== "match-pairs" && wrongAnswer(e)?.tag === "choice") as Exercise;
    const [s0] = start(node, [first], { retries: false });
    const shell = run(course, s0, [...answer(first, wrongAnswer(first) as Response), { tag: "continue" }]);
    const end = shell.get();
    expect(end.tag === "finished" && end.summary).toEqual({ completed: true, exercises: 1, correctFirstTry: 0, retries: 0, skipped: 0 });
  });

  it("asks an adaptive test as its answers decide (placement, ADR 0077)", () => {
    const test = placementTest(course, 4).test;
    const units = test.blocks.map((b) => b.id);
    const unitOf = new Map(course.units.flatMap((u) => u.sentences.map((x) => [x.id, u.id] as const)));
    // A learner who knows the first two units.
    const knows = (ex: Exercise): boolean => units.indexOf(unitOf.get(ex.item) ?? "") < 2;
    const [s0] = start("placement", runTest(test, new Map()).next, { adaptive: test });
    const shell = run(course, s0, []);
    const progress: number[] = [];
    for (let s = shell.get(); s.tag !== "finished"; s = shell.get()) {
      if (s.tag !== "presenting") throw new Error(`unexpected ${s.tag}`);
      const response = knows(s.ex) ? rightAnswer(s.ex) : (wrongAnswer(s.ex) as Response);
      for (const e of [...answer(s.ex, response), { tag: "continue" } as const]) shell.dispatch(e);
      progress.push(progressOf(shell.get()).total);
    }
    const end = shell.get();
    if (end.tag !== "finished") return;
    const answers = new Map(end.session.results.map((r) => [r.exercise, isCorrect(r.verdict)]));
    expect(answers.size).toBe(end.session.queue.length);
    expect(end.summary.exercises).toBe(end.session.queue.length);
    expect(end.summary.retries).toBe(0);
    expect(placedBy(test, answers)).toEqual(pathNodes(course).filter((n) => units.indexOf(n.unit.id) < 2).map((n) => n.node.id));
    expect(progressOf(end)).toEqual({ done: end.session.queue.length, total: end.session.queue.length });
    expect(progress.every((t) => t >= 1)).toBe(true);
  });

  it("never submits during IME composition, and grades the settled text", () => {
    const typed = lesson.find((e) => e.template === "translate-type.l1-l2") ?? buildLesson(course, node, { seed: 3 }).find((e) => TEMPLATES[e.template].modality.input === "text");
    expect(typed).toBeDefined();
    const ex = typed as Exercise;
    const [s0] = start(node, [ex]);
    const shell = run(course, s0, [{ tag: "ready" }, { tag: "compositionstart" }, { tag: "input", draft: { tag: "text", text: "ک" } }, { tag: "submit" }]);
    const mid = shell.get();
    expect(mid.tag).toBe("answering");
    expect(mid.tag === "answering" && mid.composing).toBe(true);
    expect(shell.effects.some((f) => f.tag === "grade")).toBe(false);
    const settled = ex.template === "complete-translation" ? surfaceOf(ex.blank) : ex.template === "translate-type.l1-l2" ? surfaceOf(ex.canonical) : "";
    shell.dispatch({ tag: "compositionend", text: settled });
    shell.dispatch({ tag: "submit" });
    const after = shell.get();
    expect(after.tag).toBe("feedback");
    expect(after.tag === "feedback" && isCorrect(after.outcome.verdict)).toBe(true);
  });

  it("keeps the draft exactly as typed (no normalization while answering)", () => {
    const ex = lesson.find((e) => TEMPLATES[e.template].modality.input === "text") as Exercise;
    const raw = "  كي  "; // Arabic kaf and yeh, extra spaces: the grader folds them, the draft must not
    const [s0] = start(node, [ex]);
    const shell = run(course, s0, [{ tag: "ready" }, { tag: "input", draft: { tag: "text", text: raw } }]);
    const s = shell.get();
    expect(s.tag === "answering" && s.draft).toEqual({ tag: "text", text: raw });
    expect(responseOf(ex, { tag: "text", text: "   " })).toBeUndefined();
  });

  it("drops the rest of the speaking exercises after can't speak now", () => {
    const speaking = lesson.filter((e) => e.template === "speak.tier-0");
    const other = lesson.find((e) => e.template === "choose-translation" || e.template === "gap-fill") as Exercise;
    const exercises = speaking.length > 0 ? [speaking[0] as Exercise, other, { ...(speaking[0] as Exercise), id: "speak-again" }] : [];
    if (exercises.length === 0) return;
    const [s0] = start(node, exercises);
    const shell = run(course, s0, [{ tag: "ready" }, { tag: "skip", reason: "cant-speak" }]);
    const s = shell.get();
    expect(s.tag === "presenting" && s.ex.id).toBe(other.id);
    expect(s.session.queue.map((e) => e.id)).not.toContain("speak-again");
  });

  it("asks before quitting, and can resume", () => {
    const [s0] = start(node, lesson);
    const shell = run(course, s0, [{ tag: "ready" }, { tag: "interrupt", reason: "quit-confirm" }]);
    expect(shell.get().tag).toBe("interrupted");
    shell.dispatch({ tag: "resume" });
    expect(shell.get().tag).toBe("answering");
    shell.dispatch({ tag: "interrupt", reason: "quit-confirm" });
    shell.dispatch({ tag: "quit" });
    const end = shell.get();
    expect(end.tag === "finished" && end.summary.completed).toBe(false);
  });
});

describe("listening cards say what was heard means", () => {
  for (const [id, orthography] of [
    ["fa", "fa-Arab/standard"],
    ["uz", "uz-Latn/standard"],
    ["apc", "apc-Arab/standard"],
  ] as const) {
    it(`${id}: a heard word comes with its gloss, a heard sentence with its translation`, () => {
      const course = loadCourse(id, orthography);
      const gallery = cardGallery(course, 7);
      const kcs = new Map(course.units.flatMap((u) => u.kcs).map((k) => [String(k.id), k] as const));
      const sentences = new Map(course.units.flatMap((u) => u.sentences).map((s) => [s.id, s]));
      let words = 0;
      for (const { exercise: ex } of gallery) {
        if (ex === undefined) continue;
        if (ex.template === "listen-select" || ex.template === "minimal-pair") {
          words += 1;
          expect(ex.translation, ex.id).toEqual(kcs.get(ex.item)?.gloss?.[course.supportKey]);
          expect(ex.translation, ex.id).toBeDefined();
        }
        if (ex.template === "listen-tap" || ex.template === "listen-type") {
          expect(ex.translation, ex.id).toEqual(sentences.get(ex.item)?.translations[course.supportKey]?.text);
        }
      }
      expect(words).toBeGreaterThan(0);
    });
  }
});

describe("a typo that spells another word of the course (erratum 46)", () => {
  it("is WRONG_WORD in a vocalized orthography too: the course writes نْروح, the learner types نروح", () => {
    const orthography = "apc-Arab/standard";
    const grader = createGrader(loadCourse("apc", orthography));
    // nrou7 (no indicative m-) for mnrou7 (we go); bt- (you, she) for b- (I).
    expect(grader.grade(orthography, "بعدين منروح عالشغل", "بعدين نروح عالشغل").verdict).toBe("WRONG_WORD");
    expect(grader.grade(orthography, "بشتغل ببيروت", "بتشتغل ببيروت").verdict).toBe("WRONG_WORD");
    // A slip that spells no word of the course stays a typo.
    expect(grader.grade(orthography, "بعدين منروح عالشغل", "بعدين منرح عالشغل").verdict).toBe("CORRECT_WITH_TYPO");
  });
});

describe("affixes that carry meaning on the words a course inflects (ADR 0081)", () => {
  it("makes a verb's prefix or an agreeing ending WRONG_WORD, even where the slip spells no word of the course", () => {
    const arabic = "apc-Arab/standard";
    const grader = createGrader(loadCourse("apc", arabic));
    const graded = (accept: string, answer: string): [string, readonly string[]] => {
      const g = grader.grade(arabic, accept, answer);
      return [g.verdict, g.notes];
    };
    // b- dropped (شتغل is no word of the course) and b- for bt-; the school is feminine.
    expect(graded("(بشتغل|أنا بشتغل) ببيروت", "شتغل ببيروت")).toEqual(["WRONG_WORD", ["contrast-prefix"]]);
    expect(graded("المدرسة بعيدة", "المدرسة بعيد")).toEqual(["WRONG_WORD", ["contrast-ending"]]);
    // A noun's first letter is no prefix: still a typo (يروت is no word; بيروت is not inflected).
    expect(graded("(بحبّ|أنا بحبّ) بيروت (لأنّه|لأنّو) حلوة", "بحبّ يروت لأنّه حلوة")).toEqual(["CORRECT_WITH_TYPO", []]);
  });

  it("knows a verb by the spellings its accept sets give it (Arabizi be2ra beside b2ra)", () => {
    const arabizi = "apc-Latn/arabizi";
    const grader = createGrader(loadCourse("apc", arabizi));
    expect(grader.grade(arabizi, "(el|l|il|bel|bil) (masa|masa2) (b2ra|be2ra|bi2ra|b2ara)", "el masa bt2ra").verdict).toBe("WRONG_WORD");
    // Another vowel after the same prefix is a typo.
    expect(grader.grade(arabizi, "(el|l|il|bel|bil) (masa|masa2) (b2ra|be2ra|bi2ra|b2ara)", "el masa bu2ra").verdict).toBe("CORRECT_WITH_TYPO");
  });
});

describe("contrasts limited to the forms a word is pinned as (ADR 0084)", () => {
  it("makes a Biblical Hebrew verb's person prefix wrong, and leaves nouns and other typos alone", () => {
    const hebrew = "hbo-Hebr/tiberian";
    const grader = createGrader(loadCourse("hbo", hebrew));
    const graded = (accept: string, answer: string): [string, readonly string[]] => {
      const g = grader.grade(hebrew, accept, answer);
      return [g.verdict, g.notes];
    };
    // "and she fled" for "and he fled" (wayyiqtol, Jonah 1:3), though it spells no word of the course.
    expect(graded("ויברח", "ותברח")).toEqual(["WRONG_WORD", ["contrast-prefix"]]);
    // A slip inside the verb is a typo; so is a noun's first letter (the article is no person prefix).
    expect(graded("ויברח", "ויבברח")).toEqual(["CORRECT_WITH_TYPO", []]);
    expect(graded("השמים", "ישמים")).toEqual(["CORRECT_WITH_TYPO", []]);
    // An infinitive's -ôṯ is no perfect ending, though its verb has perfects in the course.
    expect(graded("בהיותם", "בהיוותם")).toEqual(["CORRECT_WITH_TYPO", []]);
  });

  it("accepts the other order of subject and predicate where Biblical Hebrew has it and the English is the same", () => {
    const hebrew = "hbo-Hebr/tiberian";
    const course = loadCourse("hbo", hebrew);
    const grader = createGrader(course);
    const reverse = (id: string): string => {
      const s = course.units.flatMap((u) => u.sentences).find((x) => x.id === id);
      const accept = s?.forms[hebrew]?.reverse;
      if (accept === undefined) throw new Error(`no reverse set for ${id}`);
      return accept;
    };
    // Another order is a correct alternative. A nominal clause (Joüon-Muraoka § 154f): הָאוֹר טוֹב,
    // and טוֹב הָאוֹר as Gen 1:4 has it.
    expect(grader.grade(hebrew, reverse("s.01.9"), "טוב האור").verdict).toBe("CORRECT_ALT");
    // A participle clause and a yiqtol (§ 154f, § 155k): either side of the subject.
    expect(grader.grade(hebrew, reverse("s.03.20"), "מתהלך האדם בתוך הגן").verdict).toBe("CORRECT_ALT");
    expect(grader.grade(hebrew, reverse("s.15.18"), "יהוה יסגרך בידי").verdict).toBe("CORRECT_ALT");
    // What the English does not decide (ADR 0085): "the woman said" is also X-qatal, "he fled" a
    // bare qatal with or without its pronoun.
    expect(grader.grade(hebrew, reverse("s.04.29"), "האשה אמרה").verdict).toBe("CORRECT_ALT");
    expect(grader.grade(hebrew, reverse("s.17.15"), "ברח").verdict).toBe("CORRECT_ALT");
    expect(grader.grade(hebrew, reverse("s.17.15"), "והוא ברח").verdict).toBe("CORRECT_ALT");
    const wrong = (id: string, answer: string): void =>
      expect(grader.grade(hebrew, reverse(id), answer).verdict, `${id} ${answer}`).not.toMatch(/^CORRECT/u);
    // wayyiqtol's vav never leaves its verb: a subject first would need another form (X-qatal).
    wrong("s.03.22", "האדם ויתחבא");
    // Not where the English would change: identity ("my brother is Cain"), a wish in a plain
    // yiqtol ("the LORD will bless you"), and what reads unpointed as a construct chain ("in the
    // man's garden" for בגן האדם).
    wrong("s.05.7", "אחי קין");
    wrong("s.20.25", "יהוה יברכך");
    wrong("s.03.2", "בגן האדם");
    // A vav on a qatal makes it a weqatal, "and he will flee".
    wrong("s.17.15", "וברח");
  });
});

describe("Toki Pona in sitelen pona (ADR 0086)", () => {
  const SITELEN_PONA = "tok-Qaap/sitelen-pona";

  it("grades sitelen Lasina typed into a sitelen pona answer, names against their cartouches", () => {
    const course = loadCourse("tok", SITELEN_PONA);
    const grader = createGrader(course);
    const sentence = allSentences(course).find((s) => s.id === "s.u01.12");
    const accept = sentence?.forms[SITELEN_PONA]?.reverse;
    if (accept === undefined) throw new Error("no sitelen pona accept set for s.u01.12");
    // sina jan Pita: the logographs, or the Latin words, name included.
    expect(grader.grade(SITELEN_PONA, accept, "sina jan Pita").verdict).toBe("CORRECT");
    expect(grader.grade(SITELEN_PONA, accept, surfaceOf(sentence?.forms[SITELEN_PONA]?.text as TaggedText)).verdict).toBe("CORRECT");
    // Another word is another logograph: wrong, with no typo tolerance.
    expect(isCorrect(grader.grade(SITELEN_PONA, accept, "sina jan Lina").verdict)).toBe(false);
  });

  it("accepts the Toki Pona answers an English prompt leaves open, and no other (ADR 0085)", () => {
    const LATIN = "tok-Latn/standard";
    const course = loadCourse("tok", LATIN);
    const grader = createGrader(course);
    const reverse = (text: string): string => {
      const s = allSentences(course).find((x) => surfaceOf(x.forms[LATIN]?.text as TaggedText) === text);
      const accept = s?.forms[LATIN]?.reverse;
      if (accept === undefined) throw new Error(`no sentence ${text}`);
      return accept;
    };
    const right = (text: string, answer: string): boolean => isCorrect(grader.grade(LATIN, reverse(text), answer).verdict);
    // "My mother speaks Toki Pona": mama alone is a mother too; "We're going up the hill": mi alone is we.
    expect(right("mama meli mi li toki pona.", "mama mi li toki pona")).toBe(true);
    expect(right("mi mute li tawa sewi nena.", "mi tawa sewi nena")).toBe(true);
    // A plain yes/no question either way; kule before a colour; ali, pu's other spelling of ale.
    expect(right("pilin sina li pona ala pona?", "sina pilin ala pilin pona")).toBe(true);
    expect(right("sewi li laso.", "sewi li kule laso")).toBe(true);
    expect(right("ale li pona.", "ali li pona")).toBe(true);
    // "I'm eating" decides one person: mi mute is we.
    expect(right("mi moku.", "mi mute li moku")).toBe(false);
  });

  it("asks a logograph's word among words in Latin letters, and never splits a cartouche", () => {
    const course = loadCourse("tok", SITELEN_PONA);
    const reads = lessonNodes(course).flatMap(({ node }) => buildLesson(course, node.id, { seed: 3 })).filter((ex) => ex.template === "char-read");
    expect(reads.length).toBeGreaterThan(0);
    for (const ex of reads) {
      if (ex.template !== "char-read") continue;
      expect(ex.options.every((o) => o.orthography === "tok-Latn/standard")).toBe(true);
      expect(ex.prompt.tokens).toHaveLength(1);
    }
    for (const s of allSentences(course)) {
      for (const t of s.forms[SITELEN_PONA]?.text.tokens ?? []) {
        if (t.kind === "word" && t.surface.startsWith("\u{F1990}")) expect(t.surface.endsWith("\u{F1991}")).toBe(true);
      }
    }
  });
});

describe("how a character is read here (reading-disambiguation)", () => {
  const course = loadCourse("yue");
  const JYUTPING = "jyutping" as SchemeId;
  const cards = allSentences(course).flatMap((s) => {
    const ex = makeReadingDisambiguation({ course, rng: seededRng(5), introduced: [] }, s);
    return ex === undefined ? [] : [{ s, ex }];
  });

  it("shows the whole sentence, since the context decides, with the character picked out", () => {
    expect(cards.length).toBeGreaterThan(0);
    for (const { s, ex } of cards) {
      expect(ex.context).toEqual(s.forms["yue-Hant-HK/standard"]?.text);
      const token = ex.context.tokens[ex.focus.token];
      expect(token?.ruby?.[JYUTPING]?.[ex.focus.segment]).toBeDefined();
    }
  });

  it("offers single readings, first those the character has elsewhere in the course: 呢 is ne1 in 你呢, ni1 in 呢個", () => {
    for (const { ex } of cards) for (const o of ex.options) expect(surfaceOf(o)).toMatch(/^(?:[a-z]+[1-6])+$/u);
    const ne = cards.find(({ ex }) => {
      const t = ex.context.tokens[ex.focus.token];
      return t?.ruby?.[JYUTPING]?.[ex.focus.segment]?.base === "\u5462";
    });
    expect(ne).toBeDefined();
    expect(ne?.ex.options.map(surfaceOf)).toContain("ne1");
    expect(ne?.ex.options.map(surfaceOf)).toContain("ni1");
  });
});

describe("the accepted answer closest to a wrong one (feedback)", () => {
  it("is another wording where that is nearer, with what was left out marked: 我嘅書喺邊度呀 for 我嘅書邊度呀", () => {
    const course = loadCourse("yue");
    const s = allSentences(course).find((x) => x.id === "s.u03.12");
    const ex = s === undefined ? undefined : makeTranslateType({ course, rng: seededRng(1), introduced: [] }, s);
    if (ex === undefined) throw new Error("s.u03.12 has no translate-type card");
    // 我嘅書呢？ is the solution; "where" questions about a location take 喺 (Matthews & Yip 2011, p. 378).
    const wrong = gradeExercise(ex, { tag: "text", text: "我嘅書邊度呀？" }, createGrader(course));
    expect(wrong.verdict).toBe("WRONG");
    expect(wrong.closestIsSolution).toBe(false);
    const closest = closestAnswer(wrong.alignment ?? [], ex.canonical, "");
    expect(surfaceOf(closest.text)).toBe("我嘅書喺邊度呀？");
    expect(closest.marked.map((i) => closest.text.tokens[i]?.surface)).toEqual(["\u55BA"]);
    // A slip in the solution's own wording lines up with the solution.
    expect(gradeExercise(ex, { tag: "text", text: "我嘅書尼？" }, createGrader(course)).closestIsSolution).toBe(true);
  });
});

describe("the wording a card shows, and what a clip says", () => {
  const es = loadCourse("es");
  const grader = createGrader(es);
  const ctx = { course: es, rng: seededRng(1), introduced: [] };
  const text = (s: (typeof es.units)[number]["sentences"][number]): string => surfaceOf(s.forms[es.orthography]?.text as TaggedText);
  // Its accept set is "[Yo] estoy bien": the notation's own canonical path includes the optional Yo.
  const estoy = allSentences(es).find((s) => text(s) === "Estoy bien.");
  if (estoy === undefined) throw new Error("es needs Estoy bien.");

  it("an answer on the shown wording is CORRECT; another accepted wording is CORRECT_ALT", () => {
    const ex = makeTranslateType(ctx, estoy) as Exercise;
    expect(gradeExercise(ex, { tag: "text", text: "Estoy bien." }, grader)).toMatchObject({ verdict: "CORRECT", closestIsSolution: true });
    expect(gradeExercise(ex, { tag: "text", text: "Yo estoy bien." }, grader)).toMatchObject({ verdict: "CORRECT_ALT", closestIsSolution: false });
  });

  it("every sentence typed as the course shows it is CORRECT", () => {
    const off = allSentences(es).flatMap((s) => {
      const ex = makeTranslateType(ctx, s);
      if (ex === undefined) return [];
      const verdict = gradeExercise(ex, { tag: "text", text: text(s) }, grader).verdict;
      return verdict === "CORRECT" ? [] : [`${s.id}: ${verdict}`];
    });
    expect(off).toEqual([]);
  });

  it("dictation takes what the clip says, not another way to say the same", () => {
    const ex = SENTENCE_TEMPLATES["listen-type"]?.(ctx, estoy);
    if (ex === undefined) throw new Error("Estoy bien. needs its clip for this test");
    expect(gradeExercise(ex, { tag: "text", text: "Estoy bien." }, grader).verdict).toBe("CORRECT");
    expect(isCorrect(gradeExercise(ex, { tag: "text", text: "Yo estoy bien." }, grader).verdict)).toBe(false);
    const tap = SENTENCE_TEMPLATES["listen-tap"]?.(ctx, estoy);
    expect(tap === undefined ? undefined : tap.template === "listen-tap" ? tap.accept : undefined).toBe("Estoy bien.");
  });
});
