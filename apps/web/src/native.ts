/**
 * The Android and iOS apps (Capacitor, ADR 0048): practice reminders through the platform's push
 * service (FCM or APNs, by the server), opening the app from a reminder, syncing when the app
 * comes back to the foreground, and Android's back button. The plugins load only inside the
 * native shell.
 */
import type { PluginListenerHandle } from "@capacitor/core";
import { askToLeave, openAddress } from "./navigation.ts";
import { isNative } from "./platform.ts";

export type NativePlatform = "android" | "ios";

export const nativePlatform = (): NativePlatform | undefined => {
  if (!isNative()) return undefined;
  const p = (globalThis as { Capacitor?: { getPlatform?: () => string } }).Capacitor?.getPlatform?.();
  return p === "android" || p === "ios" ? p : undefined;
};

const TOKEN = "nabu.native-push-token";

/** The device token this app registered with the server, kept on the device (a per-device setting). */
export const savedToken = (): string | undefined => {
  try {
    return localStorage.getItem(TOKEN) ?? undefined;
  } catch {
    return undefined;
  }
};

const saveToken = (token: string | undefined): void => {
  try {
    if (token === undefined) localStorage.removeItem(TOKEN);
    else localStorage.setItem(TOKEN, token);
  } catch {
    // Storage unavailable: the switch shows off next time; the server still has the token.
  }
};

/**
 * Native start-up: sync on resume, open the app where a tapped reminder points, and Android's back
 * button. Back goes back as a browser's does, so a running session asks before it is left and a
 * finished one is never played again (navigation.ts, S3); with nothing to go back to, a running
 * session still asks, and otherwise the app goes to the background, as Android's own Back does.
 */
export const startNative = async (onResume: () => void): Promise<void> => {
  if (!isNative()) return;
  const { App } = await import("@capacitor/app");
  await App.addListener("resume", onResume);
  await App.addListener("backButton", ({ canGoBack }) => {
    if (canGoBack) window.history.back();
    else if (!askToLeave()) void App.minimizeApp();
  });
  const { PushNotifications } = await import("@capacitor/push-notifications");
  await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    const url = (action.notification.data as { url?: unknown } | undefined)?.url;
    if (typeof url === "string") openAddress(url);
  });
};

export type RegisterResult = { readonly token: string } | { readonly error: "denied" | "failed" };

/** Asks for permission and registers with the platform's push service; resolves with the device token. */
export const registerDevice = async (): Promise<RegisterResult> => {
  const { PushNotifications } = await import("@capacitor/push-notifications");
  let permission = await PushNotifications.checkPermissions();
  if (permission.receive === "prompt" || permission.receive === "prompt-with-rationale") permission = await PushNotifications.requestPermissions();
  if (permission.receive !== "granted") return { error: "denied" };
  const handles: PluginListenerHandle[] = [];
  const result = await new Promise<RegisterResult>((resolve) => {
    void Promise.all([
      PushNotifications.addListener("registration", (t) => resolve({ token: t.value })),
      PushNotifications.addListener("registrationError", () => resolve({ error: "failed" })),
    ]).then((h) => {
      handles.push(...h);
      return PushNotifications.register();
    });
  });
  for (const h of handles) await h.remove();
  if ("token" in result) saveToken(result.token);
  return result;
};

/** Stops reminders on this device. */
export const unregisterDevice = async (): Promise<void> => {
  const { PushNotifications } = await import("@capacitor/push-notifications");
  await PushNotifications.unregister().catch(() => undefined);
  saveToken(undefined);
};
