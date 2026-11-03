/**
 * The native shell (gameplan §16 Phase 10, ADR 0048). It loads the web app's production build
 * (apps/web/dist) from inside the app, courses included, so the app works offline from the first
 * launch. The sync server is the build's VITE_NABU_API.
 *
 * `appId` is the store identity of this build: a deployment publishing its own app changes it
 * (and NABU_APNS_TOPIC on its server to match).
 */
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "org.nabu.app",
  appName: "Nabu",
  webDir: "../web/dist",
  plugins: {
    PushNotifications: { presentationOptions: ["alert", "sound"] },
  },
};

export default config;
