/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    rollupOptions: {
      output: {
        // Splittear las dependencias pesadas en chunks dedicados así se
        // cachean por separado y el index queda chico. Las pantallas
        // (lazy-loaded) ya tienen su propio chunk.
        manualChunks: {
          react: ["react", "react-dom"],
          tanstack: ["@tanstack/react-query"],
          tauri: [
            "@tauri-apps/api",
            "@tauri-apps/plugin-sql",
            "@tauri-apps/plugin-fs",
            "@tauri-apps/plugin-dialog",
            "@tauri-apps/plugin-process",
            "@tauri-apps/plugin-opener",
            "@tauri-apps/plugin-updater",
          ],
          icons: ["lucide-react"],
          state: ["zustand"],
        },
      },
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globals: false,
  },
});
