/**
 * What every exercise view gets from the player shell. Views render state and
 * dispatch PlayerEvents; they never grade or advance on their own.
 */
import type { CourseView, Draft, Exercise, PlayerEvent } from "@nabu/core/lesson";
import type { OrthographyProfile, SchemeId } from "@nabu/schema";

export type WritingMode = "horizontal-tb" | "vertical-rl" | "vertical-lr";

export interface ViewProps<E extends Exercise = Exercise> {
  readonly ex: E;
  readonly draft: Draft;
  readonly dispatch: (event: PlayerEvent) => void;
  readonly course: CourseView;
  /** Answer controls are read-only while checking and during feedback. */
  readonly locked: boolean;
  /** The reading layer to show as ruby, or false. */
  readonly ruby: SchemeId | false;
  readonly marks: "show" | "hide";
  /** Writing mode for target-language prompts and word banks (§11.4). */
  readonly writingMode: WritingMode;
  /** Maps a bundle path (images/…, audio/…) to a URL. */
  readonly imageUrl: (path: string) => string;
  /** Whether a tap may play a word's clip (match-pairs); off with the player's sound. */
  readonly sound?: boolean | undefined;
  /** Where a view registers its digit and Backspace shortcuts; the player listens on the window. */
  readonly shortcuts: { current: Shortcuts | null };
}

/** A view's keyboard shortcuts: number keys pick in reading order (§11.3), Backspace takes back. */
export interface Shortcuts {
  readonly digit?: (index: number) => void;
  readonly backspace?: () => void;
}

/** The profile's ruby reading scheme (Jyutping for yue), if it has one. */
export const rubySchemeOf = (profile: OrthographyProfile | undefined): SchemeId | undefined =>
  profile?.annotations?.find((a) => a.kind === "reading" && a.render === "ruby")?.scheme;

/** Whether the profile has a toggleable vocalization layer (harakat). */
export const hasMarksLayer = (profile: OrthographyProfile | undefined): boolean =>
  profile?.annotations?.some((a) => a.kind === "vocalization" && a.toggle) === true && profile.match?.marks !== undefined;

/**
 * The writing mode a target region actually uses: vertical only where the
 * profile allows it for that scope (§11.4), always for always-vertical scripts.
 */
export const effectiveWritingMode = (profile: OrthographyProfile | undefined, requested: WritingMode, scope: "prompt" | "wordbank" | "reading"): WritingMode => {
  const layout = profile?.layout;
  if (layout === undefined || layout.vertical === "none") return "horizontal-tb";
  if (layout.verticalPolicy === "always") return layout.vertical;
  return requested === layout.vertical && (layout.verticalScope ?? []).includes(scope) ? layout.vertical : "horizontal-tb";
};

/** Digits in reading order for keyboard shortcuts, in the numbering systems learners type (§11.3). */
const DIGITS = ["123456789", "۱۲۳۴۵۶۷۸۹", "١٢٣٤٥٦٧٨٩"];

/** 0 for "1" (or ۱ or ١), …; undefined for any other key. */
export const digitIndex = (key: string): number | undefined => {
  for (const digits of DIGITS) {
    const i = digits.indexOf(key);
    if (i >= 0) return i;
  }
  return undefined;
};

/** Keyboard shortcuts must not fire while the learner types in a field. */
export const typingInField = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && (target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA") && !(target instanceof HTMLInputElement && target.type === "radio");
