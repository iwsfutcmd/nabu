/**
 * Where the app runs. Capacitor's native shell (Phase 10) injects `window.Capacitor`; there the
 * whole build, courses included, ships inside the app, so the browser's offline machinery (the
 * service worker, downloads) stays off.
 */
export const isNative = (): boolean => (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.() === true;
