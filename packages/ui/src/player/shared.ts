/**
 * What every exercise view gets from the player shell. Views render state and
 * dispatch PlayerEvents; they never grade or advance on their own.
 */
import type { CourseView, Draft, Exercise, PlayerEvent } from "@nabu/core/lesson";
import type { OrthographyProfile, SchemeId } from "@nabu/schema";
import { useEffect, type RefObject } from "react";
import type { Marks } from "../marks.tsx";
import type { WordTap } from "./Gloss.tsx";

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
  /** Vowel marks on every word, none, or the words still being learned (P12). */
  readonly marks: Marks;
  /** Writing mode for target-language prompts and word banks (§11.4). */
  readonly writingMode: WritingMode;
  /** Maps a bundle path (images/…, audio/…) to a URL. */
  readonly imageUrl: (path: string) => string;
  /**
   * Whether clips may play by themselves: as a card opens or is answered, or as a word is tapped
   * (match-pairs). Off with the player's sound, and while the learner can't listen (P6); the play
   * buttons work either way.
   */
  readonly sound?: boolean | undefined;
  /** Where a view registers its digit and Backspace shortcuts; the player listens on the window. */
  readonly shortcuts: { current: Shortcuts | null };
  /**
   * Element ids for screen readers (P10): the card's instruction (the player's heading), and a base
   * the view derives its prompt's ids from (describedBy). The control a card focuses first is
   * described by them, so its instruction and prompt are read when focus lands on it.
   */
  readonly ids?: { readonly instruction: string; readonly base: string } | undefined;
  /**
   * Tap-for-gloss in a lesson (P1): the word tapped on this card, and where a tap goes. Views make
   * a target text tappable only where its words' meanings give nothing away; stories gloss their own.
   */
  readonly glossing?: Glossing | undefined;
}

export interface Glossing {
  readonly tapped: WordTap | undefined;
  readonly onTap: (tap: WordTap) => void;
}

/** The id a view gives one part of its prompt (the prompt itself, a gap sentence, a hint). */
export const partId = (ids: ViewProps["ids"], part: "prompt" | "gap" | "hint"): string | undefined => (ids === undefined ? undefined : `${ids.base}-${part}`);

/** What describes a card's first control: its instruction, then the parts of its prompt it shows. */
export const describedBy = (ids: ViewProps["ids"], parts: readonly ("prompt" | "gap" | "hint")[]): string | undefined =>
  ids === undefined ? undefined : [ids.instruction, ...parts.map((p) => `${ids.base}-${p}`)].join(" ");

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
 * The vowel marks a learner sees before they choose (P12): the profile's vocalization layer says,
 * `on` (every word, the default), `off`, or `on-for-new-words` (Persian: the words still being learned).
 */
export const defaultMarks = (profile: OrthographyProfile | undefined): Marks => {
  const layer = profile?.annotations?.find((a) => a.kind === "vocalization" && a.toggle);
  return layer?.default === "off" ? "hide" : layer?.default === "on-for-new-words" ? "new" : "show";
};

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
/**
 * Focuses an action (Continue) and brings its footer into view, with the footer's scroll margin
 * below it: a phone browser's toolbar at the bottom of the screen covers the last strip of the
 * viewport, where focus() alone would leave the button. Nothing happens while it has focus, so
 * a re-render never scrolls the page back to it.
 */
export const focusInReach = (button: HTMLElement | null, footer: HTMLElement | null): void => {
  if (button === null || document.activeElement === button) return;
  button.focus({ preventScroll: true });
  (footer ?? button).scrollIntoView({ block: "nearest", inline: "nearest" });
};

/** A field the learner types into, where an on-screen keyboard opens. */
const typesInto = (el: Element | null): el is HTMLElement =>
  el instanceof HTMLTextAreaElement || (el instanceof HTMLElement && el.isContentEditable) || (el instanceof HTMLInputElement && !["button", "checkbox", "radio", "range", "submit", "reset", "file", "image", "color"].includes(el.type));

/** The room kept above a field when the page scrolls on past it (CSS px). */
const FIELD_MARGIN = 8;

/**
 * While the learner types into a field of the card, its actions (Check, Skip) stay in reach. On a
 * phone the on-screen keyboard leaves little of the screen, and the browser scrolls only the field
 * into view, leaving the footer under the toolbar that sits above the keyboard. So when a card
 * appears or a field takes focus, and whenever the visible area changes size (the keyboard opening),
 * the page scrolls on until the footer clears the bottom of the visible area by its scroll margin
 * (--nabu-space-reach), as far as the field itself stays in view. The visible area is the visual
 * viewport: the keyboard shrinks it, not the layout viewport.
 */
export const useActionsInReach = (card: RefObject<HTMLElement | null>, footer: RefObject<HTMLElement | null>, exercise: string): void => {
  useEffect(() => {
    const viewport = window.visualViewport;
    // The refs are read when each event comes: the card's element changes between its states.
    const settle = (): void => {
      const field = document.activeElement;
      const root = card.current;
      const end = footer.current;
      if (root === null || end === null || !typesInto(field) || !root.contains(field)) return;
      const top = viewport?.offsetTop ?? 0;
      const bottom = top + (viewport?.height ?? window.innerHeight);
      const reach = Number.parseFloat(getComputedStyle(end).scrollMarginBlockEnd) || 0;
      const over = end.getBoundingClientRect().bottom + reach - bottom;
      const room = field.getBoundingClientRect().top - top - FIELD_MARGIN;
      const by = Math.min(over, room);
      if (by >= 1) window.scrollBy({ top: by, behavior: "instant" });
    };
    // After the browser's own scroll to the field, which follows the focus event.
    const onFocus = (): void => void requestAnimationFrame(settle);
    // A card's field may take focus as the card mounts, before this effect listens.
    const first = requestAnimationFrame(settle);
    document.addEventListener("focusin", onFocus);
    viewport?.addEventListener("resize", settle);
    return () => {
      cancelAnimationFrame(first);
      document.removeEventListener("focusin", onFocus);
      viewport?.removeEventListener("resize", settle);
    };
  }, [card, footer, exercise]);
};

export const digitIndex = (key: string): number | undefined => {
  for (const digits of DIGITS) {
    const i = digits.indexOf(key);
    if (i >= 0) return i;
  }
  return undefined;
};

/**
 * Whether a key comes from inside a dialog (the quit dialog, a correction's form, a popover): the
 * player's shortcuts leave it alone, or Enter there would answer or move on and close it (P11).
 */
export const inDialog = (target: EventTarget | null): boolean => target instanceof Element && target.closest("[role=dialog], [role=alertdialog]") !== null;

/** Keyboard shortcuts must not fire while the learner types in a field. */
export const typingInField = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && (target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA") && !(target instanceof HTMLInputElement && target.type === "radio");
