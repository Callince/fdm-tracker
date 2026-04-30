import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

const apiBase = process.env.FDM_API_BASE ?? "https://api.fourdm.services";
// Used by electron-updater to authenticate against the private GitHub repo
// at runtime. Bake it in only when CI provides one — local dev never has it.
const ghToken = process.env.FDM_GH_TOKEN ?? "";
// Sentry DSN — empty string disables Sentry (local dev).
const sentryDsn = process.env.FDM_SENTRY_DSN ?? "";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: { input: { index: resolve(__dirname, "src/main/index.ts") } },
    },
    resolve: { alias: { "@shared": resolve(__dirname, "src/shared") } },
    define: {
      __FDM_API_BASE__: JSON.stringify(apiBase),
      __FDM_GH_TOKEN__: JSON.stringify(ghToken),
      __FDM_SENTRY_DSN__: JSON.stringify(sentryDsn),
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: { input: { index: resolve(__dirname, "src/preload/index.ts") } },
    },
    resolve: { alias: { "@shared": resolve(__dirname, "src/shared") } },
  },
  renderer: {
    root: resolve(__dirname, "src/renderer"),
    plugins: [react()],
    build: {
      rollupOptions: { input: { index: resolve(__dirname, "src/renderer/index.html") } },
    },
    resolve: {
      alias: {
        "@": resolve(__dirname, "src/renderer/src"),
        "@shared": resolve(__dirname, "src/shared"),
      },
    },
    define: {
      __FDM_SENTRY_DSN__: JSON.stringify(sentryDsn),
    },
  },
});
