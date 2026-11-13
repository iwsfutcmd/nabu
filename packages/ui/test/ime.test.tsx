/**
 * A button that takes typed text, pressed while an input method composes (ADR 0118, D39): Roleplay's
 * Send, the correction form's Send and Start over's confirmation share `useSettledSubmit`. A press
 * while composing waits for compositionend, then submits the settled text; nothing else submits
 * mid-composition, nor because a composition ended.
 */
import type { JSX } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SETTLED, stepHeld, useSettledSubmit, type Held, type HeldEffect, type HeldEvent, type SettledSubmit } from "../src/ime.ts";

const START: HeldEvent = { tag: "compositionstart" };
const END: HeldEvent = { tag: "compositionend" };
const SETTLE: HeldEvent = { tag: "settled" };
const PRESS: HeldEvent = { tag: "press" };
const ENTER: HeldEvent = { tag: "enter" };

/** The effects of a run of events from the settled state. */
const run = (events: readonly HeldEvent[], from: Held = SETTLED): HeldEffect[] => {
  let state = from;
  return events.map((event) => {
    const [next, effect] = stepHeld(state, event);
    state = next;
    return effect;
  });
};

describe("a submit while an input method composes", () => {
  it("a press with the text settled submits at once", () => {
    expect(run([PRESS])).toEqual(["submit"]);
    expect(run([START, END, PRESS])).toEqual(["none", "none", "submit"]);
  });

  it("a press while composing moves the focus to the button and submits once the text has settled", () => {
    // The press ends the composition (focus leaves the field); the settled text goes in a moment later.
    expect(run([START, PRESS, END, SETTLE])).toEqual(["none", "focus", "settle", "submit"]);
    // Pressed twice before the composition ends, or again before the text is in: still one submit.
    expect(run([START, PRESS, PRESS, END, PRESS, SETTLE])).toEqual(["none", "focus", "focus", "settle", "none", "submit"]);
  });

  it("a composition that ends by itself submits nothing: an input method's Enter, a tapped candidate", () => {
    expect(run([START, END, SETTLE])).toEqual(["none", "none", "none"]);
  });

  it("Enter never submits while composing, and never waits for the composition to end", () => {
    expect(run([START, ENTER, END, SETTLE])).toEqual(["none", "none", "none", "none"]);
    expect(run([START, END, ENTER])).toEqual(["none", "none", "submit"]);
    // Nor while a press waits for the settled text: that press submits, once.
    expect(run([START, PRESS, END, ENTER, SETTLE])).toEqual(["none", "focus", "settle", "none", "submit"]);
  });

  it("a new composition drops a waiting press: the learner went back to typing", () => {
    expect(run([START, PRESS, END, START, SETTLE, END, SETTLE])).toEqual(["none", "focus", "settle", "none", "none", "none", "none"]);
  });

  /** Every sequence of `length` events. */
  const sequences = function* (length: number): Generator<HeldEvent[]> {
    if (length === 0) {
      yield [];
      return;
    }
    for (const rest of sequences(length - 1)) for (const event of [START, END, SETTLE, PRESS, ENTER]) yield [...rest, event];
  };

  it("in every sequence of events: never mid-composition, never more submits than presses, nothing from composing alone", () => {
    const wrong: string[] = [];
    let checked = 0;
    for (let length = 1; length <= 7; length++) {
      for (const events of sequences(length)) {
        const seen = (why: string): void => {
          wrong.push(`${events.map((e) => e.tag).join(" ")}: ${why}`);
        };
        let state = SETTLED;
        let asked = 0;
        let submits = 0;
        // Whether a press came since the last compositionstart: only that can make a settled text submit.
        let pressedSince = false;
        for (const event of events) {
          const [next, effect] = stepHeld(state, event);
          if (event.tag === "press" || event.tag === "enter") asked += 1;
          if (event.tag === "compositionstart") pressedSince = false;
          if (event.tag === "press") pressedSince = true;
          if (effect === "submit") {
            submits += 1;
            if (state.composing || next.composing) seen("submitted mid-composition");
            if (event.tag === "settled" ? !pressedSince : event.tag !== "press" && event.tag !== "enter") seen(`submitted on ${event.tag} with no press`);
          }
          // Only a press moves the focus, and only while composing.
          if (effect === "focus" && (event.tag !== "press" || !state.composing)) seen("moved the focus");
          state = next;
        }
        if (submits > asked) seen(`${submits} submits for ${asked} presses`);
        checked += 1;
      }
    }
    expect(wrong).toEqual([]);
    expect(checked).toBe([1, 2, 3, 4, 5, 6, 7].reduce((n, k) => n + 5 ** k, 0));
  });
});

describe("useSettledSubmit", () => {
  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(globalThis, "document");
  });

  /** The hook as a component gets it, and the submits it makes: server-rendered, so its handlers are called by hand. */
  const mount = (button: HTMLElement | null = null): { readonly hook: SettledSubmit; readonly submit: ReturnType<typeof vi.fn> } => {
    const submit = vi.fn();
    let hook: SettledSubmit | undefined;
    const Probe = (): JSX.Element => {
      hook = useSettledSubmit(submit, { current: button }, { current: null });
      return <span />;
    };
    renderToStaticMarkup(<Probe />);
    if (hook === undefined) throw new Error("not rendered");
    return { hook, submit };
  };

  it("submits a press at once when nothing composes, and the field's Enter too", () => {
    const { hook, submit } = mount();
    hook.press();
    expect(submit).toHaveBeenCalledTimes(1);
    hook.enter();
    expect(submit).toHaveBeenCalledTimes(2);
  });

  it("holds a press while composing, moves the focus to the button, and submits a moment after compositionend", () => {
    vi.useFakeTimers();
    const focus = vi.fn();
    const button = { focus, scrollIntoView: vi.fn() } as unknown as HTMLElement;
    // The page's focus is in the composing field.
    Object.defineProperty(globalThis, "document", { configurable: true, value: { activeElement: null } });
    const { hook, submit } = mount(button);
    hook.composition.onCompositionStart();
    hook.press();
    expect(submit).not.toHaveBeenCalled();
    // focusInReach: the button takes the focus without a scroll of its own; its row is brought into view.
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    hook.composition.onCompositionEnd();
    // Not inside compositionend: after the events and the render that store the settled text.
    expect(submit).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(submit).toHaveBeenCalledTimes(1);
    vi.runAllTimers();
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("submits nothing when a composition ends by itself, or when Enter came while composing", () => {
    vi.useFakeTimers();
    const { hook, submit } = mount();
    hook.composition.onCompositionStart();
    hook.enter();
    hook.composition.onCompositionEnd();
    vi.runAllTimers();
    expect(submit).not.toHaveBeenCalled();
  });

  it("drops a held press when the learner starts composing again before the text settled", () => {
    vi.useFakeTimers();
    const { hook, submit } = mount();
    hook.composition.onCompositionStart();
    hook.press();
    hook.composition.onCompositionEnd();
    hook.composition.onCompositionStart();
    vi.runAllTimers();
    hook.composition.onCompositionEnd();
    vi.runAllTimers();
    expect(submit).not.toHaveBeenCalled();
  });
});
