/**
 * Names the app and its service worker share (Phase 10): the caches offline use reads from, the
 * background sync tag, and the message the worker sends after uploading in the background.
 */

/** Course files by URL: content-addressed files, plus each course's manifest and the course index. */
export const BUNDLE_CACHE = "nabu-bundles";
/** Fonts and the deployment's game.json, kept as they are fetched. */
export const RUNTIME_CACHE = "nabu-runtime";
/** The app shell (HTML, script, styles) of one build: "nabu-shell-<version>". */
export const SHELL_PREFIX = "nabu-shell-";
/** Background Sync tag: upload the outbox when the network is back. */
export const OUTBOX_SYNC = "nabu-outbox";

/** Worker → windows: the outbox was uploaded in the background. */
export interface SyncedMessage {
  readonly type: "nabu-synced";
  readonly courses: readonly string[];
}

export const isSyncedMessage = (data: unknown): data is SyncedMessage => typeof data === "object" && data !== null && (data as { type?: unknown }).type === "nabu-synced";
