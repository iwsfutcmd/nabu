import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { audioCheck } from "./audio-check.ts";
import { catalogs } from "./vite-catalogs.ts";
import { courses } from "./vite-courses.ts";
import { manifest } from "./vite-manifest.ts";
import { serviceWorker } from "./vite-sw.ts";

/**
 * This build of the app (`__NABU_BUILD__`): NABU_BUILD where the deployment names it, else when it
 * was built. After an update the app sends once more what the server rejected before (D10).
 */
const build = process.env["NABU_BUILD"] ?? new Date().toISOString();

export default defineConfig({ define: { __NABU_BUILD__: JSON.stringify(build) }, plugins: [catalogs(), react(), manifest(), serviceWorker(), audioCheck(), courses()] });
