import { llmsTxt } from "./llms.ts";

type Env = { SUPABASE_URL: string; ASSETS: { fetch: typeof fetch } };

// Runs for /llms.txt, and for page addresses the host does not serve itself: it falls back to the app only for browser navigations, so link previews and crawlers reach the Worker and get it here.
export default {
  fetch: (request: Request, env: Env) =>
    new URL(request.url).pathname === "/llms.txt"
      ? llmsTxt(env.SUPABASE_URL)
      : env.ASSETS.fetch(new Request(new URL("/", request.url), request)),
};
