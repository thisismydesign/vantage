import { llmsTxt } from "./llms.ts";

// Runs only for the paths in run_worker_first; everything else is a static asset.
export default {
  fetch: (_request: Request, env: { SUPABASE_URL: string }) => llmsTxt(env.SUPABASE_URL),
};
