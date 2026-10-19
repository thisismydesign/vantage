import { dirname, relative, resolve } from "node:path";
import type { Rule } from "eslint";

// Each side imports only itself and shared/, so neither depends on the other's internals. shared/ imports nothing and uses no runtime's own globals: it must load in the browser, Deno and Node alike. Tooling elsewhere may import anything.

const ROOT = resolve(import.meta.dirname, "..");
const ALIASES: Record<string, string> = { "@shared/": "shared/" };
const ALLOWED: Record<string, string[]> = {
  app: ["app", "shared"],
  "supabase/functions": ["supabase/functions", "shared"],
  shared: ["shared"],
};

const RUNTIME_GLOBALS = new Set([
  "Deno",
  "process",
  "Buffer",
  "window",
  "document",
  "localStorage",
]);

const zoneOf = (path: string) =>
  Object.keys(ALLOWED).find((zone) => path === zone || path.startsWith(`${zone}/`));

/** Root-relative with forward slashes; undefined for packages. */
function target(specifier: string, importer: string): string | undefined {
  const alias = Object.keys(ALIASES).find((a) => specifier.startsWith(a));
  if (alias) return ALIASES[alias] + specifier.slice(alias.length);
  if (!specifier.startsWith(".") && !specifier.startsWith("/")) return undefined;
  return relative(ROOT, resolve(dirname(importer), specifier)).replaceAll("\\", "/");
}

const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    messages: {
      crossing: "{{from}}/ MUST NOT import {{to}}; put what both sides need in shared/.",
      portable: "shared/ MUST NOT use {{name}}; it runs in the browser, Deno and Node.",
    },
    schema: [],
  },
  create(context) {
    const from = zoneOf(relative(ROOT, context.filename).replaceAll("\\", "/"));
    if (!from) return {};
    const check = (source: unknown, node: Rule.Node) => {
      const specifier = (source as { value?: unknown } | null)?.value;
      if (typeof specifier !== "string") return;
      const to = target(specifier, context.filename);
      if (to === undefined) {
        if (from === "shared")
          context.report({ node, messageId: "portable", data: { name: specifier } });
        return;
      }
      const zone = zoneOf(to);
      if (!ALLOWED[from].some((allowed) => zone === allowed))
        context.report({ node, messageId: "crossing", data: { from, to } });
    };
    return {
      ImportDeclaration: (node) => check(node.source, node),
      ExportAllDeclaration: (node) => check(node.source, node),
      ExportNamedDeclaration: (node) => check(node.source, node),
      ImportExpression: (node) => check(node.source, node),
      "Program:exit"(node) {
        if (from !== "shared") return;
        const scope = context.sourceCode.getScope(node);
        const declared = scope.variables.flatMap((v) => v.references);
        for (const { identifier } of [...declared, ...scope.through])
          if (RUNTIME_GLOBALS.has(identifier.name))
            context.report({
              node: identifier,
              messageId: "portable",
              data: { name: identifier.name },
            });
      },
    };
  },
};

export default rule;
