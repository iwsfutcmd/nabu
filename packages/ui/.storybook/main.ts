import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.tsx"],
  framework: { name: "@storybook/react-vite", options: {} },
  core: { disableTelemetry: true, disableWhatsNewNotifications: true },
  // The compiled fixture courses (pnpm bundles) for the player stories.
  staticDirs: [{ from: "../../../apps/web/public/bundles", to: "/bundles" }],
};

export default config;
