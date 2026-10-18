import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettierRecommended from "eslint-plugin-prettier/recommended";
import wrappedComments from "./lint/wrapped-comments.ts";

export default tseslint.config(
  { ignores: ["node_modules", "app/dist", "supabase/.temp", "test-results", "playwright-report"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettierRecommended,
  {
    plugins: { vantage: { rules: { "wrapped-comments": wrappedComments } } },
    rules: { "vantage/wrapped-comments": "error" },
  },
);
