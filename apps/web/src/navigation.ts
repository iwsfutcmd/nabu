/**
 * Going back, and leaving a session (S3 in the 2026-11 review). Routes live in the URL hash
 * (App.tsx); this module watches it for the app.
 *
 * - Every history entry the app makes or lands on notes the route before it
 *   (`history.state.nabu.from`). Leaving a finished session goes back to the course page it was
 *   opened from, instead of adding an entry after the lesson, from which Back would plan the
 *   lesson again. With some other page before it (a link from a reminder), the session's own
 *   entry becomes the course page.
 * - While a session runs it holds the route: a change (Back, the phone's back button, a link from
 *   a notification) puts the session's URL back as a new entry after the one Back reached, and the
 *   session asks, as its quit button does, whether to quit. Quitting then goes where Back was going.
 *
 * Browser only (history, location): the service worker never imports it.
 */

/** The mark the app leaves in `history.state`: the route of the entry before this one (null: none). */
interface Mark {
  readonly from: string | null;
}

const markOf = (state: unknown): Mark | undefined => {
  const nabu = typeof state === "object" && state !== null ? (state as { nabu?: unknown }).nabu : undefined;
  return typeof nabu === "object" && nabu !== null && "from" in nabu ? (nabu as Mark) : undefined;
};

const marked = (state: unknown, from: string | null): object => ({ ...(typeof state === "object" && state !== null ? state : {}), nabu: { from } });

/** A route as the address bar spells it, or as the app's links do: compared decoded, "" as "#/". */
const routeOf = (hash: string): string => {
  const h = hash === "" || hash === "#" ? "#/" : hash;
  try {
    return decodeURIComponent(h);
  } catch {
    return h;
  }
};

const hashOf = (url: string): string => {
  const at = url.indexOf("#");
  return routeOf(at < 0 ? "" : url.slice(at));
};

/** Notes the route before the current entry, unless the entry says already (one gone back or forward to). */
const mark = (from: string | null): void => {
  if (markOf(history.state) !== undefined) return;
  history.replaceState(marked(history.state, from), "");
};

interface Hold {
  /** The session's route. */
  readonly at: string;
  /** Asks whether to quit; `to` is where the learner was going (undefined: out of the app). */
  readonly ask: (to: string | undefined) => void;
}

let hold: Hold | undefined;
const listeners = new Set<() => void>();
const changed = (): void => {
  for (const listener of listeners) listener();
};

const onHashChange = (e: HashChangeEvent): void => {
  const here = routeOf(location.hash);
  if (hold !== undefined && here !== routeOf(hold.at)) {
    // Back to the session, as a new entry after the one reached: quitting goes back to that one.
    history.pushState(marked(null, here), "", hold.at);
    hold.ask(here);
    return;
  }
  mark(hashOf(e.oldURL));
  changed();
};

let watching = false;

/** Calls `listener` whenever the route changes (and is not held). The first call starts watching. */
export const watchRoute = (listener: () => void): (() => void) => {
  if (!watching) {
    watching = true;
    mark(null);
    window.addEventListener("hashchange", onHashChange);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/**
 * Holds the route while a session at `at` runs: a change asks first (`ask`, with where the
 * learner was going). Returns the release; the latest hold wins.
 */
export const holdRoute = (at: string, ask: (to: string | undefined) => void): (() => void) => {
  const mine: Hold = { at, ask };
  hold = mine;
  return () => {
    if (hold === mine) hold = undefined;
  };
};

/**
 * The phone's back button with no entry to go back to: a running session asks whether to quit
 * (true); otherwise the app may close (false).
 */
export const askToLeave = (): boolean => {
  if (hold === undefined) return false;
  hold.ask(undefined);
  return true;
};

/**
 * Leaves the screen for `to`: back, when `to` is the entry before this one, so Back from there
 * goes on to what came before; else `to` takes this entry's place.
 */
export const leave = (to: string): void => {
  // The screen leaving is the one holding the route, if any: it lets go first.
  hold = undefined;
  if (markOf(history.state)?.from === routeOf(to)) {
    history.back();
    return;
  }
  history.replaceState(history.state, "", to);
  changed();
};
