/**
 * A button that takes typed text, pressed while an input method composes (ADR 0118, D39 in the
 * 2026-11 review). Android keyboards such as Gboard compose the word being typed until it is
 * committed, so a button disabled while composing took two taps: the first only committed the word.
 *
 * The lesson player's Check does this in its state machine (`queued`, @nabu/core/lesson). Buttons
 * outside the player (Roleplay's Send, the correction form's Send, Start over's confirmation) share
 * this hook instead. The button stays enabled while composing, whenever what is typed would do:
 * - a press while composing moves focus to the button (`focusInReach`), which ends the composition
 *   as a tap anywhere else does, and waits;
 * - once compositionend has settled the text, and the field's own handlers have taken it in, the
 *   waiting press goes ahead, judged on the settled text;
 * - a compositionend with no press waiting (an input method's Enter, a tapped candidate) submits
 *   nothing, a new compositionstart drops a waiting press, and the field's Enter never waits.
 *
 * Nothing is ever submitted, normalized or reset mid-composition (gameplan §6.7).
 */
import { useEffect, useMemo, useRef, type RefObject } from "react";
import { focusInReach } from "./player/shared.ts";

/** Where a submit stands while an input method composes. */
export interface Held {
  /** An input method is composing in one of the fields. */
  readonly composing: boolean;
  /** A press waits for the text to settle. */
  readonly waiting: boolean;
}

export const SETTLED: Held = { composing: false, waiting: false };

export type HeldEvent =
  | { readonly tag: "compositionstart" }
  | { readonly tag: "compositionend" }
  /** A moment after compositionend: the field's handlers have stored the settled text, and it is rendered. */
  | { readonly tag: "settled" }
  /** The button: a tap, a click, a key on it, or an assistive technology's press. */
  | { readonly tag: "press" }
  /** The field's own Enter, which an input method uses to commit its text: it submits outside composition only. */
  | { readonly tag: "enter" };

/** Submit now; move focus to the button, which ends the composition; or wait a moment for the settled text. */
export type HeldEffect = "submit" | "focus" | "settle" | "none";

/** The next state and what to do: pure, so every sequence of events can be checked. */
export const stepHeld = (state: Held, event: HeldEvent): readonly [Held, HeldEffect] => {
  switch (event.tag) {
    case "compositionstart":
      // Back to typing: a press that waited for the last composition no longer stands.
      return [{ composing: true, waiting: false }, "none"];
    case "compositionend":
      // A commit alone submits nothing; a waiting press goes ahead once the settled text is in.
      return [{ composing: false, waiting: state.waiting }, state.waiting ? "settle" : "none"];
    case "settled":
      return state.waiting && !state.composing ? [SETTLED, "submit"] : [state, "none"];
    case "press":
      if (state.composing) return [{ composing: true, waiting: true }, "focus"];
      // A press already waits for this text: one submit.
      return [state, state.waiting ? "none" : "submit"];
    case "enter":
      return [state, state.composing || state.waiting ? "none" : "submit"];
  }
};

export interface SettledSubmit {
  /** For every field whose text the submit takes (spread onto it, or call from its own handlers). */
  readonly composition: { readonly onCompositionStart: () => void; readonly onCompositionEnd: () => void };
  /** The button's press: submits now, or, while composing, once the composition has ended. */
  readonly press: () => void;
  /** The field's Enter: submits outside composition only, and never waits. */
  readonly enter: () => void;
}

/**
 * The composition handlers, press and Enter for a button that submits typed text. `submit` is called
 * as the latest render has it, so it reads the settled text; it judges that text itself (an empty
 * turn, a name that no longer matches). `button` takes the focus from a composing field; `reach` is
 * what is brought into view with it (the button's row of actions), as `focusInReach` does.
 */
export const useSettledSubmit = (submit: () => void, button: RefObject<HTMLElement | null>, reach?: RefObject<HTMLElement | null>): SettledSubmit => {
  const latest = useRef(submit);
  latest.current = submit;
  const state = useRef<Held>(SETTLED);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return useMemo(() => {
    const send = (event: HeldEvent): void => {
      const [next, effect] = stepHeld(state.current, event);
      state.current = next;
      if (effect === "submit") latest.current();
      else if (effect === "focus") focusInReach(button.current, reach?.current ?? null);
      // After the events that settle the text (some browsers send the last input after compositionend)
      // and the render that stores it.
      else if (effect === "settle") {
        clearTimeout(timer.current);
        timer.current = setTimeout(() => send({ tag: "settled" }), 0);
      }
    };
    return {
      composition: { onCompositionStart: () => send({ tag: "compositionstart" }), onCompositionEnd: () => send({ tag: "compositionend" }) },
      press: () => send({ tag: "press" }),
      enter: () => send({ tag: "enter" }),
    };
  }, [button, reach]);
};
