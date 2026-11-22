/**
 * Reading traditions (ADR 0138): the readings an orthography's reading cards may ask. Classical
 * Chinese is read in Pinyin, Jyutping and Baxter's Middle Chinese; the learner reads in one at a
 * time, and each keeps its own progress.
 */
import type { SchemeId } from "@nabu/schema";
import type { CompiledProfile } from "../profile/compile.ts";
import { readingTag } from "../profile/schemes.ts";
import { profileOf, type CourseView } from "./course.ts";

/**
 * An orthography's reading traditions: its ruby layers of kind reading whose scheme can be asked
 * (its `answer`, ADR 0098), in the profile's order. Most orthographies have one or none.
 */
export const readingTraditions = (course: CourseView, orthography: string = course.orthography): readonly SchemeId[] => profileTraditions(profileOf(course, orthography));

/** A profile's reading traditions (`readingTraditions`), from the profile alone. */
export const profileTraditions = (profile: CompiledProfile): readonly SchemeId[] =>
  (profile.source.annotations ?? []).flatMap((a) => (a.kind === "reading" && a.render === "ruby" && a.scheme !== undefined && readingTag(a.scheme) !== undefined ? [a.scheme] : []));

/** The tradition reading cards ask: the learner's (`chosen`) where it is one, else the first. */
export const readingTradition = (course: CourseView, chosen?: SchemeId | false): SchemeId | undefined => {
  const all = readingTraditions(course);
  return chosen !== undefined && chosen !== false && all.includes(chosen) ? chosen : all[0];
};

/**
 * What a reading card names as its tradition, in its exercise, its event and its card key: the
 * scheme, where its orthography has more than one tradition; otherwise nothing, so a course read
 * in one tradition keeps the keys it always had.
 */
export const traditionKey = (course: CourseView, scheme: SchemeId | undefined): SchemeId | undefined =>
  scheme !== undefined && readingTraditions(course).length > 1 ? scheme : undefined;

/** The tradition named by the cards of a learner who chose `chosen` (ADR 0138): see `traditionKey`. */
export const chosenTraditionKey = (course: CourseView, chosen?: SchemeId | false): SchemeId | undefined => traditionKey(course, readingTradition(course, chosen));
