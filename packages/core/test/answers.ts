/** Answers to any card, for tests that play or grade them: what a learner who knows it gives, and a wrong one. */
import type { Exercise, Response } from "../src/lesson/index.ts";
import { surfaceOf } from "../src/text/index.ts";

/** The response a learner who knows the answer gives. */
export const rightAnswer = (ex: Exercise): Response => {
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
      return { tag: "choice", index: ex.answer };
    case "transcribe":
      return { tag: "text", text: surfaceOf(ex.reading) };
    case "speak.tier-0":
      return { tag: "self-rating", rating: "good" };
    case "speak":
    case "listen-speak":
      return { tag: "speech", result: { silent: false } };
  }
};

/** A wrong response, where the card can take one (matching pairs cannot be answered wrong). */
export const wrongAnswer = (ex: Exercise): Response | undefined => {
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
      return { tag: "choice", index: (ex.answer + 1) % ex.options.length };
    case "transcribe":
      return { tag: "text", text: "qqqq1" };
    case "speak.tier-0":
      return { tag: "self-rating", rating: "again" };
    case "match-pairs":
    case "letter-pairs":
      return undefined;
  }
};
