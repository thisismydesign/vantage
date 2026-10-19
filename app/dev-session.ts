import { createClient } from "@supabase/supabase-js";
import { loadEnv, type Plugin } from "vite";

// Lets local work skip typing a password. A Vite plugin because only the Vite process reads the server key from .env.development.
export function devSession(envDir: string): Plugin {
  return {
    name: "vantage-dev-session",
    apply: "serve",
    configureServer(server) {
      const env = loadEnv(server.config.mode, envDir, "");
      server.middlewares.use("/__dev/session", async (req, res) => {
        const origin = req.headers.origin;
        const site = req.headers["sec-fetch-site"];
        const local =
          (!origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) &&
          (!site || site === "same-origin" || site === "none");
        if (req.method !== "GET" || !local) {
          res.statusCode = 403;
          res.end();
          return;
        }
        const { SUPABASE_URL, SUPABASE_SECRET_KEY, VITE_SUPABASE_KEY, VANTAGE_DEV_EMAIL } = env;
        if (!SUPABASE_URL || !SUPABASE_SECRET_KEY || !VITE_SUPABASE_KEY || !VANTAGE_DEV_EMAIL) {
          res.statusCode = 404;
          res.end("Set SUPABASE_URL, SUPABASE_SECRET_KEY, VITE_SUPABASE_KEY and VANTAGE_DEV_EMAIL");
          return;
        }
        try {
          const admin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
            auth: { persistSession: false },
          });
          const link = await admin.auth.admin.generateLink({
            type: "magiclink",
            email: VANTAGE_DEV_EMAIL,
          });
          if (link.error) throw link.error;
          const anon = createClient(SUPABASE_URL, VITE_SUPABASE_KEY, {
            auth: { persistSession: false },
          });
          const otp = await anon.auth.verifyOtp({
            type: "magiclink",
            token_hash: link.data.properties.hashed_token,
          });
          if (otp.error) throw otp.error;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(otp.data.session));
        } catch (e) {
          res.statusCode = 500;
          res.end((e as Error).message);
        }
      });
    },
  };
}
