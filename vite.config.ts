import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Tauri expects a fixed port and does not tolerate the dev server wandering.
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5273,
    strictPort: true,
    host: host ?? false,
    hmr: host ? { protocol: "ws", host, port: 5274 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    // Wolf has two windows, so two entry HTML documents.
    rollupOptions: {
      input: {
        main: new URL("./index.html", import.meta.url).pathname,
        companion: new URL("./companion.html", import.meta.url).pathname,
      },
    },
    // Tauri 2 ships Chromium/WebKitGTK; the modern target is safe everywhere.
    target:
      process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari15",
    // Vite 8 minifies with oxc; naming esbuild here would pull in a dependency
    // the bundler no longer ships.
    minify: !process.env.TAURI_ENV_DEBUG,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    outDir: "dist",
    emptyOutDir: true,
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    globals: false,
    restoreMocks: true,
    // Wolf's tests are pure logic and touch no shared state, so one jsdom per
    // worker is enough and keeps the suite fast.
    isolate: false,
  },
});
