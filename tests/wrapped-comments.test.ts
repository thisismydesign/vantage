import { describe, it } from "node:test";
import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import rule from "../lint/wrapped-comments.ts";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const wrapped = { messageId: "wrapped" };

new RuleTester({ languageOptions: { parser: tseslint.parser } }).run("wrapped-comments", rule, {
  valid: [
    "// Loads the config.\n// Returns null when missing; the caller retries.\nconst a = 1;",
    "// - first\n// - second\n// 1) third\n// 2. fourth",
    "// eslint-disable-next-line no-console\n// config = load(path)\n// foo.call(x)\n// const b = load(path);",
    "// Reports \"No capacity.\"\n// Reports 'Sold out!'\n// Retries later (capacity may change.)\n// Done",
    "//   Options   [15:00   15:15]\n//   Booking 1    2       2\n//   Booking 2            2",
    "const a = 1; // trailing and\n// the next line",
    "// One paragraph ends here\n\n// and this is another comment",
    "/** One line. */",
    "/**\n * Loads the config.\n * Returns null when missing.\n * @param path where it lives\n */",
    "// TODO:\n// Something.",
    "/**\n * Few kinds\n * results   — the company reports\n * corporate — capital and structure\n * Mirrored by the check.\n */",
  ],
  invalid: [
    {
      code: "// The ratio is the available\n// capacity over the total.",
      output: "// The ratio is the available capacity over the total.",
      errors: [wrapped],
    },
    {
      code: "  // One sentence;\n  // still the same one, broken\n  // twice.\n  f();",
      output: "  // One sentence; still the same one, broken twice.\n  f();",
      errors: [wrapped, wrapped],
    },
    {
      code: "/**\n * The ratio is the available\n * capacity over the total.\n */",
      output: "/**\n * The ratio is the available capacity over the total.\n */",
      errors: [wrapped],
    },
    {
      code: "/* The ratio is the available\n   capacity over the total. */",
      output: "/* The ratio is the available capacity over the total. */",
      errors: [wrapped],
    },
  ],
});
