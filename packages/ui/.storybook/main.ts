import type { StorybookConfig } from "@storybook/react-vite";

/**
 * The compiled fixture courses (pnpm bundles) for the player stories. Storybook carries its own
 * copy unless NABU_STORYBOOK_BUNDLES says where they are served instead (src/demo/bundles.ts):
 * Pages points it at the demo's, so the site carries the courses' clips once.
 */
const bundles = process.env["NABU_STORYBOOK_BUNDLES"];

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.tsx"],
  framework: { name: "@storybook/react-vite", options: {} },
  core: { disableTelemetry: true, disableWhatsNewNotifications: true },
  staticDirs: bundles === undefined ? [{ from: "../../../apps/web/public/bundles", to: "/bundles" }] : [],
  viteFinal: (vite) => ({ ...vite, define: { ...vite.define, __NABU_BUNDLES__: JSON.stringify(bundles ?? "bundles/") } }),
};

export default config;
