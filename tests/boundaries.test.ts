import { resolve } from "node:path";
import { describe, it } from "node:test";
import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import rule from "../lint/boundaries.ts";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const at = (path: string) => resolve(import.meta.dirname, "..", path);
const app = at("app/src/lib/api.ts");
const fn = at("supabase/functions/vantage/index.ts");
const shared = at("shared/api.ts");

new RuleTester({ languageOptions: { parser: tseslint.parser } }).run("boundaries", rule, {
  valid: [
    { filename: app, code: 'import { x } from "./supabase.ts";' },
    { filename: app, code: 'import { x } from "@shared/api.ts";' },
    { filename: app, code: 'import { x } from "../../../shared/keys.ts";' },
    { filename: app, code: 'import { useState } from "react";' },
    { filename: fn, code: 'import { x } from "../_shared/fx.ts";' },
    { filename: fn, code: 'import { x } from "../../../shared/api.ts";' },
    { filename: fn, code: 'import { createClient } from "npm:@supabase/supabase-js@2";' },
    { filename: shared, code: 'import type { x } from "./ranges.ts";' },
    { filename: shared, code: "const process = 1; export const p = process;" },
    {
      filename: at("supabase/seed/dev-account.ts"),
      code: 'import { x } from "../../app/src/lib/demo/data.ts";',
    },
    {
      filename: at("tests/fx.test.ts"),
      code: 'import { x } from "../supabase/functions/_shared/fx.ts";',
    },
  ],
  invalid: [
    {
      filename: app,
      code: 'import { x } from "../../../supabase/functions/_shared/fx.ts";',
      errors: [{ messageId: "crossing" }],
    },
    {
      filename: app,
      code: 'export { x } from "../../../supabase/functions/_shared/fx.ts";',
      errors: [{ messageId: "crossing" }],
    },
    {
      filename: app,
      code: 'const m = import("../../../supabase/seed/dev-account.ts");',
      errors: [{ messageId: "crossing" }],
    },
    {
      filename: fn,
      code: 'import { x } from "../../../app/src/lib/demo/data.ts";',
      errors: [{ messageId: "crossing" }],
    },
    {
      filename: shared,
      code: 'import { x } from "../supabase/functions/_shared/fx.ts";',
      errors: [{ messageId: "crossing" }],
    },
    {
      filename: shared,
      code: 'import { x } from "../app/src/lib/api.ts";',
      errors: [{ messageId: "crossing" }],
    },
    {
      filename: shared,
      code: "export const env = process.env.X;",
      errors: [{ messageId: "portable" }],
    },
    {
      filename: shared,
      code: 'export const read = () => localStorage.getItem("x");',
      errors: [{ messageId: "portable" }],
    },
    {
      filename: shared,
      code: 'import { x } from "node:crypto";',
      errors: [{ messageId: "portable" }],
    },
  ],
});
