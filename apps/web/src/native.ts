/**
 * The Android and iOS apps (Capacitor, ADR 0048): practice reminders through the platform's push
 * service (FCM or APNs, by the server), opening the app from a reminder, and syncing when the app
 * comes back to the foreground. The plugins load only inside the native shell.
 */
import type { PluginListenerHandle } from "@capacitor/core";
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

/** Native start-up: sync on resume, and open the app where a tapped reminder points. */
export const startNative = async (onResume: () => void): Promise<void> => {
  if (!isNative()) return;
  const { App } = await import("@capacitor/app");
  await App.addListener("resume", onResume);
  const { PushNotifications } = await import("@capacitor/push-notifications");
  await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    const url = (action.notification.data as { url?: unknown } | undefined)?.url;
    if (typeof url === "string") window.location.hash = new URL(url, window.location.href).hash || "#/";
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
