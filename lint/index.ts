import { readdirSync } from "node:fs";
import type { ESLint, Linter, Rule } from "eslint";

// Every rule file here is on as an error, so a new rule needs no config.

const names = readdirSync(import.meta.dirname)
  .filter((file) => file.endsWith(".ts") && file !== "index.ts")
  .map((file) => file.slice(0, -".ts".length));

const rules: Record<string, Rule.RuleModule> = Object.fromEntries(
  await Promise.all(
    names.map(async (name) => [name, (await import(`./${name}.ts`)).default as Rule.RuleModule]),
  ),
);

const plugin: ESLint.Plugin = { meta: { name: "vantage" }, rules };

export const recommended: Linter.Config = {
  plugins: { vantage: plugin },
  rules: Object.fromEntries(names.map((name) => [`vantage/${name}`, "error"])),
};

export default plugin;
