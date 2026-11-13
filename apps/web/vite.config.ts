import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { audioCheck } from "./audio-check.ts";
import { manifest } from "./vite-manifest.ts";
import { serviceWorker } from "./vite-sw.ts";

export default defineConfig({ plugins: [react(), manifest(), serviceWorker(), audioCheck()] });
