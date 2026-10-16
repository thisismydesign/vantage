import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { devSession } from "./dev-session.ts";

export default defineConfig({
  plugins: [react(), devSession(resolve(import.meta.dirname, ".."))],
  envDir: resolve(import.meta.dirname, ".."),
  resolve: { alias: { "@shared": resolve(import.meta.dirname, "..", "shared") } },
  server: { fs: { allow: [resolve(import.meta.dirname, "..")] } },
});
