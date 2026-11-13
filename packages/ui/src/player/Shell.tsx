/**
 * What the lesson player and the story reader share (C14 in the 2026-11 review): their keys. A fix
 * to them is made once, for both.
 */
import { useEffect, useRef } from "react";
import { digitIndex, inDialog, typingInField, type Shortcuts } from "./shared.ts";

// ------------------------------------------------------------------------------------ keys

/** What a session's keys do now (§11.3, §11.7). */
export interface PlayerKeys {
  /** What Enter does now (check, continue), or undefined: nothing. */
  readonly enter: (() => void) | undefined;
  /**
   * The one button Enter still goes to the session from (a story's Continue). From any other button
   * or link Enter is theirs: they activate themselves.
   */
  readonly enterFrom?: { readonly current: HTMLElement | null } | undefined;
  /** Where the card's view registers its number keys and Backspace, or undefined: no card now. */
  readonly shortcuts: { readonly current: Shortcuts | null } | undefined;
}

/**
 * A key the session takes: Enter checks and continues, number keys and Backspace go to the card's
 * view. Never during IME composition (§6.7), inside a text field (it handles its own Enter), or in a
 * dialog: the quit dialog, a correction's form, a menu (P11). Their keys are theirs.
 */
const onPlayerKey = (e: globalThis.KeyboardEvent, keys: PlayerKeys): void => {
  if (e.isComposing || e.keyCode === 229 || typingInField(e.target) || inDialog(e.target)) return;
  if (e.key === "Enter") {
    const control = e.target instanceof HTMLElement ? e.target.closest("button, a, [role=switch]") : null;
    if (control !== null && control !== keys.enterFrom?.current) return;
    if (keys.enter !== undefined) {
      e.preventDefault();
      e.stopPropagation();
      keys.enter();
    }
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const view = keys.shortcuts?.current;
  const digit = digitIndex(e.key);
  if (digit !== undefined && view?.digit !== undefined) {
    e.preventDefault();
    view.digit(digit);
  } else if (e.key === "Backspace" && view?.backspace !== undefined) {
    e.preventDefault();
    view.backspace();
  }
};

/**
 * A session's keys (§11.3, §11.7). A capturing window listener keeps them working when focus falls
 * back to the page, and claims Enter before a focused radio would re-select itself. The shell says
 * what they do as it renders (`keys.current`): undefined while they are not the session's (its quit
 * dialog is open, or it is over).
 */
export const usePlayerKeys = (): { current: PlayerKeys | undefined } => {
  const keys = useRef<PlayerKeys | undefined>(undefined);
  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent): void => {
      if (keys.current !== undefined) onPlayerKey(e, keys.current);
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, []);
  return keys;
};
