/**
 * Whether debug mode is on (Debug.tsx says what it does). It is per device: Preferences turns it on
 * and off, as `?debug=1` and `?debug=0` in the address do. No React here, so Preferences and the
 * debug screens can both use it.
 */
const DEBUG = "nabu.debug";

/** Reads ?debug=1 / ?debug=0 once and remembers it on this device. */
export const debugOn = (): boolean => {
  const asked = new URLSearchParams(window.location.search).get("debug");
  try {
    if (asked === "1") localStorage.setItem(DEBUG, "1");
    if (asked === "0") localStorage.removeItem(DEBUG);
    return localStorage.getItem(DEBUG) === "1";
  } catch {
    return asked === "1";
  }
};

/** Debug mode as the page opened: read once, so every screen agrees until the page opens again. */
export const debugMode = debugOn();

/**
 * Turns debug mode on or off on this device, and opens the page again with it so (every screen
 * reads it once, as the page opens), without a ?debug= in the address that would undo the choice.
 */
export const setDebug = (on: boolean): void => {
  try {
    if (on) localStorage.setItem(DEBUG, "1");
    else localStorage.removeItem(DEBUG);
  } catch {
    // Storage unavailable: only the address can keep it on.
  }
  const url = new URL(window.location.href);
  url.searchParams.delete("debug");
  if (on && !storable()) url.searchParams.set("debug", "1");
  // The same address with a fragment would only scroll: load it again instead.
  if (url.href === window.location.href) window.location.reload();
  else window.location.replace(url.href);
};

/** Whether this device keeps debug mode (storage may be off: private windows, blocked site data). */
const storable = (): boolean => {
  try {
    return localStorage.getItem(DEBUG) === "1";
  } catch {
    return false;
  }
};

/** Leaves debug mode on this device, and opens the page again without it. */
export const leaveDebug = (): void => setDebug(false);
