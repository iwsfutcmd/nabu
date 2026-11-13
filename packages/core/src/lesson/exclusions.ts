/**
 * The templates a session leaves out: those a course rules out by what it practises and how far its
 * voice may be relied on (ADR 0071, 0091), and those the app's speech support rules out (ADR 0093).
 * Rule templates out here, never by hand in one caller: every plan (lessons, reviews, mistakes,
 * placement) leaves out both, and the card gallery and the word list what the course rules out.
 */
import type { CourseView } from "./course.ts";
import type { TemplateId } from "./exercise.ts";
import { DEVICE_TONE_SCORING, toneSystemOf } from "../speech/score.ts";
import { LISTENING, TEMPLATES } from "./templates.ts";

/**
 * What the app can do with speech (§10.4): score it (tones on the device for tonal courses, words
 * and phones on a speech server), and offer tone listening. Without it, speaking is tier 0.
 */
export interface SpeechSupport {
  /** Speaking is scored: `speak` and `listen-speak` replace self-rated `speak.tier-0`. */
  readonly scored: boolean;
  /** Tone exercises (tone-identify) for courses whose readings carry tones. */
  readonly tones: boolean;
}

/**
 * What the app can do with speech for a course: score it when the server scores the orthography
 * (tiers 1–2), or, were device tone scoring on, when the course's readings carry tones (tier 3; off,
 * ADR 0093); tone exercises always.
 */
export const speechSupportOf = (
  course: CourseView,
  serverTiers: number,
): SpeechSupport =>
  // A course that is never spoken or heard (ADR 0071) needs no scoring, whatever its readings carry.
  course.facets !== undefined && !course.facets.includes("speak") && !course.facets.includes("listen")
    ? { scored: false, tones: false }
    : {
        scored:
          serverTiers > 0 ||
          (DEVICE_TONE_SCORING &&
            course.units.some((u) =>
              u.sentences.some((s) => {
                const text = s.forms[course.orthography]?.text;
                return text !== undefined && toneSystemOf(text) !== undefined;
              }),
            )),
        tones: true,
      };

/**
 * The templates a course rules out by what it practises (ADR 0071): every template whose facet
 * the course does not name. Classical Chinese practises recognize and produce, so it never plans
 * speaking, listening or reading drills; a course that names no facets rules nothing out.
 */
export const facetExclusions = (course: CourseView): ReadonlySet<TemplateId> => {
  const facets = course.facets;
  return facets === undefined ? new Set() : new Set((Object.keys(TEMPLATES) as TemplateId[]).filter((t) => !facets.includes(TEMPLATES[t].facet)));
};

/**
 * The templates an iffy voice rules out (ADR 0091): every one whose prompt is a clip (listening,
 * listen-and-repeat, tones). The clips still play where the learner has the text: after a card is
 * answered, in stories, in the word list. A good voice rules nothing out; a bad one ships no clips.
 */
export const voiceExclusions = (course: CourseView): ReadonlySet<TemplateId> =>
  course.audioQuality === "iffy" ? LISTENING : new Set();

/** Everything the course itself rules out: its facets' exclusions and its voice's. */
export const courseExclusions = (course: CourseView): ReadonlySet<TemplateId> => new Set([...facetExclusions(course), ...voiceExclusions(course)]);

/** The templates a speech support rules out. */
export const speechExclusions = (
  speech: SpeechSupport | undefined,
): ReadonlySet<TemplateId> =>
  new Set<TemplateId>([
    ...(speech?.scored === true
      ? (["speak.tier-0"] as const)
      : (["speak", "listen-speak"] as const)),
    ...(speech?.tones === true ? [] : (["tone-identify"] as const)),
  ]);
