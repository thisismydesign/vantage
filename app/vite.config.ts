import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Connect, type Plugin } from "vite";
import { devSession } from "./dev-session.ts";
import { llmsTxt } from "./llms.ts";

// What worker.ts serves in production, for dev and preview.
function llms(envDir: string): Plugin {
  const serve = (middlewares: Connect.Server, mode: string) => {
    const { VITE_SUPABASE_URL } = loadEnv(mode, envDir, "VITE_");
    middlewares.use("/llms.txt", async (_req, res) => {
      const response = await llmsTxt(VITE_SUPABASE_URL);
      res.statusCode = response.status;
      response.headers.forEach((value, name) => res.setHeader(name, value));
      res.end(await response.text());
    });
  };
  return {
    name: "vantage-llms",
    configureServer: (server) => serve(server.middlewares, server.config.mode),
    configurePreviewServer: (server) => serve(server.middlewares, server.config.mode),
  };
}

export default defineConfig({
  plugins: [
    react(),
    devSession(resolve(import.meta.dirname, "..")),
    llms(resolve(import.meta.dirname, "..")),
  ],
  envDir: resolve(import.meta.dirname, ".."),
  resolve: { alias: { "@shared": resolve(import.meta.dirname, "..", "shared") } },
  server: { fs: { allow: [resolve(import.meta.dirname, "..")] } },
});
