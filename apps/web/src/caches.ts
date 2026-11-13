/**
 * Names the app and its service worker share (Phase 10): the caches offline use reads from, the
 * background sync tag, and the messages the worker sends: after uploading in the background, and
 * when a reminder is tapped while the app is open.
 */

/** Course files by URL: content-addressed files, plus each course's manifest and the course index. */
export const BUNDLE_CACHE = "nabu-bundles";
/** Fonts and the deployment's game.json, kept as they are fetched. */
export const RUNTIME_CACHE = "nabu-runtime";
/** The app shell (HTML, script, styles) of one build: "nabu-shell-<version>". */
export const SHELL_PREFIX = "nabu-shell-";
/** Background Sync tag: upload the outbox when the network is back. */
export const OUTBOX_SYNC = "nabu-outbox";
/**
 * The META key (idb.ts) where the app notes the UI catalogs it reads, by locale (Translator's
 * `catalogs`): a new worker keeps those with the shell, and no other locale's (ADR 0119).
 */
export const UI_CATALOGS = "ui-catalogs";

/** Worker → windows: the outbox was uploaded in the background. */
export interface SyncedMessage {
  readonly type: "nabu-synced";
  readonly courses: readonly string[];
}

export const isSyncedMessage = (data: unknown): data is SyncedMessage => typeof data === "object" && data !== null && (data as { type?: unknown }).type === "nabu-synced";

/** Worker → the window it focused: a reminder was tapped, and opens this address there (S1: Home, whose Continue card it leads with). */
export interface OpenMessage {
  readonly type: "nabu-open";
  readonly url: string;
}

export const isOpenMessage = (data: unknown): data is OpenMessage =>
  typeof data === "object" && data !== null && (data as { type?: unknown }).type === "nabu-open" && typeof (data as { url?: unknown }).url === "string";
