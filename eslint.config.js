import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettierRecommended from "eslint-plugin-prettier/recommended";

export default tseslint.config(
  { ignores: ["node_modules", "app/dist", "supabase/.temp"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettierRecommended,
);
