/**
 * A lexicon no course uses yet, as a course view the rules explorer can open (debug mode; ADR 0158):
 * Modern Standard Arabic (lexicons/arb) is written so its rules can be checked before any course is.
 * The view has no units, no audio and an empty bundle lexicon: the explorer lists the lexicon's file,
 * realises and spells with it, and the course's own tokens and paradigms are simply none. Its profiles
 * are compiled from their source without the typo models (nothing is graded here), the language's
 * orthography first and the support orthography beside it.
 */
import type { OrthographyProfile } from "@nabu/schema";
import { compileProfile, type CompiledProfile } from "../profile/index.ts";
import { err, ok, type Result } from "../result.ts";
import type { CourseView } from "./course.ts";
import type { LexiconSource } from "./lexicon-data.ts";

export interface LexiconCourseOptions {
  /** The lexicon's language (arb): its orthographies are the profiles whose tag begins with it. */
  readonly language: string;
  /** The support orthography (en-Latn/standard), whose profile the source must carry. */
  readonly support: string;
  /** CLDR's numbering systems (@nabu/i18n's generated table), for the profiles' digit steps. */
  readonly numberingSystems: Readonly<Record<string, string>>;
}

/** Why a lexicon could not be opened: a profile that does not compile, or no orthography of the language. */
export type LexiconCourseError =
  | {
      readonly kind: "profile";
      readonly id: string;
      readonly errors: readonly string[];
    }
  | { readonly kind: "no-orthography" };

const isObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A lexicon's files and its profiles as a course view with no units. */
export const lexiconCourse = (
  source: LexiconSource,
  options: LexiconCourseOptions,
): Result<CourseView, LexiconCourseError> => {
  const profiles = new Map<string, CompiledProfile>();
  for (const [id, raw] of Object.entries(source.profiles ?? {})) {
    if (!isObject(raw)) continue;
    const match = isObject(raw["match"])
      ? Object.fromEntries(
          Object.entries(raw["match"]).filter(([k]) => k !== "typo"),
        )
      : undefined;
    const profile = {
      ...raw,
      ...(match !== undefined && { match }),
    } as unknown as OrthographyProfile;
    const made = compileProfile(profile, {
      numberingSystems: options.numberingSystems,
      tables: {},
      keyboards: {},
    });
    if (!made.ok)
      return err({
        kind: "profile",
        id,
        errors: made.error.map((e) =>
          "message" in e ? String(e.message) : e.code,
        ),
      });
    profiles.set(id, made.value);
  }
  const own = [...profiles.keys()]
    .filter((id) => id.startsWith(`${options.language}-`))
    .sort();
  const orthography = own[0];
  if (orthography === undefined || !profiles.has(options.support))
    return err({ kind: "no-orthography" });
  const supportKey = options.support.split("-")[0] ?? options.support;
  return ok({
    id: options.language,
    target: options.language,
    units: [],
    lexicon: { language: options.language, lexemes: [] },
    orthography,
    support: options.support,
    supportKey,
    profiles,
    audio: {},
  });
};
