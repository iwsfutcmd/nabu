import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { serviceWorker } from "./vite-sw.ts";

export default defineConfig({ plugins: [react(), serviceWorker()] });
